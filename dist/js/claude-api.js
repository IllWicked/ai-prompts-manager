/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLAUDE API MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции взаимодействия с Claude через Tauri API.
 * Использует CDP (Chrome DevTools Protocol) для выполнения скриптов с возвратом результата.
 * 
 * CDP Timeouts:
 *   - 5 сек: быстрые DOM операции (чтение cookie, querySelector)
 *   - 10 сек: стандартные операции (по умолчанию)
 *   - 30 сек: HTTP запросы к API Claude (создание проекта)
 * 
 * Зависимости:
 *   - window.AppState (shared state)
 *   - Алиасы: isClaudeVisible, activeClaudeTab, generatingTabs, 
 *             tabUrls, panelRatio, isResetting, currentTab, activeProject
 *   - delay() из utils.js
 *   - showToast() из toast.js
 *   - EMBEDDED_SCRIPTS из embedded-scripts.js
 *   - STORAGE_KEYS из config.js
 *   - getTabBlocks(), getAllTabs() из index.html
 *   - getBlockScripts(), getBlockAutomationFlags(), blockAttachments, 
 *     clearBlockAttachments() из blocks.js
 *   - updateClaudeState(), updateClaudeUI(), updateResizer(), createResizer(),
 *     updateWorkflowChatButtons() из claude-ui.js
 *   - saveClaudeSettings(), loadClaudeSettings() из claude-state.js
 *   - getWorkflowContainer() из index.html
 *   - Tauri API: window.__TAURI__.core.invoke, window.__TAURI__.event.listen
 * 
 * Экспортирует (глобально):
 *   - evalInClaude(tab, script)
 *   - navigateClaude(tab, url)
 *   - generateProjectName()
 *   - getOrganizationId(tab) — получение org_id из Claude
 *   - createProjectViaAPI(tab) — создание проекта через внутренний API
 *   - createNewProject(tab)
 *   - attachScriptsToMessage(tab, scripts)
 *   - attachFilesToMessage(tab, files)
 *   - sendNodeToClaude(index, chatTab)
 *   - sendTextToClaude(text)
 *   - toggleClaude()
 *   - switchClaudeTab(tab)
 *   - injectGenerationMonitor(tab)
 *   - checkAllGenerationStatus()
 *   - startGenerationMonitor()
 *   - stopGenerationMonitor()
 *   - newChatInTab(tab)
 *   - restoreClaudeState()
 *   - initClaudeHandlers()
 *   - startProject(uuid, name, ownerTab)
 *   - finishProject()
 *   - getProjectUUIDFromUrl(url)
 *   - restoreProjectState()
 *   - uploadToProjectKnowledge(filePath, filename)
 *   - uploadSkillsToClaude(onProgress)
 *   
 * Перенесено в claude-state.js:
 *   - isProjectActive()
 *   - isCurrentTabProjectOwner()
 */

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION MONITOR INTERVALS
// ═══════════════════════════════════════════════════════════════════════════

let generationCheckInterval = null;
let urlSaveInterval = null;

// Debounce: сколько подряд false нужно увидеть чтобы считать генерацию завершённой
// Флаг защиты от двойной инициализации отслеживания URL
let projectUrlTrackingInitialized = false;

// Флаг программной навигации (не сбрасывать название при переходе на /new)
let programmaticNavigation = false;

// Per-tab send state: { sending, abort, stage, context, error }
const _sendState = {};
function _getSendState(tab) {
    if (!_sendState[tab]) _sendState[tab] = { sending: false, abort: null, stage: null, context: null, error: null };
    return _sendState[tab];
}

// ═══════════════════════════════════════════════════════════════════════════
// ЦЕНТРАЛИЗОВАННЫЕ СЕЛЕКТОРЫ CLAUDE
// ═══════════════════════════════════════════════════════════════════════════
// 
// Селекторы определены в src-tauri/scripts/selectors.json
// В WebView доступны через window._s (устанавливается init script)
// Все evaluate-скрипты используют window._s напрямую
//
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// CDP RESILIENCE LAYER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Адаптивный таймаут: отслеживает историю успехов/неудач
 * и корректирует таймаут автоматически
 */
const CdpTimeout = {
    // Базовые таймауты по типу операции
    BASE: { fast: 5, standard: 10, slow: 30 },
    
    // Множитель адаптации (1.0 = нормально, растёт при ошибках)
    _multiplier: 1.0,
    
    // Счётчик последовательных ошибок
    _consecutiveErrors: 0,
    
    /** Получить адаптированный таймаут */
    get(type = 'standard') {
        const base = this.BASE[type] || this.BASE.standard;
        return Math.ceil(base * this._multiplier);
    },
    
    /** Сообщить об успехе — возвращаем множитель к норме */
    success() {
        this._consecutiveErrors = 0;
        // Плавное снижение к 1.0
        if (this._multiplier > 1.0) {
            this._multiplier = Math.max(1.0, this._multiplier * 0.8);
        }
    },
    
    /** Сообщить об ошибке — увеличиваем множитель */
    failure() {
        this._consecutiveErrors++;
        // Рост множителя: 1.0 → 1.5 → 2.0 → 2.5, max 3.0
        this._multiplier = Math.min(3.0, 1.0 + this._consecutiveErrors * 0.5);
    },
    
    /** Сброс (при переключении таба или пересоздании webview) */
    reset() {
        this._multiplier = 1.0;
        this._consecutiveErrors = 0;
    }
};

/**
 * Центральная функция CDP eval с retry и exponential backoff
 * Заменяет прямые вызовы eval_in_claude_with_result
 * 
 * @param {number} tab - номер таба
 * @param {string} script - JavaScript для выполнения
 * @param {Object} [options]
 * @param {string} [options.timeoutType='standard'] - тип таймаута: fast|standard|slow
 * @param {number} [options.timeoutSecs] - явный таймаут (перебивает timeoutType)
 * @param {number} [options.maxRetries=2] - максимум повторов (0 = без повторов)
 * @param {number} [options.baseDelay=300] - базовая задержка между повторами (мс)
 * @param {boolean} [options.silent=false] - не логировать ошибки
 * @returns {Promise<string>} - результат eval
 */
async function cdpEval(tab, script, options = {}) {
    const {
        timeoutType = 'standard',
        timeoutSecs,
        maxRetries = 2,
        baseDelay = 300,
        silent = false
    } = options;
    
    const timeout = timeoutSecs || CdpTimeout.get(timeoutType);
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await window.__TAURI__.core.invoke('eval_in_claude_with_result', {
                tab,
                script,
                timeoutSecs: timeout
            });
            
            CdpTimeout.success();
            return result;
        } catch (e) {
            lastError = e;
            CdpTimeout.failure();
            
            if (attempt < maxRetries) {
                // Exponential backoff: 300ms, 600ms, 1200ms...
                const delayMs = baseDelay * Math.pow(2, attempt);
                if (!silent) {
                    log(`CDP retry ${attempt + 1}/${maxRetries} after ${delayMs}ms:`, e);
                }
                await delay(delayMs);
            }
        }
    }
    
    // Все попытки исчерпаны
    throw lastError;
}

/**
 * Обёртка для многошаговых CDP-операций с атомарными шагами
 * Каждый шаг — отдельная функция. При ошибке на шаге N:
 * - Возвращает результат последнего успешного шага
 * - Вызывает rollback если предоставлен
 * 
 * @param {Array<{name: string, fn: Function, rollback?: Function}>} steps
 * @returns {Promise<{success: boolean, step: string, result: any, error?: string}>}
 */
async function cdpPipeline(steps) {
    let lastResult = null;
    let completedSteps = [];
    
    for (const step of steps) {
        try {
            lastResult = await step.fn(lastResult);
            completedSteps.push(step.name);
        } catch (e) {
            // Rollback выполненных шагов в обратном порядке
            for (let i = completedSteps.length - 1; i >= 0; i--) {
                const completed = steps.find(s => s.name === completedSteps[i]);
                if (completed?.rollback) {
                    try { await completed.rollback(); } catch (_) { /* silent */ }
                }
            }
            
            return {
                success: false,
                step: step.name,
                result: lastResult,
                error: String(e)
            };
        }
    }
    
    return { success: true, step: steps[steps.length - 1]?.name, result: lastResult };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE INTERNAL API (fetch-based)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Кэш organization_id
 */
let cachedOrgId = null;

/**
 * Сброс кэша organization_id
 * Вызывать при подозрении на смену аккаунта
 */
function invalidateOrgCache() {
    cachedOrgId = null;
}

/**
 * Получить organization_id из Claude
 * Кэшируется после первого получения
 * Читает из cookie через CDP (без обращения к внутренним API)
 */
async function getOrganizationId(tab) {
    if (cachedOrgId) {
        return cachedOrgId;
    }
    
    // Читаем org_id из cookie через CDP
    const script = `
        (function() {
            try {
                const match = document.cookie.match(/lastActiveOrg=([a-f0-9-]+)/i);
                return match ? match[1] : null;
            } catch (e) {
                return null;
            }
        })();
    `;
    
    // Несколько попыток — CDP может быть не готов сразу после навигации
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const result = await cdpEval(tab, script, { 
                timeoutType: 'fast', maxRetries: 0, silent: true 
            });
            const orgId = JSON.parse(result);
            
            if (orgId && typeof orgId === 'string' && /^[a-f0-9-]+$/i.test(orgId)) {
                cachedOrgId = orgId;
                return cachedOrgId;
            }
        } catch (e) {
            // Retry after delay
        }
        if (attempt < 2) await delay(500);
    }
    
    return null;
}

/**
 * Создать проект через внутренний API Claude
 * @param {number} tab - номер таба
 * @returns {Promise<{success: boolean, uuid: string|null, name: string|null}>}
 */
async function createProjectViaAPI(tab) {
    const projectName = generateProjectName();
    const orgId = await getOrganizationId(tab);
    
    if (!orgId) {
        return { success: false, uuid: null, name: null };
    }
    
    const script = `
        (async function() {
            try {
                const response = await fetch('/api/organizations/${orgId}/projects', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: ${JSON.stringify(projectName)},
                        description: '',
                        is_private: true
                    })
                });
                
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                
                const data = await response.json();
                return { success: true, uuid: data.uuid };
            } catch (e) {
                return { success: false, uuid: null, error: e.message };
            }
        })();
    `;
    
    try {
        const resultStr = await cdpEval(tab, script, {
            timeoutType: 'slow', maxRetries: 2
        });
        const result = JSON.parse(resultStr);
        
        if (result && result.success && result.uuid) {
            await navigateClaude(tab, `https://claude.ai/project/${result.uuid}`);
            return { success: true, uuid: result.uuid, name: projectName };
        }
    } catch (e) {
        // CDP failed
    }
    
    return { success: false, uuid: null, name: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE AUTOMATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Выполнить скрипт в Claude webview
 */
async function evalInClaude(tab, script) {
    return await window.__TAURI__.core.invoke('eval_in_claude', { tab, script });
}

/**
 * Навигация Claude на URL
 * Ждёт реальной загрузки страницы через событие page-loaded
 */
async function navigateClaude(tab, url) {
    // Создаём Promise который разрешится когда страница РЕАЛЬНО загрузится
    // Событие claude-page-loaded эмитится из on_page_load callback в Rust
    let resolved = false;
    let resolvePromise;
    
    // Сначала подписываемся (await!) чтобы гарантировать наличие unlisten
    const unlisten = await window.__TAURI__.event.listen('claude-page-loaded', (event) => {
        // Проверяем что это наш таб
        if (!resolved && event.payload?.tab === tab) {
            resolved = true;
            clearTimeout(timeout);
            unlisten();
            resolvePromise(true);
        }
    });
    
    const pageLoadPromise = new Promise((resolve) => {
        resolvePromise = resolve;
    });
    
    // Теперь создаём timeout - unlisten гарантированно существует
    const timeout = setTimeout(() => {
        if (!resolved) {
            resolved = true;
            unlisten();
            resolvePromise(false);
        }
    }, 15000);
    
    await window.__TAURI__.core.invoke('navigate_claude_tab', { tab, url });
    
    // Ждём события загрузки страницы (от on_page_load в Rust)
    await pageLoadPromise;
    
    // Ждём появления input (страница загрузилась, но React может ещё рендериться)
    await waitForClaudeInput(tab);
    
    // Переинжектим монитор (и интерсептор загрузки файлов)
    await injectGenerationMonitor(tab);
}

/**
 * Генерация названия проекта с датой
 */
function generateProjectName() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const datetime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    
    // Получаем имя текущей вкладки
    const tabs = getAllTabs();
    const tabName = tabs[currentTab]?.name || 'default';
    
    // Очищаем имя от спецсимволов
    const safeName = tabName
        .replace(/[^a-zA-Z0-9а-яА-ЯёЁ\-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 30);
    
    return `${datetime}_${safeName}`;
}

/**
 * Создать новый проект в Claude
 * Использует внутренний API Claude
 */
async function createNewProject(tab) {
    try {
        const result = await createProjectViaAPI(tab);
        return result;
    } catch (e) {
        return { success: false, uuid: null, name: null };
    }
}

/**
 * Прикрепить скрипты к сообщению Claude
 */
/**
 * Прикрепить скрипты и файлы к сообщению Claude (batch — один eval)
 */
async function attachAllFiles(tab, scripts, files) {
    const paths = [];
    
    // Скрипты → temp файлы → пути
    for (const scriptKey of scripts) {
        const script = EMBEDDED_SCRIPTS[scriptKey];
        if (!script) continue;
        try {
            const tempPath = await window.__TAURI__.core.invoke('write_temp_file', {
                filename: script.name,
                content: script.content
            });
            paths.push(tempPath);
        } catch (e) {}
    }
    
    // Файлы → пути
    for (const file of files) {
        paths.push(file.path);
    }
    
    if (paths.length === 0) return;
    
    // Один вызов → один eval → последовательная обработка внутри
    await window.__TAURI__.core.invoke('attach_files_batch', { tab, paths });
}

// ═══════════════════════════════════════════════════════════════════════════
// WAIT FOR CLAUDE INPUT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ожидание загрузки input-поля Claude через polling
 * @param {number} tab - Номер таба
 * @param {number} timeout - Максимальное время ожидания (мс)
 * @returns {Promise<boolean>} - true если поле найдено
 */
async function waitForClaudeInput(tab, timeout = 15000) {
    // Используем централизованные селекторы через window._s (установлен в WebView)
    const script = `
        (function() {
            const SEL = window._s;
            const pmSelector = SEL?.input?.proseMirror || '.ProseMirror';
            const pmElement = document.querySelector(pmSelector);
            // Проверяем что элемент есть И editor полностью инициализирован
            if (pmElement && pmElement.editor && pmElement.editor.commands && typeof pmElement.editor.commands.insertContent === 'function') {
                return true;
            }
            // Fallback для старых версий
            const ceSelector = SEL?.input?.contentEditable || '[contenteditable="true"]';
            const taSelector = SEL?.input?.textarea || 'textarea';
            const el = document.querySelector(ceSelector) || document.querySelector(taSelector);
            return !!el;
        })();
    `;
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const result = await cdpEval(tab, script, {
                timeoutType: 'fast', maxRetries: 0, silent: true
            });
            if (result === 'true' || result === true) {
                // Даём ещё немного времени для полной инициализации
                await delay(200);
                return true;
            }
        } catch (e) {
            // Ignore, retry
        }
        await delay(250);
    }
    
    return false;
}

/**
 * Ожидание готовности file input элемента
 * @param {number} tab - Номер таба
 * @param {number} timeout - Максимальное время ожидания (мс)
 * @returns {Promise<boolean>} - true если input найден
 */
async function waitForFileInput(tab, timeout = 15000) {
    // Используем централизованные селекторы через window._s
    const script = `
        (function() {
            const SEL = window._s;
            const selector = SEL?.input?.fileInput || 'input[type="file"]';
            return !!document.querySelector(selector);
        })();
    `;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const result = await cdpEval(tab, script, {
                timeoutSecs: 3, maxRetries: 0, silent: true
            });
            if (result === 'true' || result === true) {
                return true;
            }
        } catch (e) {
            // Ignore, retry
        }
        await delay(200);
    }
    
    return false;
}

/**
 * Ожидание загрузки файлов через счётчик
 * @param {number} tab - Номер таба
 * @param {number} expectedCount - Ожидаемое количество файлов
 * @param {number} timeout - Максимальное время ожидания (мс)
 * @returns {Promise<boolean>} - true если все файлы загружены
 */
async function waitForFilesUploaded(tab, expectedCount, timeout = 30000) {
    if (expectedCount <= 0) return true;
    
    const startTime = Date.now();
    let lastCount = -1;
    let iteration = 0;
    
    while (Date.now() - startTime < timeout) {
        iteration++;
        try {
            const count = await Promise.race([
                window.__TAURI__.core.invoke('get_upload_count', { tab }),
                new Promise((_, reject) => setTimeout(() => reject('invoke timeout'), 2000))
            ]);
            if (count !== lastCount) {
                lastCount = count;
            }
            if (count >= expectedCount) {
                return true;
            }
        } catch (e) {
        }
        await delay(400);
    }
    
    return false;
}


// ═══════════════════════════════════════════════════════════════════════════
// SEND ABORT CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

/** @type {AbortController|null} Контроллер отмены текущей отправки */

/**
 * Отменить отправку в Claude
 * @param {number} [tab] - номер таба. Если не указан — отменяет все активные
 * @returns {boolean} true если была активная отправка
 */
function abortSendToClaude(tab) {
    if (tab) {
        const state = _getSendState(tab);
        if (state.abort) {
            state.abort.abort('User cancelled');
            state.abort = null;
            state.sending = false;
            generatingTabs[tab] = false;
            updateClaudeUI();
            showToast(`Чат ${tab}: отправка отменена`);
            return true;
        }
        return false;
    }
    // Без таба — отменить все
    let aborted = false;
    for (const t of [1, 2, 3]) {
        const state = _getSendState(t);
        if (state.abort) {
            state.abort.abort('User cancelled');
            state.abort = null;
            state.sending = false;
            generatingTabs[t] = false;
            aborted = true;
        }
    }
    if (aborted) {
        updateClaudeUI();
        showToast('Все отправки отменены');
    }
    return aborted;
}

/**
 * Проверить что отправка не была отменена
 * @param {AbortSignal} signal
 * @throws {DOMException} если отменена
 */
function checkAborted(signal) {
    if (signal?.aborted) {
        throw new DOMException(signal.reason || 'Aborted', 'AbortError');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEND CHECKPOINT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Чекпоинты отправки для восстановления при ошибке
 * 
 * Этапы:
 *   'init'        → подготовка данных
 *   'open_claude' → открытие панели Claude
 *   'automation'  → создание проекта / нового чата
 *   'attach'      → прикрепление файлов
 *   'send'        → отправка текста
 *   'done'        → завершение
 */
const SendCheckpoint = {
    /** Per-tab checkpoint helpers */
    setFor(tab, stage, context) {
        const s = _getSendState(tab);
        s.stage = stage;
        if (context) s.context = { ...s.context, ...context };
        s.error = null;
        document.dispatchEvent(new CustomEvent('send-progress', {
            detail: { tab, stage, context: s.context }
        }));
    },
    failFor(tab, error) {
        const s = _getSendState(tab);
        s.error = String(error);
        document.dispatchEvent(new CustomEvent('send-error', {
            detail: { tab, stage: s.stage, error: s.error, context: s.context }
        }));
    },
    resetFor(tab) {
        const s = _getSendState(tab);
        s.stage = null;
        s.context = null;
        s.error = null;
    },
    stageFor(tab) { return _getSendState(tab).stage; }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION: SEND NODE TO CLAUDE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Отправить ноду в Claude
 * 
 * Этапы с checkpoint recovery:
 * 1. init        — подготовка данных, проверка блокировок
 * 2. open_claude — открытие панели Claude + переключение таба
 * 3. automation  — создание проекта / нового чата
 * 4. attach      — прикрепление скриптов и файлов
 * 5. send        — вставка текста + отправка
 * 6. done        — очистка, обновление UI
 * 
 * @param {number} index - индекс блока
 * @param {number} [chatTab] - номер Claude таба (1-3)
 */
async function sendNodeToClaude(index, chatTab) {
    
    const blocks = getTabBlocks(currentTab);
    if (!blocks[index]) return;
    
    const targetTab = chatTab || activeClaudeTab;
    const state = _getSendState(targetTab);
    
    // Защита от двойного клика в тот же таб
    if (state.sending) {
        showToast(`Чат ${targetTab}: отправка уже выполняется`);
        return;
    }
    
    // Защита от отправки в таб с активной генерацией
    if (generatingTabs[targetTab]) {
        showToast(`Чат ${targetTab}: Claude ещё генерирует...`);
        return;
    }
    
    // Создаём AbortController для этой отправки
    state.abort = new AbortController();
    const signal = state.abort.signal;
    
    state.sending = true;
    SendCheckpoint.resetFor(targetTab);
    updateClaudeUI();
    
    const block = blocks[index];
    const blockId = block.id;
    
    try {
        // ─── CHECKPOINT: init ────────────────────────────────────────
        SendCheckpoint.setFor(targetTab, 'init', { index, blockId, targetTab });
        checkAborted(signal);
        
        // Раскрываем маркеры языка перед отправкой — Claude получает чистый текст
        const text = resolveMarkersToText(block.content || '', currentLanguage, currentCountry);
        const files = blockAttachments[blockId] || [];
        const scripts = getBlockScripts(blockId);
        const automation = getBlockAutomationFlags(blockId);
        const totalFiles = scripts.length + files.length;
        
        
        SendCheckpoint.setFor(targetTab, 'init', { text: text.slice(0, 100), totalFiles });
        
        // ─── CHECKPOINT: open_claude ─────────────────────────────────
        SendCheckpoint.setFor(targetTab, 'open_claude');
        checkAborted(signal);
        
        if (!isClaudeVisible) {
            await toggleClaude();
            await delay(300);
        }
        
        if (chatTab) {
            await switchClaudeTab(chatTab);
            await delay(100);
        }
        
        
        // ─── CHECKPOINT: automation ──────────────────────────────────
        if (automation.newProject || automation.newChat) {
            SendCheckpoint.setFor(targetTab, 'automation', { newProject: automation.newProject, newChat: automation.newChat });
            checkAborted(signal);
            
            
            // Ждём загрузки страницы Claude перед автоматизацией
            const pageReady = await waitForClaudeInput(targetTab, 15000);
            if (!pageReady) {
                showToast('Ожидание загрузки Claude...');
                const retryReady = await waitForClaudeInput(targetTab, 30000);
                if (!retryReady) {
                    throw new Error('Claude page did not load');
                }
            }
            
            checkAborted(signal);
            
            if (automation.newProject) {
                if (isProjectActive()) {
                    await finishProject();
                }
                ProjectFSM.startCreating();
                const result = await createNewProject(targetTab);
                if (result.success && result.uuid) {
                    startProject(result.uuid, result.name, currentTab);
                } else {
                    ProjectFSM.fail();
                    throw new Error('Failed to create project');
                }
            } else if (automation.newChat) {
                await newChatInTab(targetTab, false);
            }
        }
        
        // ─── CHECKPOINT: attach ──────────────────────────────────────
        SendCheckpoint.setFor(targetTab, 'attach', { totalFiles });
        checkAborted(signal);
        
        
        if (totalFiles > 0) {
            await waitForFileInput(targetTab);
            checkAborted(signal);
            
            // Сбрасываем счётчик (Rust — нативный WebResourceRequested)
            try {
                await window.__TAURI__.core.invoke('reset_upload_count', { tab: targetTab });
            } catch (e) {
            }
            
            checkAborted(signal);
            
            await attachAllFiles(targetTab, scripts, files);
            
            checkAborted(signal);
            
            const filesUploaded = await waitForFilesUploaded(targetTab, totalFiles);
            
            if (!filesUploaded) {
                // Файлы не загрузились — очищаем редактор
                try {
                    await evalInClaude(targetTab, `
                        const SEL = window._s;
                        const pmSelector = SEL?.input?.proseMirror || '.ProseMirror';
                        const pm = document.querySelector(pmSelector);
                        if (pm?.editor?.commands) { pm.editor.commands.clearContent(); }
                        else if (pm) { pm.innerHTML = ''; }
                    `);
                } catch (_) {}
                throw new Error('Files upload timeout');
            }
        }
        
        // ─── CHECKPOINT: send ────────────────────────────────────────
        SendCheckpoint.setFor(targetTab, 'send');
        checkAborted(signal);
        
        await sendTextToClaude(text, targetTab);
        
        // ─── CHECKPOINT: done ────────────────────────────────────────
        SendCheckpoint.setFor(targetTab, 'done');
        
        // Запоминаем название блока для этого таба
        const blockName = block.title || `Блок ${index + 1}`;
        tabNames[targetTab] = blockName.length > 30 ? blockName.slice(0, 30) : blockName;
        updateClaudeUI();
        saveClaudeSettings();
        
        // Очищаем прикреплённые файлы (скрипты постоянные)
        if (files.length > 0) {
            clearBlockAttachments(blockId);
        }
        
        SendCheckpoint.resetFor(targetTab);
        
    } catch (e) {
        if (e.name === 'AbortError') {
            // Отмена пользователем — очищаем если были вложения
            if (SendCheckpoint.stageFor(targetTab) === 'attach' || SendCheckpoint.stageFor(targetTab) === 'send') {
                try {
                    await evalInClaude(targetTab, `
                        const SEL = window._s;
                        const pmSelector = SEL?.input?.proseMirror || '.ProseMirror';
                        const pm = document.querySelector(pmSelector);
                        if (pm?.editor?.commands) { pm.editor.commands.clearContent(); }
                        else if (pm) { pm.innerHTML = ''; }
                    `);
                } catch (_) {}
            }
            // Не re-throw AbortError
        } else {
            // Реальная ошибка — записываем checkpoint
            SendCheckpoint.failFor(targetTab, e);
            
            const stage = SendCheckpoint.stageFor(targetTab);
            const stageNames = {
                init: 'подготовки',
                open_claude: 'открытия Claude',
                automation: 'автоматизации',
                attach: 'прикрепления файлов',
                send: 'отправки текста'
            };
            const stageName = stageNames[stage] || stage;
            showToast(`Чат ${targetTab}: ошибка на этапе ${stageName}`);
            
            // Очищаем редактор если начали прикреплять
            if (stage === 'attach' || stage === 'send') {
                try {
                    await evalInClaude(targetTab, `
                        const SEL = window._s;
                        const pmSelector = SEL?.input?.proseMirror || '.ProseMirror';
                        const pm = document.querySelector(pmSelector);
                        if (pm?.editor?.commands) { pm.editor.commands.clearContent(); }
                        else if (pm) { pm.innerHTML = ''; }
                    `);
                } catch (_) {}
            }
        }
    } finally {
        state.sending = false;
        state.abort = null;
        updateClaudeUI();
    }
}

/**
 * Отправить текст в Claude (без привязки к карточке)
 * @param {string} text - Текст для отправки
 * @param {number} [tab] - Номер таба (если не указан, используется activeClaudeTab)
 */
async function sendTextToClaude(text, tab) {
    const targetTab = tab || activeClaudeTab;
    const autoSend = document.getElementById('auto-send-checkbox')?.checked;
    
    // Если текст пустой и auto-send выключен — нечего делать
    if (!text && !autoSend) {
        return;
    }
    
    try {
        
        await window.__TAURI__.core.invoke('insert_text_to_claude', { 
            text: text || '',
            tab: targetTab,
            autoSend: autoSend
        });
        
        
        // Ставим флаг генерации при auto-send
        if (autoSend) {
            updateClaudeUI();
            startGenerationMonitor();
        }
        
        if (text) {
            showToast(autoSend ? `Чат ${targetTab}: отправлено` : `Чат ${targetTab}: вставлено`);
        } else if (autoSend) {
            showToast(`Чат ${targetTab}: отправлено`);
        }
    } catch (e) {
        showToast(`Чат ${targetTab}: ошибка отправки`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE TOGGLE AND TAB MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Переключить видимость панели Claude
 */
async function toggleClaude() {
    try {
        isClaudeVisible = await window.__TAURI__.core.invoke('toggle_claude');
        await updateClaudeState();
        
        // Гарантируем создание resizer перед обновлением видимости
        createResizer();
        
        // Ждём следующий frame для синхронизации DOM
        await new Promise(resolve => requestAnimationFrame(resolve));
        updateResizer();
        
        await saveClaudeSettings();
        
        // Смещаем workflow на ширину resizer чтобы скроллбар не перекрывался
        const workflowContainer = getWorkflowContainer();
        if (workflowContainer) {
            workflowContainer.style.width = isClaudeVisible ? 'calc(100% - 6px)' : '';
        }
        
        if (isClaudeVisible) {
            await injectGenerationMonitor(1);
            startGenerationMonitor();
        }
    } catch (e) {
        
        showToast('Не удалось открыть Claude');
    }
}

/**
 * Переключить таб Claude
 * Все табы создаются при старте, здесь только переключение
 */
async function switchClaudeTab(tab) {
    try {
        await window.__TAURI__.core.invoke('switch_claude_tab', { tab });
        activeClaudeTab = tab;
        updateClaudeUI();
        await saveClaudeSettings();
    } catch (e) {
        
    }
}

/**
 * Инжект монитора генерации в Claude webview
 */
async function injectGenerationMonitor(tab) {
    try {
        await window.__TAURI__.core.invoke('inject_generation_monitor', { tab });
    } catch (e) {
        
    }
}


/**
 * Проверка статуса генерации через Rust (AtomicBool).
 * claude_helpers.js → _inv('set_generation_state') → AtomicBool
 * Здесь: check_generation_status → читаем AtomicBool. Мгновенно.
 */
async function checkAllGenerationStatus() {
    let changed = false;
    for (const tab of [1, 2, 3]) {
        try {
            const isGenerating = await window.__TAURI__.core.invoke('check_generation_status', { tab });
            const wasGenerating = generatingTabs[tab] || false;
            
            if (isGenerating && !wasGenerating) {
                generatingTabs[tab] = true;
                changed = true;
            } else if (!isGenerating && wasGenerating) {
                generatingTabs[tab] = false;
                changed = true;
                showToast(`Чат ${tab}: Claude закончил`, 3000);
            }
            
            // Обновляем URL таба
            const url = await window.__TAURI__.core.invoke('get_tab_url', { tab });
            if (url && url !== 'about:blank' && url.startsWith('https://claude.ai')) {
                tabUrls[tab] = url;
            }
        } catch (e) {
            // Ignore
        }
    }
    
    const anyGenerating = generatingTabs[1] || generatingTabs[2] || generatingTabs[3];
    if (changed) {
        updateClaudeUI();
    }
}

/**
 * Запуск периодической проверки генерации
 */
function startGenerationMonitor() {
    if (generationCheckInterval) {
        return;
    }
    generationCheckInterval = setInterval(checkAllGenerationStatus, 2000);
    
    // Периодически сохраняем URL табов (каждые 5 сек)
    if (!urlSaveInterval) {
        urlSaveInterval = setInterval(async () => {
            if (isClaudeVisible) {
                await saveClaudeSettings();
            }
        }, 5000);
    }
}

/**
 * Остановка периодической проверки генерации
 */
function stopGenerationMonitor() {
    if (generationCheckInterval) {
        clearInterval(generationCheckInterval);
        generationCheckInterval = null;
    }
    if (urlSaveInterval) {
        clearInterval(urlSaveInterval);
        urlSaveInterval = null;
    }
}

/**
 * Создать новый чат в табе
 * Использует внутренний API Claude
 */
async function newChatInTab(tab, clearName = true) {
    try {
        // Очищаем название таба при ручном создании нового чата
        // При автоматизации (флаг N) название присвоится от блока
        if (clearName) {
            delete tabNames[tab];
            updateClaudeUI();
            saveClaudeSettings();
        }
        
        // Устанавливаем флаг программной навигации
        // чтобы обработчик claude-page-loaded не сбросил название
        programmaticNavigation = true;
        
        // Определяем куда навигировать
        let targetUrl = 'https://claude.ai/new';
        let projectUuid = null;
        
        // 1. Если есть активный проект — идём в него
        if (ProjectFSM.uuid) {
            projectUuid = ProjectFSM.uuid;
        }
        
        // 2. Пробуем получить из текущего URL
        if (!projectUuid) {
            try {
                const currentUrl = await window.__TAURI__.core.invoke('get_tab_url', { tab });
                projectUuid = getProjectUUIDFromUrl(currentUrl);
            } catch (e) {
                // Ignore
            }
        }
        
        // 3. Пробуем получить из DOM breadcrumb (если внутри чата проекта)
        if (!projectUuid) {
            try {
                const script = `
                    (function() {
                        const SEL = window._s;
                        const linkSelector = SEL?.project?.projectLinkInHeader || 'div.text-text-300 a[href^="/project/"]';
                        const link = document.querySelector(linkSelector);
                        if (link) {
                            const href = link.getAttribute('href');
                            const match = href.match(/\\/project\\/([a-f0-9-]+)/i);
                            return match ? match[1] : null;
                        }
                        return null;
                    })();
                `;
                const result = await cdpEval(tab, script, {
                    timeoutSecs: 2, maxRetries: 1, silent: true
                });
                if (result && result !== 'null') {
                    projectUuid = result.replace(/"/g, '');
                }
            } catch (e) {
                // DOM detection failed
            }
        }
        
        // Формируем URL
        if (projectUuid) {
            targetUrl = `https://claude.ai/project/${projectUuid}`;
        }
        
        // Навигируем
        await navigateClaude(tab, targetUrl);
        
        // Ждём загрузки новой страницы (ProseMirror готов)
        await waitForClaudeInput(tab);
        
        // Переинжектим хелперы (generation monitor, UI)
        await injectGenerationMonitor(tab);
        
        // Сбрасываем флаг после небольшой задержки (чтобы событие успело обработаться)
        setTimeout(() => { programmaticNavigation = false; }, 2000);
        
    } catch (e) {
        programmaticNavigation = false;
        // Fallback
        await navigateClaude(tab, 'https://claude.ai/new');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Восстановление состояния Claude
 * Все три таба создаются при старте, здесь восстанавливаем URL и настройки
 */
async function restoreClaudeState() {
    const saved = loadClaudeSettings();
    
    // Сбрасываем кэш org_id при восстановлении состояния
    invalidateOrgCache();
    
    // Сбрасываем адаптивный таймаут CDP
    CdpTimeout.reset();
    
    try {
        // Если есть сохранённые настройки
        if (saved) {
            // Восстанавливаем ratio
            if (saved.panelRatio && saved.panelRatio !== 50) {
                panelRatio = saved.panelRatio;
                await window.__TAURI__.core.invoke('set_panel_ratio', { ratio: panelRatio });
            }
            
            // Claude открывается только если был открыт ранее
            if (saved.visible === true) {
                isClaudeVisible = await window.__TAURI__.core.invoke('toggle_claude');
                
                // Даём время на инициализацию
                await delay(300);
                
                // Восстанавливаем URL для всех табов с сохранёнными URL
                for (const tab of [1, 2, 3]) {
                    const tabUrl = saved.tabUrls?.[tab];
                    if (tabUrl && tabUrl !== 'about:blank' && tabUrl.startsWith('https://claude.ai')) {
                        await window.__TAURI__.core.invoke('switch_claude_tab_with_url', { tab, url: tabUrl });
                        await delay(100);
                    }
                }
                
                // Переключаемся на сохранённый активный таб
                if (saved.activeTab) {
                    await window.__TAURI__.core.invoke('switch_claude_tab', { tab: saved.activeTab });
                }
                
                // Восстанавливаем названия табов
                if (saved.tabNames) {
                    Object.assign(tabNames, saved.tabNames);
                }
                
                await updateClaudeState();
                
                // Ждём следующий frame перед обновлением resizer для гарантии синхронизации DOM
                await new Promise(resolve => requestAnimationFrame(resolve));
                updateResizer();
                
                // Смещаем workflow на ширину resizer
                const workflowContainer = getWorkflowContainer();
                if (workflowContainer) {
                    workflowContainer.style.width = 'calc(100% - 6px)';
                }
                
                // Запускаем монитор генерации
                startGenerationMonitor();
            }
        }
    } catch (e) {
        console.error('[Claude] Failed to restore state:', e);
    }
}

/**
 * Инициализация обработчиков Claude
 */
function initClaudeHandlers() {
    document.getElementById('claude-toggle-btn')?.addEventListener('click', toggleClaude);
    
    // Табы
    for (let i = 1; i <= 3; i++) {
        const tabBtn = document.getElementById(`claude-tab-${i}`);
        if (tabBtn) {
            tabBtn.addEventListener('click', () => {
                switchClaudeTab(i);
            });
            tabBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                newChatInTab(i);
            });
        }
    }
    
    // Auto-send чекбокс
    const autoSendCheckbox = document.getElementById('auto-send-checkbox');
    if (autoSendCheckbox) {
        // Восстанавливаем состояние из localStorage
        autoSendCheckbox.checked = localStorage.getItem(STORAGE_KEYS.CLAUDE_AUTO_SEND) === 'true';
        
        // Сохраняем при изменении
        autoSendCheckbox.addEventListener('change', () => {
            localStorage.setItem(STORAGE_KEYS.CLAUDE_AUTO_SEND, autoSendCheckbox.checked);
        });
    }
    
    // Ресайзер
    createResizer();
    
    // Восстанавливаем сохранённое состояние
    restoreClaudeState();
    
    // Обновляем UI сразу
    updateClaudeUI();
    
    // Монитор генерации — всегда активен, работает в фоне
    startGenerationMonitor();
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT BINDING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Извлекает UUID проекта из URL Claude
 * @param {string} url - URL страницы Claude
 * @returns {string|null} UUID проекта или null
 */
function getProjectUUIDFromUrl(url) {
    const match = url?.match(/\/project\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
}

// isProjectActive() и isCurrentTabProjectOwner() перенесены в claude-state.js

/**
 * Начинает привязку к проекту (через FSM)
 * @param {string} uuid - UUID проекта Claude
 * @param {string} name - Название проекта
 * @param {string} ownerTab - ID вкладки-владельца (APM tab)
 */
function startProject(uuid, name, ownerTab) {
    ProjectFSM.bind(uuid, name, ownerTab, activeClaudeTab);
    
    // Скрываем кнопку "Продолжить" (если была видна)
    hideContinueButton();
    
    // Показываем кнопку "Завершить" с анимацией
    const btn = document.getElementById('finish-project-btn');
    if (btn) {
        btn.classList.add('visible');
    }
    
    // Обновляем UI
    ProjectFSM._updateUI();
    
    showToast(`Проект "${name}" привязан`);
}

/**
 * Завершает привязку к проекту (через FSM)
 */
async function finishProject() {
    await ProjectFSM.finish();
}

/**
 * Продолжает работу с проектом
 */
async function continueProject() {
    const btn = document.getElementById('continue-project-btn');
    const uuid = btn?.dataset.projectUuid;
    
    if (!uuid) return;
    
    // Получаем название проекта из DOM или генерируем
    let projectName = 'Проект';
    try {
        const result = await cdpEval(activeClaudeTab, `
                (function() {
                    const SEL = window._s;
                    // Пробуем получить из breadcrumb (динамический селектор с uuid)
                    const link = document.querySelector('a[href*="/project/${uuid}"]');
                    if (link) return link.textContent.trim();
                    // Пробуем из заголовка
                    const h1Selector = SEL?.project?.pageTitle || 'h1';
                    const h1 = document.querySelector(h1Selector);
                    if (h1) return h1.textContent.trim();
                    return null;
                })();
            `, { timeoutSecs: 3, maxRetries: 0, silent: true });
        if (result && result !== 'null') {
            projectName = result.replace(/^"|"$/g, '');
        }
    } catch (e) {
        // Используем дефолтное название
    }
    
    // Скрываем кнопку "Продолжить"
    if (btn) {
        btn.classList.add('hiding');
        await delay(300);
        btn.classList.remove('visible', 'hiding');
        btn.dataset.projectUuid = '';
    }
    
    // Запускаем проект
    startProject(uuid, projectName, currentTab);
}

/**
 * Проверяет URL Claude и показывает кнопку "Продолжить проект" если нужно
 */
async function checkForContinueProject() {
    // Если уже есть активный проект — не показываем
    if (isProjectActive()) {
        hideContinueButton();
        return;
    }
    
    // Получаем URL текущего таба
    try {
        const url = await window.__TAURI__.core.invoke('get_tab_url', { tab: activeClaudeTab });
        const projectUuid = getProjectUUIDFromUrl(url);
        
        if (projectUuid) {
            showContinueButton(projectUuid);
        } else {
            hideContinueButton();
        }
    } catch (e) {
        hideContinueButton();
    }
}

/**
 * Показывает кнопку "Продолжить проект"
 */
function showContinueButton(uuid) {
    const btn = document.getElementById('continue-project-btn');
    if (btn && !isProjectActive()) {
        btn.dataset.projectUuid = uuid;
        btn.classList.add('visible');
        // Обновляем лимит скролла во view mode
        if (typeof adjustWorkflowScale === 'function') {
            adjustWorkflowScale();
        }
    }
}

/**
 * Скрывает кнопку "Продолжить проект"
 */
function hideContinueButton() {
    const btn = document.getElementById('continue-project-btn');
    if (btn) {
        btn.classList.remove('visible');
        btn.dataset.projectUuid = '';
        // Обновляем лимит скролла во view mode
        if (typeof adjustWorkflowScale === 'function') {
            adjustWorkflowScale();
        }
    }
}

/**
 * Восстанавливает состояние привязки к проекту при загрузке (через FSM)
 */
function restoreProjectState() {
    ProjectFSM.restore();
}

/**
 * Инициализирует отслеживание URL Claude для кнопки "Продолжить проект"
 */
let projectUrlTrackingRetryCount = 0;
const MAX_PROJECT_URL_RETRIES = 50; // 50 * 50ms = 2.5 сек максимум

function initProjectUrlTracking() {
    // Защита от двойной инициализации (предотвращает множественные listeners)
    if (projectUrlTrackingInitialized) return;
    
    // Tauri API может быть не готов, ретраим
    if (!window.__TAURI__?.event?.listen) {
        projectUrlTrackingRetryCount++;
        if (projectUrlTrackingRetryCount < MAX_PROJECT_URL_RETRIES) {
            setTimeout(initProjectUrlTracking, 50);
        }
        return;
    }
    
    projectUrlTrackingInitialized = true;
    
    // Слушаем событие загрузки страницы Claude (полная навигация)
    window.__TAURI__.event.listen('claude-page-loaded', (event) => {
        const { tab, url } = event.payload || {};
        
        // Переинжектим UI helpers после полной загрузки страницы
        if (tab) {
            injectGenerationMonitor(tab).catch(() => {});
            
            // Синхронизируем auto-continue в загрузившийся таб
            try {
                const acEnabled = getSettings().autoContinue === true;
                // Ставим pending-флаг + пробуем вызвать setEnabled. Если IIFE
                // автоконтинью ещё не успел создать window._ac (гонка с DOMContentLoaded),
                // флаг подхватится при инициализации IIFE.
                evalInClaude(tab, `window._acWantEnabled=${!!acEnabled};if(window._ac)window._ac.setEnabled(${!!acEnabled})`);
            } catch(e) {}
        }
        
        // FSM: валидируем URL для привязки к проекту
        if (tab && url) {
            ProjectFSM.validateUrl(tab, url);
        }
        
        // Сбрасываем название таба при ручной навигации на новый чат
        if (!programmaticNavigation && url && tab) {
            const isNewChat = url.includes('/new') || url.endsWith('/project/') || url.match(/\/project\/[a-f0-9-]+$/i);
            if (isNewChat && tabNames[tab]) {
                delete tabNames[tab];
                updateClaudeUI();
                saveClaudeSettings();
            }
        }
        
        setTimeout(() => {
            checkForContinueProject();
        }, 500);
    });
    
    // Слушаем событие SPA-навигации внутри Claude (pushState/replaceState)
    window.__TAURI__.event.listen('claude-url-changed', (event) => {
        const { tab, url } = event.payload || {};
        
        // FSM: валидируем URL для привязки к проекту
        if (tab && url) {
            ProjectFSM.validateUrl(tab, url);
        }
        
        // Инвалидируем кэш org_id при переходе на страницу логина/логаута
        // чтобы не использовать старый org_id при смене аккаунта
        if (url && (url.includes('/login') || url.includes('/logout') || url.includes('/sign'))) {
            invalidateOrgCache();
        }
        
        // Сбрасываем название таба при ручной навигации на новый чат
        if (!programmaticNavigation && url && tab) {
            const isNewChat = url.includes('/new') || url.endsWith('/project/') || url.match(/\/project\/[a-f0-9-]+$/i);
            if (isNewChat && tabNames[tab]) {
                delete tabNames[tab];
                updateClaudeUI();
                saveClaudeSettings();
            }
        }
        
        setTimeout(() => {
            checkForContinueProject();
        }, 300);
    });
    
    // Также проверяем при переключении табов (wrap только один раз)
    const origSwitchTab = window.switchClaudeTab;
    if (origSwitchTab && !origSwitchTab._projectUrlWrapped) {
        const wrappedFn = async function(tab) {
            await origSwitchTab(tab);
            setTimeout(() => checkForContinueProject(), 300);
        };
        wrappedFn._projectUrlWrapped = true;
        window.switchClaudeTab = wrappedFn;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE UPLOAD — автозагрузка MD файлов в knowledge проекта
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Загрузить файл в knowledge активного проекта через Claude API
 * 
 * @param {string} filePath - путь к файлу на диске
 * @param {string} filename - имя файла
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function uploadToProjectKnowledge(filePath, filename) {
    // Проверяем наличие активного проекта
    const projectUuid = ProjectFSM.uuid;
    if (!projectUuid) {
        return { success: false, error: 'No active project' };
    }
    
    const claudeTab = ProjectFSM.claudeTab || activeClaudeTab;
    
    // Получаем org_id
    const orgId = await getOrganizationId(claudeTab);
    if (!orgId) {
        return { success: false, error: 'No organization ID' };
    }
    
    // Читаем файл через Rust
    let fileData;
    try {
        fileData = await window.__TAURI__.core.invoke('read_file_for_attachment', { path: filePath });
    } catch (e) {
        return { success: false, error: `Read failed: ${e}` };
    }
    
    // Загружаем в knowledge через CDP eval + fetch
    // Декодируем base64 в текст на стороне JS (файл маркдаун — текстовый)
    const script = `
        (async function() {
            try {
                const base64 = ${JSON.stringify(fileData.data)};
                const binary = atob(base64);
                const content = decodeURIComponent(escape(binary));
                
                const response = await fetch(
                    '/api/organizations/${orgId}/projects/${projectUuid}/docs',
                    {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            file_name: ${JSON.stringify(filename)},
                            content: content
                        })
                    }
                );
                
                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    return { success: false, status: response.status, error: text };
                }
                
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        })();
    `;
    
    try {
        const resultStr = await cdpEval(claudeTab, script, {
            timeoutType: 'slow', maxRetries: 2
        });
        const result = JSON.parse(resultStr);
        
        if (result?.success) {
            // Удаляем файл с диска
            try {
                await window.__TAURI__.core.invoke('delete_download', { filePath });
            } catch (e) {
                // Не критично — файл уже в knowledge
            }
            return { success: true };
        }
        
        return { success: false, error: result?.error || `HTTP ${result?.status}` };
    } catch (e) {
        return { success: false, error: `CDP failed: ${e}` };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILLS UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Загружает скиллы в аккаунт Claude через внутренний API
 * @param {function} [onProgress] - колбэк (current, total, name)
 * @returns {Promise<{success: boolean, uploaded: number, total: number, errors: string[]}>}
 */
async function uploadSkillsToClaude(onProgress) {
    const claudeTab = activeClaudeTab;
    
    // Получаем org_id
    const orgId = await getOrganizationId(claudeTab);
    if (!orgId) {
        return { success: false, uploaded: 0, total: 0, errors: ['No organization ID'] };
    }
    
    // Получаем кэшированные скиллы
    const skills = typeof getCachedSkills === 'function' ? getCachedSkills() : {};
    const names = Object.keys(skills);
    if (names.length === 0) {
        return { success: false, uploaded: 0, total: 0, errors: ['No cached skills'] };
    }
    
    const total = names.length;
    let uploaded = 0;
    const errors = [];
    
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const base64 = skills[name];
        
        if (onProgress) onProgress(i + 1, total, name);
        
        const script = `
            (async function() {
                try {
                    const base64 = ${JSON.stringify(base64)};
                    const binary = atob(base64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    const blob = new Blob([bytes], {type: 'application/zip'});
                    
                    const formData = new FormData();
                    formData.append('file', blob, ${JSON.stringify(name + '.skill')});
                    
                    const response = await fetch(
                        '/api/organizations/${orgId}/skills/upload-skill?overwrite=true',
                        { method: 'POST', credentials: 'include', body: formData }
                    );
                    
                    if (!response.ok) {
                        const text = await response.text().catch(() => '');
                        return { success: false, name: ${JSON.stringify(name)}, status: response.status, error: text };
                    }
                    
                    const result = await response.json();
                    return { success: true, name: result.skill?.name || ${JSON.stringify(name)} };
                } catch (e) {
                    return { success: false, name: ${JSON.stringify(name)}, error: e.message };
                }
            })();
        `;
        
        try {
            const resultStr = await cdpEval(claudeTab, script, {
                timeoutType: 'slow', maxRetries: 2
            });
            const result = JSON.parse(resultStr);
            
            if (result?.success) {
                uploaded++;
            } else {
                errors.push(`${name}: ${result?.error || 'HTTP ' + result?.status}`);
            }
        } catch (e) {
            errors.push(`${name}: CDP failed — ${e}`);
        }
    }
    
    return { success: errors.length === 0, uploaded, total, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER AUTO-CHAIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-chain после успешного скрапинга:
 * 1. Найти подключённые блоки (макс 3)
 * 2. Создать проект
 * 3. Загрузить HTML в knowledge
 * 4. Отправить каждый блок в отдельный таб (1, 2, 3)
 */
async function onScrapeComplete(scraperItem) {
    // Найти все подключённые блоки (макс 3)
    const conns = workflowConnections.filter(c => c.from === scraperItem.id);
    if (conns.length === 0) return;
    
    const blocks = getTabBlocks(currentTab);
    const connectedBlocks = conns
        .map(c => blocks.find(b => b.id === c.to))
        .filter(Boolean)
        .slice(0, 3);
    
    if (connectedBlocks.length === 0) return;
    
    const pageFiles = scraperItem.result?.pageFiles || [];
    
    try {
        // Открыть Claude если скрыт
        if (!isClaudeVisible) {
            await toggleClaude();
            await delay(300);
        }
        
        // Ждём загрузки Claude
        const pageReady = await waitForClaudeInput(1, 15000);
        if (!pageReady) {
            showToast('⚠️ Claude не загрузился');
            return;
        }
        
        // Завершить текущий проект если есть
        if (isProjectActive()) {
            await finishProject();
            await delay(500);
        }
        
        // 1. Создать проект
        showToast('Создание проекта...');
        ProjectFSM.startCreating();
        const projectResult = await createNewProject(1);
        if (!projectResult.success || !projectResult.uuid) {
            ProjectFSM.fail();
            showToast('❌ Не удалось создать проект');
            return;
        }
        startProject(projectResult.uuid, projectResult.name, currentTab);
        await delay(500);
        
        // 2. Загрузить HTML файлы в knowledge
        if (pageFiles.length > 0) {
            showToast(`Загрузка ${pageFiles.length} страниц в knowledge...`);
            let uploaded = 0;
            for (const filePath of pageFiles) {
                const filename = filePath.split(/[/\\]/).pop();
                const res = await uploadToProjectKnowledge(filePath, filename);
                if (res.success) uploaded++;
            }
            if (uploaded > 0) {
                showToast(`📎 ${uploaded} страниц → knowledge ✓`);
            } else {
                showToast('⚠️ Knowledge upload: ни один файл не загрузился');
            }
            await delay(300);
        }
        
        // 3. Отправить каждый блок в отдельный таб
        //    Блок 1 → таб 1, блок 2 → таб 2, блок 3 → таб 3
        //    Флаги newProject/newChat на блоках игнорируются — скраппер сам управляет проектом
        for (let i = 0; i < connectedBlocks.length; i++) {
            const block = connectedBlocks[i];
            const targetTab = i + 1;
            
            // Флаги newProject/newChat на блоках игнорируются — скраппер сам управляет проектом
            
            // Для табов 2+ создаём новый чат в том же проекте
            if (i > 0) {
                await newChatInTab(targetTab, false);
                await delay(300);
            }
            
            const text = resolveMarkersToText(block.content || '', currentLanguage, currentCountry);
            
            // Аттачим скрипты/файлы если есть
            const scripts = getBlockScripts(block.id);
            const files = blockAttachments[block.id] || [];
            const totalFiles = scripts.length + files.length;
            
            if (totalFiles > 0) {
                await waitForFileInput(targetTab);
                try { await window.__TAURI__.core.invoke('reset_upload_count', { tab: targetTab }); } catch (_) {}
                await attachAllFiles(targetTab, scripts, files);
                await waitForFilesUploaded(targetTab, totalFiles);
            }
            
            await sendTextToClaude(text, targetTab);
            
            // UI
            tabNames[targetTab] = (block.title || 'Блок').slice(0, 30);
            if (files.length > 0) clearBlockAttachments(block.id);
        }
        
        updateClaudeUI();
        saveClaudeSettings();
        
    } catch (e) {
        showToast(`❌ Auto-chain: ${String(e).slice(0, 60)}`);
    }
}

// Экспорт
window.initClaudeHandlers = initClaudeHandlers;
window.sendNodeToClaude = sendNodeToClaude;
window.abortSendToClaude = abortSendToClaude;
window.SendCheckpoint = SendCheckpoint;
window.isTabBusy = function(tab) { return (generatingTabs[tab] || false) || _getSendState(tab).sending; };
window.finishProject = finishProject;
window.isCurrentTabProjectOwner = isCurrentTabProjectOwner;
window.restoreProjectState = restoreProjectState;
window.initProjectUrlTracking = initProjectUrlTracking;
window.uploadToProjectKnowledge = uploadToProjectKnowledge;
window.uploadSkillsToClaude = uploadSkillsToClaude;
window.onScrapeComplete = onScrapeComplete;

// CDP Resilience Layer
window.cdpEval = cdpEval;
window.cdpPipeline = cdpPipeline;
window.CdpTimeout = CdpTimeout;