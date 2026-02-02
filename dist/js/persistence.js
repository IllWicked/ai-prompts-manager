/**
 * AI Prompts Manager - Persistence
 * Функции для работы с localStorage и инициализации данных
 * 
 * @requires config.js (STORAGE_KEYS, CURRENT_DATA_VERSION, DEFAULT_TAB)
 * @requires storage.js (getAllTabs, saveAllTabs)
 * @requires blocks.js (hasBlockScript, toggleBlockScript, collapsedBlocks, 
 *                      blockAutomation, saveCollapsedBlocks, saveBlockAutomation)
 * @requires utils.js (generateItemId, debounce, getAppVersion)
 * @requires undo.js (autoSaveToUndo, isUndoRedoAction)
 * @requires remote-prompts.js (initializeRemotePrompts, showPromptsReleaseNotes)
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
// ВЕРСИОНИРОВАНИЕ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Проверяет версию приложения и сбрасывает данные при обновлении
 */
async function checkAppVersionAndReset() {
    try {
        // Получаем версию из Tauri
        const currentAppVersion = await getAppVersion();
        
        const savedAppVersion = localStorage.getItem(STORAGE_KEYS.APP_VERSION) || '0.3.0';
        
        // Сброс если версия изменилась (любой компонент: мажор, минор или патч)
        const needsReset = currentAppVersion !== savedAppVersion;
        
        if (needsReset && savedAppVersion !== '0.3.0') {
            // Сбрасываем данные вкладок
            localStorage.removeItem(STORAGE_KEYS.TABS);
            // Очистка legacy ключей (v3.x)
            localStorage.removeItem('ai-prompts-manager-data');
            localStorage.removeItem('ai-prompts-manager-data-task4');
            // НЕ трогаем: STORAGE_KEYS.SETTINGS (тема, автообновление), язык
        }
        
        // Сохраняем текущую версию
        if (currentAppVersion !== '0.3.0') {
            localStorage.setItem(STORAGE_KEYS.APP_VERSION, currentAppVersion);
        }
        
    } catch (e) {
        // Игнорируем ошибки
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
window.checkAppVersionAndReset = checkAppVersionAndReset;
window.initializePersistence = initializePersistence;
window.savePrompt = savePrompt;
window.loadPrompts = loadPrompts;
