/**
 * AI Prompts Manager - Storage Functions
 * Функции для работы с localStorage
 */

/**
 * Настройки приложения по умолчанию
 * @constant {Object}
 */
const DEFAULT_SETTINGS = {
    autoUpdate: true,
    theme: 'auto', // 'light', 'dark', 'auto'
    adminMode: false // Режим редактирования
};

/**
 * Получить текущие настройки приложения
 * @returns {Object} настройки с дефолтными значениями
 */
function getSettings() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch (e) {
        return DEFAULT_SETTINGS;
    }
}

// Сохранить настройки
function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

// Generic load/save для JSON объектов в localStorage
function loadFromStorage(key, defaultValue = {}) {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue));
    } catch(e) {
        return defaultValue;
    }
}

function saveToStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// Кэш для tabs (оптимизация - избегаем повторного JSON.parse)
let _tabsCache = null;

/**
 * Установить кэш вкладок напрямую (для undo/redo)
 * @param {Object} tabs - объект со всеми вкладками
 */
function setTabsCache(tabs) {
    _tabsCache = tabs;
}

/**
 * Валидация структуры вкладки
 * @param {Object} tab - объект вкладки
 * @returns {boolean} - валидна ли структура
 */
function isValidTab(tab) {
    if (!tab || typeof tab !== 'object') return false;
    if (typeof tab.id !== 'string' || !tab.id) return false;
    if (typeof tab.name !== 'string') return false;
    if (!Array.isArray(tab.items)) return false;
    
    // Проверяем items
    return tab.items.every(item => {
        if (!item || typeof item !== 'object') return false;
        if (item.type !== 'block') return false;
        if (typeof item.id !== 'string' || !item.id) return false;
        return true;
    });
}

/**
 * Валидация структуры всех вкладок
 * @param {Object} tabs - объект со всеми вкладками
 * @returns {boolean} - валидна ли структура
 */
function isValidTabsStructure(tabs) {
    if (!tabs || typeof tabs !== 'object' || Array.isArray(tabs)) return false;
    if (Object.keys(tabs).length === 0) return false;
    
    return Object.entries(tabs).every(([id, tab]) => {
        // id ключа должен совпадать с tab.id
        if (tab.id !== id) return false;
        return isValidTab(tab);
    });
}

/**
 * Восстановление повреждённой вкладки
 * @param {string} tabId - ID вкладки
 * @param {Object} tab - объект вкладки (может быть повреждён)
 * @returns {Object} - восстановленная вкладка
 */
function repairTab(tabId, tab) {
    const repaired = {
        id: tabId,
        name: (tab && typeof tab.name === 'string') ? tab.name : tabId,
        order: (tab && typeof tab.order === 'number') ? tab.order : 999,
        items: []
    };
    
    // Пытаемся восстановить items
    if (tab && Array.isArray(tab.items)) {
        tab.items.forEach((item, idx) => {
            if (item && typeof item === 'object' && item.type === 'block') {
                repaired.items.push({
                    type: 'block',
                    id: item.id || `repaired_${Date.now()}_${idx}`,
                    number: item.number || (idx + 1),
                    title: item.title || `Block ${idx + 1}`,
                    content: item.content || ''
                });
            }
        });
    }
    
    return repaired;
}

// Получить все вкладки из localStorage (с кэшированием и валидацией)
function getAllTabs() {
    // Возвращаем кэш если есть
    if (_tabsCache !== null) {
        return _tabsCache;
    }
    
    try {
        const data = localStorage.getItem(STORAGE_KEYS.TABS);
        if (data) {
            const parsed = JSON.parse(data);
            
            // Валидация структуры
            if (!isValidTabsStructure(parsed)) {
                
                
                // Пытаемся восстановить
                const repaired = {};
                let hasValidTabs = false;
                
                if (parsed && typeof parsed === 'object') {
                    Object.entries(parsed).forEach(([id, tab]) => {
                        repaired[id] = repairTab(id, tab);
                        hasValidTabs = true;
                    });
                }
                
                if (hasValidTabs) {
                    
                    _tabsCache = repaired;
                    // Сохраняем восстановленные данные
                    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(repaired));
                    return _tabsCache;
                }
                
                // Если восстановить не удалось - инициализируем заново
                
                initializeDefaultTabs();
                _tabsCache = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS) || '{}');
                return _tabsCache;
            }
            
            _tabsCache = parsed;
            return _tabsCache;
        }
        // Если нет данных - инициализируем из дефолтной конфигурации
        initializeDefaultTabs();
        _tabsCache = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS) || '{}');
        return _tabsCache;
    } catch (e) {
        
        // При ошибке парсинга пытаемся инициализировать заново
        try {
            initializeDefaultTabs();
            _tabsCache = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS) || '{}');
            return _tabsCache;
        } catch (e2) {
            
            return {};
        }
    }
}

// Сохранить все вкладки (обновляет кэш)
function saveAllTabs(tabs, skipUndo = false) {
    _tabsCache = tabs; // Обновляем кэш
    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
    if (!skipUndo) {
        autoSaveToUndo();
    }
}
