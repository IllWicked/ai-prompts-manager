/**
 * AI Prompts Manager - Persistence
 * Функции для работы с localStorage, инициализации данных и сброса приложения
 * 
 * @requires config.js (STORAGE_KEYS, CURRENT_DATA_VERSION, DEFAULT_TAB)
 * @requires storage.js (getAllTabs, saveAllTabs)
 * @requires blocks.js (hasBlockScript, toggleBlockScript, collapsedBlocks, 
 *                      blockAutomation, saveCollapsedBlocks, saveBlockAutomation)
 * @requires utils.js (generateItemId, debounce, getAppVersion)
 * @requires undo.js (autoSaveToUndo, isUndoRedoAction)
 * @requires remote-prompts.js (initializeRemotePrompts, showPromptsReleaseNotes)
 * @requires claude-api.js (stopGenerationMonitor)
 * @requires app-state.js (isResetting, isClaudeVisible, tabUrls, generatingTabs, 
 *                         activeProject, workflowPositions, workflowConnections, 
 *                         workflowSizes, collapsedBlocks, blockScripts, blockAutomation)
 * 
 * Экспортирует:
 *   - performReset(options) — общая функция сброса
 *   - checkAppVersionAndReset() — авто-сброс при обновлении версии
 *   - confirmReset() — ручной сброс (Reset All)
 */

// ═══════════════════════════════════════════════════════════════════════════
// КОНВЕРТАЦИЯ ДАННЫХ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Конвертируем старые массивы в структуру вкладок
 * @param {string} id - ID вкладки
 * @param {string} name - название вкладки
 * @param {number} order - порядок сортировки
 * @param {Array} blocks - массив блоков
 * @returns {Object} - структура вкладки
 */
function convertToTabStructure(id, name, order, blocks) {
    const items = [];
    
    blocks.forEach(b => {
        // Добавляем блок (используем фиксированный ID если есть)
        const block = {
            type: 'block',
            id: b.id || generateItemId(),
            title: b.title,
            content: b.content || '',
            instruction: b.instruction ? b.instruction : (b.note ? { type: "info", text: b.note } : null)
        };
        
        // Добавляем hasAttachments если есть
        if (b.hasAttachments) {
            block.hasAttachments = true;
        }
        
        // Добавляем scripts в blockScripts если есть
        if (b.scripts && b.scripts.length > 0) {
            b.scripts.forEach(scriptKey => {
                if (!hasBlockScript(block.id, scriptKey)) {
                    toggleBlockScript(block.id, scriptKey);
                }
            });
        }
        
        // Добавляем collapsed если есть
        if (b.collapsed) {
            collapsedBlocks[block.id] = true;
        }
        
        // Добавляем automation если есть
        if (b.automation) {
            blockAutomation[block.id] = { ...b.automation };
        }
        
        items.push(block);
    });
    
    // Сохраняем collapsed и automation после обработки всех блоков
    saveCollapsedBlocks();
    saveBlockAutomation();
    
    return {
        id,
        name,
        order,
        items
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ ДАННЫХ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Инициализация дефолтных вкладок при первом запуске (загрузка с GitHub)
 */
async function initializeDefaultTabs() {
    // Данные уже есть - ничего не делаем
    if (localStorage.getItem(STORAGE_KEYS.TABS)) {
        return;
    }
    
    // Пытаемся загрузить с GitHub
    if (typeof initializeRemotePrompts === 'function') {
        try {
            const result = await initializeRemotePrompts();
            if (result.success) {
                // Показываем модалку "Промпты загружены"
                if (typeof showPromptsReleaseNotes === 'function' && result.tabs) {
                    showPromptsReleaseNotes(result.tabs, [], result.releaseNotes);
                }
                return;
            }
        } catch (e) {
            console.error('[Init] Failed to load remote prompts:', e);
        }
    }
    
    // Fallback: создаём пустую вкладку
    const defaultTabs = {
        'default': {
            name: 'DEFAULT',
            items: [{
                id: 'item_fallback_1',
                number: '1',
                title: 'Добро пожаловать',
                content: 'Не удалось загрузить промпты с сервера.\n\nПроверьте подключение к интернету и перезапустите приложение.'
            }]
        }
    };
    
    saveAllTabs(defaultTabs, true);
}

// ═══════════════════════════════════════════════════════════════════════════
// ОПЕРАЦИИ С LOCAL STORAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Возвращает ключ localStorage для текущей вкладки
 * @returns {string} - ключ localStorage
 */
function getCurrentStorageKey() {
    return STORAGE_KEYS.promptsData(currentTab);
}

/**
 * Сохраняет содержимое промпта в локальное хранилище.
 * @param {string} key - ID блока или номер секции
 * @param {string} content - Содержимое для сохранения
 */
function saveToLocalStorage(key, content) {
    // Не записываем в undo во время undo/redo операций
    if (isUndoRedoAction) return;
    
    try {
        const storageKey = getCurrentStorageKey();
        const storedData = JSON.parse(localStorage.getItem(storageKey) || '{}');
        storedData[key] = content;
        localStorage.setItem(storageKey, JSON.stringify(storedData));
        // Сохраняем версию данных
        localStorage.setItem(STORAGE_KEYS.DATA_VERSION, CURRENT_DATA_VERSION.toString());
        autoSaveToUndo();
    } catch (e) {
        // Игнорируем ошибки
    }
}

/**
 * Загружает промпты из локального хранилища.
 * @returns {Object} Сохраненный объект промптов или пустой объект
 */
function loadFromLocalStorage() {
    try {
        const storageKey = getCurrentStorageKey();
        // Проверяем версию данных
        const savedVersion = parseInt(localStorage.getItem(STORAGE_KEYS.DATA_VERSION) || '0');
        if (savedVersion < CURRENT_DATA_VERSION) {
            // Версия устарела - очищаем старые данные
            localStorage.removeItem(STORAGE_KEYS.LANGUAGE);
            localStorage.setItem(STORAGE_KEYS.DATA_VERSION, CURRENT_DATA_VERSION.toString());
            return {};
        }
        return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (e) {
        return {};
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// СБРОС ДАННЫХ ПРИЛОЖЕНИЯ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Общая функция сброса данных приложения
 * Используется как для ручного сброса (Reset All), так и для авто-сброса при обновлении
 * 
 * @param {Object} options
 * @param {boolean} options.reloadPage - перезагружать страницу после сброса
 * @param {boolean} options.callRustCommands - вызывать Rust команды (reset_claude_state, reset_app_data)
 */
async function performReset(options = {}) {
    const { reloadPage = false, callRustCommands = false } = options;
    
    // Устанавливаем флаг сброса (чтобы beforeunload не сохранял)
    isResetting = true;
    
    // Останавливаем мониторинг генерации
    if (typeof stopGenerationMonitor === 'function') {
        stopGenerationMonitor();
    }
    
    // Очищаем JS переменные Claude
    isClaudeVisible = false;
    tabUrls = {};
    generatingTabs = {};
    activeProject = null;
    
    // Очищаем JS переменные workflow
    workflowPositions = {};
    workflowConnections = [];
    workflowSizes = {};
    
    // Очищаем JS переменные блоков
    collapsedBlocks = {};
    blockScripts = {};
    blockAutomation = {};
    
    // Сохраняем настройки перед сбросом
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    
    // Очищаем все ключи localStorage (включая старые версии)
    localStorage.removeItem(STORAGE_KEYS.LANGUAGE);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_TAB);
    localStorage.removeItem(STORAGE_KEYS.TABS);
    localStorage.removeItem('claude-ai-prompts-data-v2');
    localStorage.removeItem('claude-ai-prompts-language-v2');
    
    // Сбрасываем данные блоков
    localStorage.removeItem(STORAGE_KEYS.COLLAPSED_BLOCKS);
    localStorage.removeItem(STORAGE_KEYS.BLOCK_SCRIPTS);
    localStorage.removeItem(STORAGE_KEYS.BLOCK_AUTOMATION);
    
    // Сбрасываем Claude чаты и активный проект
    localStorage.removeItem(STORAGE_KEYS.CLAUDE_SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT);
    
    // Legacy ключи (v3.x)
    localStorage.removeItem('ai-prompts-manager-data');
    localStorage.removeItem('ai-prompts-manager-data-task4');
    
    // Очищаем динамические ключи (workflow-*, field-value-*, etc.)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
            key.startsWith('claude-ai-prompts') || 
            key.startsWith('ai-prompts-manager') ||
            key.startsWith('workflow-') ||
            key.startsWith('field-value-') ||
            key.startsWith('collapsed-') ||
            key.startsWith('block-') ||
            key.startsWith('remote-prompts')
        )) {
            // Не удаляем ключи настроек
            if (!key.includes('settings')) {
                keysToRemove.push(key);
            }
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Восстанавливаем настройки
    if (savedSettings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, savedSettings);
    }
    
    // Вызываем Rust-команды если нужно
    if (callRustCommands && window.__TAURI__?.core) {
        await window.__TAURI__.core.invoke('reset_claude_state');
        await window.__TAURI__.core.invoke('reset_app_data');
    }
    
    // Перезагружаем страницу если нужно
    if (reloadPage) {
        location.reload();
    }
}

/**
 * Проверяет версию приложения и сбрасывает данные при обновлении
 * Вызывается автоматически при старте
 */
async function checkAppVersionAndReset() {
    try {
        const currentAppVersion = await getAppVersion();
        const savedAppVersion = localStorage.getItem(STORAGE_KEYS.APP_VERSION) || '0.3.0';
        
        const needsReset = currentAppVersion !== savedAppVersion;
        
        if (needsReset && savedAppVersion !== '0.3.0') {
            // Авто-сброс: без перезагрузки (уже при старте), без Rust команд (webview пересоздадутся)
            await performReset({ reloadPage: false, callRustCommands: false });
        }
        
        // Сохраняем текущую версию
        if (currentAppVersion !== '0.3.0') {
            localStorage.setItem(STORAGE_KEYS.APP_VERSION, currentAppVersion);
        }
    } catch (e) {
        // Игнорируем ошибки
    }
}

/**
 * Ручной сброс всех данных приложения (Reset All)
 * Вызывается из модального окна настроек
 */
async function confirmReset() {
    try {
        // Полный сброс: с перезагрузкой и Rust командами
        await performReset({ reloadPage: true, callRustCommands: true });
    } catch (e) {
        // Всё равно перезагружаем
        location.reload();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Инициализирует сохранение (только LocalStorage)
 */
async function initializePersistence() {
    await checkAppVersionAndReset(); // Проверка версии и сброс при обновлении
}

/**
 * Сохраняет содержимое промпта, используя активный механизм (только LocalStorage).
 * С debounce 800ms
 * @param {string} key - ID блока или номер секции
 * @param {string} content - Содержимое для сохранения
 */
const savePrompt = debounce((key, content) => {
    saveToLocalStorage(key, content);
}, 800);

/**
 * Загружает промпты, рендерит UI и применяет сохраненные данные.
 * @param {boolean|null} preserveScroll - сохранять ли позицию скролла
 */
function loadPrompts(preserveScroll = null) {
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // По умолчанию в edit mode сохраняем скролл
    const shouldPreserveScroll = preserveScroll !== null ? preserveScroll : isEditMode;

    // Скрыть оверлей загрузки
    loadingOverlay.classList.add('hidden');
    
    // Загружаем состояние и рендерим workflow
    loadWorkflowState();
    renderWorkflow(shouldPreserveScroll);
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.convertToTabStructure = convertToTabStructure;
window.initializeDefaultTabs = initializeDefaultTabs;
window.getCurrentStorageKey = getCurrentStorageKey;
window.saveToLocalStorage = saveToLocalStorage;
window.loadFromLocalStorage = loadFromLocalStorage;
window.performReset = performReset;
window.checkAppVersionAndReset = checkAppVersionAndReset;
window.confirmReset = confirmReset;
window.initializePersistence = initializePersistence;
window.savePrompt = savePrompt;
window.loadPrompts = loadPrompts;
