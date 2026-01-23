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
 *   - Алиасы: isClaudeVisible, activeClaudeTab, existingTabs, generatingTabs, 
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
 *   - closeClaudeTab(tab)
 *   - restoreClaudeState()
 *   - initClaudeHandlers()
 *   - addNewChatTab()
 *   - startProject(uuid, name, ownerTab)
 *   - finishProject()
 *   - getProjectUUIDFromUrl(url)
 *   - restoreProjectState()
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

// Флаг защиты от двойной инициализации отслеживания URL
let projectUrlTrackingInitialized = false;

// Флаг программной навигации (не сбрасывать название при переходе на /new)
let programmaticNavigation = false;

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
 * Использует eval_in_claude_with_result для получения данных напрямую
 */
async function getOrganizationId(tab) {
    if (cachedOrgId) {
        return cachedOrgId;
    }
    
    // Скрипт который вернёт org_id из cookie (быстрая синхронная операция)
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
    
    try {
        // Таймаут 5 сек — это простое чтение cookie
        const result = await window.__TAURI__.core.invoke('eval_in_claude_with_result', { 
            tab, 
            script,
            timeoutSecs: 5
        });
        // Результат приходит как JSON string, парсим
        const orgId = JSON.parse(result);
        
        // Проверяем что это строка UUID, а не объект ошибки
        if (orgId && typeof orgId === 'string' && /^[a-f0-9-]+$/i.test(orgId)) {
            cachedOrgId = orgId;
            return cachedOrgId;
        }
    } catch (e) {
        // Fallback если CDP не сработал
    }
    
    // Fallback: если новая команда не сработала, пробуем через API запрос + searchParams
    const apiScript = `
        (async function() {
            try {
                // Сначала пробуем из cookie
                const cookieMatch = document.cookie.match(/lastActiveOrg=([a-f0-9-]+)/i);
                if (cookieMatch) {
                    const url = new URL(window.location.href);
                    url.searchParams.set('__apm_org', cookieMatch[1]);
                    history.replaceState(null, '', url.toString());
                    return;
                }
                
                // Если нет в cookie - запрашиваем через API
                const response = await fetch('https://claude.ai/api/organizations', {
                    method: 'GET',
                    credentials: 'include'
                });
                if (response.ok) {
                    const orgs = await response.json();
                    const orgId = orgs[0]?.uuid;
                    if (orgId) {
                        const url = new URL(window.location.href);
                        url.searchParams.set('__apm_org', orgId);
                        history.replaceState(null, '', url.toString());
                    }
                }
            } catch (e) {
                // Failed silently
            }
        })();
    `;
    
    await evalInClaude(tab, apiScript);
    await delay(400);
    
    // Читаем URL
    try {
        const url = await window.__TAURI__.core.invoke('get_tab_url', { tab });
        const urlObj = new URL(url);
        const orgId = urlObj.searchParams.get('__apm_org');
        
        if (orgId) {
            cachedOrgId = orgId;
            
            // Очищаем URL param
            await evalInClaude(tab, `
                const url = new URL(window.location.href);
                url.searchParams.delete('__apm_org');
                history.replaceState(null, '', url.toString());
            `);
            
            return cachedOrgId;
        }
    } catch (e) {
        // URL read failed
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
                const response = await fetch('https://claude.ai/api/organizations/${orgId}/projects', {
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
        // Таймаут 30 сек — это HTTP запрос к API Claude (может быть медленным)
        const resultStr = await window.__TAURI__.core.invoke('eval_in_claude_with_result', { 
            tab, 
            script,
            timeoutSecs: 30
        });
        const result = JSON.parse(resultStr);
        
        if (result && result.success && result.uuid) {
            // Навигируем на страницу проекта
            await navigateClaude(tab, `https://claude.ai/project/${result.uuid}`);
            
            return { success: true, uuid: result.uuid, name: projectName };
        }
    } catch (e) {
        // CDP failed, try fallback
    }
    
    // Fallback через searchParams если новая команда не сработала
    const fallbackScript = `
        (async function() {
            try {
                const response = await fetch('https://claude.ai/api/organizations/${orgId}/projects', {
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
                const url = new URL(window.location.href);
                url.searchParams.set('__apm_project', data.uuid);
                history.replaceState(null, '', url.toString());
            } catch (e) {
                const url = new URL(window.location.href);
                url.searchParams.set('__apm_project', 'error');
                history.replaceState(null, '', url.toString());
            }
        })();
    `;
    
    await evalInClaude(tab, fallbackScript);
    await delay(1000);
    
    try {
        const url = await window.__TAURI__.core.invoke('get_tab_url', { tab });
        const urlObj = new URL(url);
        const result = urlObj.searchParams.get('__apm_project');
        
        if (result) {
            await evalInClaude(tab, `
                const url = new URL(window.location.href);
                url.searchParams.delete('__apm_project');
                history.replaceState(null, '', url.toString());
            `);
            
            if (result === 'error') {
                return { success: false, uuid: null, name: null };
            }
            
            await navigateClaude(tab, `https://claude.ai/project/${result}`);
            
            return { success: true, uuid: result, name: projectName };
        }
    } catch (e) {
        // Fallback failed
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
 * Ожидание загрузки страницы в табе
 * @param {number} tab - номер таба
 * @param {number} timeoutMs - таймаут в мс (по умолчанию 10 сек)
 * @returns {Promise<boolean>} - true если загрузилась, false если таймаут
 */
async function waitForTabLoad(tab, timeoutMs = 10000) {
    let unlisten = null;
    let resolved = false;
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                if (unlisten) unlisten();
                resolve(false);
            }
        }, timeoutMs);
        
        window.__TAURI__.event.listen('claude-page-loaded', (event) => {
            if (!resolved && event.payload?.tab === tab) {
                resolved = true;
                clearTimeout(timeout);
                if (unlisten) unlisten();
                resolve(true);
            }
        }).then(fn => {
            unlisten = fn;
        });
    });
}

/**
 * Навигация Claude на URL
 * Ждёт реальной загрузки страницы через событие page-loaded
 */
async function navigateClaude(tab, url) {
    // Создаём Promise который разрешится когда страница РЕАЛЬНО загрузится
    // Событие claude-page-loaded эмитится из on_page_load callback в Rust
    let unlisten = null;
    let resolved = false;
    
    const pageLoadPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                if (unlisten) unlisten();
                resolve(false);
            }
        }, 15000);
        
        window.__TAURI__.event.listen('claude-page-loaded', (event) => {
            // Проверяем что это наш таб
            if (!resolved && event.payload?.tab === tab) {
                resolved = true;
                clearTimeout(timeout);
                if (unlisten) unlisten();
                resolve(true);
            }
        }).then(fn => {
            unlisten = fn;
        });
    });
    
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
async function attachScriptsToMessage(tab, scripts) {
    if (!scripts.length || !window.__TAURI__?.core?.invoke) return;
    
    for (const scriptKey of scripts) {
        const script = EMBEDDED_SCRIPTS[scriptKey];
        if (!script) continue;
        
        try {
            const tempPath = await window.__TAURI__.core.invoke('write_temp_file', {
                filename: script.name,
                content: script.content
            });
            await window.__TAURI__.core.invoke('attach_file_to_claude', {
                tab,
                path: tempPath
            });
        } catch (e) {
            
        }
    }
}

/**
 * Прикрепить файлы к сообщению Claude
 */
async function attachFilesToMessage(tab, files) {
    for (const file of files) {
        try {
            await window.__TAURI__.core.invoke('attach_file_to_claude', { 
                tab,
                path: file.path 
            });
        } catch (e) {
            
            showToast(`Файл не найден: ${file.name}`);
        }
    }
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
    const script = `
        (function() {
            const pmElement = document.querySelector('.ProseMirror');
            // Проверяем что элемент есть И editor полностью инициализирован
            if (pmElement && pmElement.editor && pmElement.editor.commands && typeof pmElement.editor.commands.insertContent === 'function') {
                return true;
            }
            // Fallback для старых версий
            const el = document.querySelector('[contenteditable="true"]') ||
                       document.querySelector('textarea');
            return !!el;
        })();
    `;
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const result = await window.__TAURI__.core.invoke('eval_in_claude_with_result', { 
                tab, 
                script,
                timeoutSecs: 5
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
    const script = `!!document.querySelector('input[type="file"]')`;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const result = await window.__TAURI__.core.invoke('eval_in_claude_with_result', { 
                tab, 
                script,
                timeoutSecs: 3
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
async function waitForFilesUploaded(tab, expectedCount, timeout = 10000) {
    if (expectedCount <= 0) return true;
    
    const script = `window.__uploadedFilesCount || 0`;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const result = await window.__TAURI__.core.invoke('eval_in_claude_with_result', { 
                tab, 
                script,
                timeoutSecs: 5
            });
            
            const count = parseInt(result) || 0;
            if (count >= expectedCount) {
                return true;
            }
        } catch (e) {}
        await delay(200);
    }
    
    return false;
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION: SEND NODE TO CLAUDE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Отправить ноду в Claude
 */
async function sendNodeToClaude(index, chatTab) {
    const blocks = getTabBlocks(currentTab);
    if (!blocks[index]) return;
    
    const block = blocks[index];
    const blockId = block.id;
    const text = block.content || '';
    const files = blockAttachments[blockId] || [];
    const scripts = getBlockScripts(blockId);
    const automation = getBlockAutomationFlags(blockId);
    const targetTab = chatTab || activeClaudeTab;
    
    // Открываем Claude если закрыт
    if (!isClaudeVisible) {
        await toggleClaude();
        await delay(300);
    }
    
    // Переключаемся на нужный таб
    if (chatTab) {
        await switchClaudeTab(chatTab);
        await delay(100);
    }
    
    // Обработка автоматизации
    if (automation.newProject) {
        // Завершаем предыдущий проект если есть
        if (isProjectActive()) {
            await finishProject();
        }
        // Создаём новый проект
        const result = await createNewProject(targetTab);
        if (result.success && result.uuid) {
            startProject(result.uuid, result.name, currentTab);
        } else {
            // Не удалось создать проект — прерываем отправку
            showToast('Ошибка: не удалось создать проект');
            return;
        }
    } else if (automation.newChat) {
        await newChatInTab(targetTab, false); // false — название присвоится от блока
    }
    
    // Прикрепляем скрипты и файлы
    const totalFiles = scripts.length + files.length;
    
    // Ждём готовности file input перед прикреплением
    if (totalFiles > 0) {
        await waitForFileInput(targetTab);
        
        // Сбрасываем счётчик ПЕРЕД прикреплением файлов
        try {
            await window.__TAURI__.core.invoke('eval_in_claude_with_result', { 
                tab: targetTab, 
                script: 'window.__uploadedFilesCount = 0;',
                timeoutSecs: 2
            });
        } catch (e) {}
    }
    
    await attachScriptsToMessage(targetTab, scripts);
    await attachFilesToMessage(targetTab, files);
    
    // Ждём загрузки всех файлов через интерсептор
    if (totalFiles > 0) {
        const filesUploaded = await waitForFilesUploaded(targetTab, totalFiles);
        
        if (!filesUploaded) {
            // Таймаут — файлы не загрузились, отменяем отправку
            showToast('Ошибка: файлы не загрузились. Отправка отменена.');
            
            // Очищаем поле ввода чтобы не отправить бракованный промпт
            try {
                await window.__TAURI__.core.invoke('eval_in_claude', { 
                    tab: targetTab, 
                    script: `
                        const pm = document.querySelector('.ProseMirror');
                        if (pm?.editor?.commands) {
                            pm.editor.commands.clearContent();
                        } else if (pm) {
                            pm.innerHTML = '';
                        }
                    `
                });
            } catch (e) {}
            
            return; // Прерываем отправку
        }
    }
    
    // Отправляем текст
    await sendTextToClaude(text, targetTab);
    
    // Запоминаем название блока для этого таба (макс. 30 символов)
    const blockName = block.title || `Блок ${index + 1}`;
    tabNames[targetTab] = blockName.length > 30 ? blockName.slice(0, 30) : blockName;
    updateClaudeUI();
    saveClaudeSettings();
    
    // Очищаем прикреплённые файлы (скрипты постоянные)
    if (files.length > 0) {
        clearBlockAttachments(blockId);
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
        if (text) {
            showToast(autoSend ? 'Отправлено в Claude' : 'Вставлено в Claude');
        } else if (autoSend) {
            showToast('Отправлено в Claude');
        }
    } catch (e) {
        showToast('Ошибка отправки');
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
            // Инжектим монитор в первый таб и запускаем проверку
            await injectGenerationMonitor(1);
            startGenerationMonitor();
        } else {
            stopGenerationMonitor();
        }
    } catch (e) {
        
        showToast('Не удалось открыть Claude');
    }
}

/**
 * Переключить таб Claude
 */
async function switchClaudeTab(tab) {
    try {
        const isNewTab = !existingTabs.includes(tab);
        await window.__TAURI__.core.invoke('switch_claude_tab', { tab });
        activeClaudeTab = tab;
        
        if (isNewTab) {
            existingTabs.push(tab);
            
            // Retry механизм для новых табов: 3 попытки по 10 сек
            let loaded = false;
            for (let attempt = 1; attempt <= 3 && !loaded; attempt++) {
                loaded = await waitForTabLoad(tab, 10000);
                if (!loaded && attempt < 3) {
                    await window.__TAURI__.core.invoke('reload_claude_tab', { tab });
                }
            }
            
            // Инжектим монитор генерации в новый таб
            await injectGenerationMonitor(tab);
        }
        
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
 * Проверка статуса генерации всех табов
 */
async function checkAllGenerationStatus() {
    if (!isClaudeVisible) return;
    
    let changed = false;
    for (const tab of existingTabs) {
        try {
            // Периодически переинжектим монитор (он может потеряться при навигации)
            await injectGenerationMonitor(tab);
            
            const isGenerating = await window.__TAURI__.core.invoke('check_generation_status', { tab });
            const wasGenerating = generatingTabs[tab] || false;
            
            if (wasGenerating !== isGenerating) {
                generatingTabs[tab] = isGenerating;
                changed = true;
                
                // Notification когда генерация закончилась
                if (wasGenerating && !isGenerating) {
                    showToast(`Чат ${tab}: Claude закончил`, 3000);
                }
            }
            
            // Обновляем URL таба (он мог измениться из-за навигации)
            const url = await window.__TAURI__.core.invoke('get_tab_url', { tab });
            if (url && url !== 'about:blank' && url.startsWith('https://claude.ai')) {
                tabUrls[tab] = url;
            }
        } catch (e) {
            // Ignore
        }
    }
    
    if (changed) {
        updateClaudeUI();
    }
}

/**
 * Запуск периодической проверки генерации
 */
function startGenerationMonitor() {
    if (generationCheckInterval) return;
    generationCheckInterval = setInterval(checkAllGenerationStatus, 500);
    
    // Периодически сохраняем URL табов (каждые 5 сек)
    if (!urlSaveInterval) {
        urlSaveInterval = setInterval(async () => {
            if (isClaudeVisible && existingTabs.length > 0) {
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
        if (activeProject?.uuid) {
            projectUuid = activeProject.uuid;
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
                        const link = document.querySelector('div.text-text-300 a[href^="/project/"]');
                        if (link) {
                            const href = link.getAttribute('href');
                            const match = href.match(/\\/project\\/([a-f0-9-]+)/i);
                            return match ? match[1] : null;
                        }
                        return null;
                    })();
                `;
                const result = await window.__TAURI__.core.invoke('eval_in_claude_with_result', { 
                    tab, 
                    script,
                    timeoutSecs: 2
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
        
        // Сбрасываем флаг после небольшой задержки (чтобы событие успело обработаться)
        setTimeout(() => { programmaticNavigation = false; }, 2000);
        
    } catch (e) {
        programmaticNavigation = false;
        // Fallback
        await navigateClaude(tab, 'https://claude.ai/new');
    }
}

/**
 * Закрыть таб Claude
 */
async function closeClaudeTab(tab) {
    try {
        // Таб 1 нельзя закрыть (на нём и нет крестика)
        if (tab === 1) return;
        
        const newActive = await window.__TAURI__.core.invoke('close_claude_tab', { tab });
        
        // Обновляем состояние
        existingTabs = existingTabs.filter(t => t !== tab);
        activeClaudeTab = newActive;
        delete tabNames[tab]; // Очищаем название закрытого таба
        
        updateClaudeUI();
        await saveClaudeSettings();
    } catch (e) {
        
        // Синхронизируем состояние после ошибки
        await updateClaudeState();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Восстановление состояния Claude
 */
async function restoreClaudeState() {
    const saved = loadClaudeSettings();
    
    // Сбрасываем кэш org_id при восстановлении состояния
    invalidateOrgCache();
    
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
                // Получаем URL для первого таба
                const tab1Url = saved?.tabUrls?.[1] || 'https://claude.ai/new';
                
                // Открываем Claude с первым табом
                isClaudeVisible = await window.__TAURI__.core.invoke('toggle_claude');
                
                // Даём время на создание первого webview
                await delay(300);
                
                // Если есть сохранённый URL для первого таба - переходим на него
                if (tab1Url && tab1Url !== 'https://claude.ai/new') {
                    await window.__TAURI__.core.invoke('switch_claude_tab_with_url', { tab: 1, url: tab1Url });
                }
                
                // Инжектим монитор в первый таб
                await injectGenerationMonitor(1);
                
                // Восстанавливаем дополнительные табы (2 и 3) с их URL
                if (saved?.existingTabs) {
                    for (const tab of [2, 3]) {
                        if (saved.existingTabs.includes(tab)) {
                            let tabUrl = saved.tabUrls?.[tab] || 'https://claude.ai/new';
                            // Защита от невалидных URL
                            if (!tabUrl || tabUrl === 'about:blank' || !tabUrl.startsWith('https://claude.ai')) {
                                tabUrl = 'https://claude.ai/new';
                            }
                            
                            // Retry механизм: 3 попытки по 10 сек
                            let loaded = false;
                            for (let attempt = 1; attempt <= 3 && !loaded; attempt++) {
                                await window.__TAURI__.core.invoke('switch_claude_tab_with_url', { tab, url: tabUrl });
                                loaded = await waitForTabLoad(tab, 10000);
                                if (!loaded && attempt < 3) {
                                    await window.__TAURI__.core.invoke('reload_claude_tab', { tab });
                                }
                            }
                            
                            await injectGenerationMonitor(tab);
                        }
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
            } else {
                // Claude был закрыт - предзагружаем webview в фоне
                window.__TAURI__.core.invoke('preload_claude').catch(() => {});
            }
        } else {
            // Нет сохранённых настроек - предзагружаем webview в фоне
            window.__TAURI__.core.invoke('preload_claude').catch(() => {});
        }
    } catch (e) {
        
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
            tabBtn.addEventListener('click', (e) => {
                // Если клик по кнопке закрытия - закрываем таб (только для чатов 2 и 3)
                const closeBtn = e.target.closest('.tab-close-btn');
                if (closeBtn && i > 1) {
                    e.stopPropagation();
                    const tab = parseInt(closeBtn.dataset.tab);
                    closeClaudeTab(tab);
                    return;
                }
                switchClaudeTab(i);
            });
            tabBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (existingTabs.includes(i)) {
                    newChatInTab(i);
                }
            });
        }
    }
    
    // Кнопка добавления чата
    document.getElementById('claude-add-tab')?.addEventListener('click', addNewChatTab);
    
    // Auto-send чекбокс
    const autoSendCheckbox = document.getElementById('auto-send-checkbox');
    if (autoSendCheckbox) {
        // Восстанавливаем состояние из localStorage
        autoSendCheckbox.checked = localStorage.getItem('claude_auto_send') === 'true';
        
        // Сохраняем при изменении
        autoSendCheckbox.addEventListener('change', () => {
            localStorage.setItem('claude_auto_send', autoSendCheckbox.checked);
        });
    }
    
    // Ресайзер
    createResizer();
    
    // Восстанавливаем сохранённое состояние
    restoreClaudeState();
    
    // Обновляем UI сразу (чтобы показать кнопку Чат 1)
    updateClaudeUI();
}

/**
 * Добавить новый чат
 */
async function addNewChatTab() {
    // Если Claude закрыт - сначала открываем
    if (!isClaudeVisible) {
        await toggleClaude();
    }
    
    // Находим первый свободный номер
    for (let i = 2; i <= 3; i++) {
        if (!existingTabs.includes(i)) {
            await switchClaudeTab(i);
            return;
        }
    }
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
 * Начинает привязку к проекту
 * @param {string} uuid - UUID проекта Claude
 * @param {string} name - Название проекта
 * @param {string} ownerTab - ID вкладки-владельца
 */
function startProject(uuid, name, ownerTab) {
    activeProject = { uuid, name, ownerTab };
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, JSON.stringify(activeProject));
    
    // Скрываем кнопку "Продолжить" (если была видна)
    hideContinueButton();
    
    // Показываем кнопку "Завершить" с анимацией
    const btn = document.getElementById('finish-project-btn');
    if (btn) {
        btn.classList.add('visible');
    }
    
    // Обновляем лимит скролла во view mode
    if (typeof adjustWorkflowScale === 'function') {
        adjustWorkflowScale();
    }
    
    // Обновляем кнопки чата
    if (typeof updateWorkflowChatButtons === 'function') {
        updateWorkflowChatButtons();
    }
    
    // Обновляем селектор вкладок (индикатор проекта)
    if (typeof updateTabSelectorUI === 'function') {
        updateTabSelectorUI();
    }
    
    showToast(`Проект "${name}" привязан`);
}

/**
 * Завершает привязку к проекту
 */
async function finishProject() {
    if (!activeProject) return;
    
    const projectName = activeProject.name;
    
    // Скрываем кнопку с анимацией
    const btn = document.getElementById('finish-project-btn');
    if (btn) {
        btn.classList.add('hiding');
        await delay(300);
        btn.classList.remove('visible', 'hiding');
    }
    
    activeProject = null;
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT);
    
    // Обновляем лимит скролла во view mode
    if (typeof adjustWorkflowScale === 'function') {
        adjustWorkflowScale();
    }
    
    // Обновляем кнопки чата
    if (typeof updateWorkflowChatButtons === 'function') {
        updateWorkflowChatButtons();
    }
    
    // Обновляем селектор вкладок (убираем индикатор проекта)
    if (typeof updateTabSelectorUI === 'function') {
        updateTabSelectorUI();
    }
    
    // Проверяем, не нужно ли показать кнопку "Продолжить"
    checkForContinueProject();
    
    showToast(`Проект "${projectName}" завершён`);
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
        const result = await window.__TAURI__.core.invoke('eval_in_claude_with_result', {
            tab: activeClaudeTab,
            script: `
                (function() {
                    // Пробуем получить из breadcrumb
                    const link = document.querySelector('a[href*="/project/${uuid}"]');
                    if (link) return link.textContent.trim();
                    // Пробуем из заголовка
                    const h1 = document.querySelector('h1');
                    if (h1) return h1.textContent.trim();
                    return null;
                })();
            `,
            timeoutSecs: 3
        });
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
    if (activeProject) {
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
    if (btn && !activeProject) {
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
 * Восстанавливает состояние привязки к проекту при загрузке
 */
function restoreProjectState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
        if (saved) {
            const project = JSON.parse(saved);
            if (project && project.uuid) {
                activeProject = project;
                
                // Показываем кнопку
                const btn = document.getElementById('finish-project-btn');
                if (btn) {
                    btn.classList.add('visible');
                }
            }
        }
    } catch (e) {
        // Restore failed
    }
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


