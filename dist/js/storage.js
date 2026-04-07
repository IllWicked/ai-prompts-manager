/**
 * AI Prompts Manager - Storage Functions
 * Гибридное хранение: файловая система (Tauri) + localStorage (кэш/fallback)
 */

/**
 * Настройки приложения по умолчанию
 * @constant {Object}
 */
const DEFAULT_SETTINGS = {
    autoUpdate: true,
    theme: 'auto', // 'light', 'dark', 'auto'
    adminMode: false, // Режим редактирования
    accentColor: '#ec7441', // Акцентный цвет
    canvasPattern: 'none', // Паттерн фона: 'none','grid','diagonal','waves','squares','grid3d','custom'
    offlineMode: false, // Оффлайн-режим: без Claude WebView, копирование вместо отправки
    autoContinue: true // Авто-продолжение: автоматический клик Continue при tool-use limit
};

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE MONITOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Мониторинг использования localStorage
 */
const StorageMonitor = {
    /** Получить использование localStorage в байтах */
    getUsageBytes() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += (localStorage[key].length + key.length) * 2; // UTF-16
            }
        }
        return total;
    },
    
    /** Получить использование в человекочитаемом формате */
    getUsageFormatted() {
        const bytes = this.getUsageBytes();
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    },
    
    /** Получить использование по ключам (топ-10 самых тяжёлых) */
    getBreakdown() {
        const entries = [];
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                const size = (localStorage[key].length + key.length) * 2;
                entries.push({ key, size });
            }
        }
        entries.sort((a, b) => b.size - a.size);
        return entries.slice(0, 10);
    },
    
    /** Примерный лимит localStorage (5 MB для большинства браузеров) */
    LIMIT_BYTES: 5 * 1024 * 1024,
    
    /** Процент использования (0-100) */
    getUsagePercent() {
        return Math.min(100, Math.round(this.getUsageBytes() / this.LIMIT_BYTES * 100));
    },
    
    /** Предупреждение при >80% использования */
    checkAndWarn() {
        const percent = this.getUsagePercent();
        if (percent > 80) {
            const formatted = this.getUsageFormatted();
            if (typeof showToast === 'function') {
                showToast(`Хранилище: ${formatted} (${percent}%). Рекомендуется очистка.`);
            }
            // Записываем в диагностику
            if (typeof writeDiagnostic === 'function') {
                writeDiagnostic('storage', { 
                    usage: formatted, 
                    percent,
                    breakdown: this.getBreakdown().slice(0, 5)
                });
            }
            return true;
        }
        return false;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// BASIC STORAGE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

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

// Generic save для JSON объектов в localStorage
function saveToStorage(key, value) {
    safeSetItem(key, JSON.stringify(value));
}

/**
 * Безопасная запись в localStorage с обработкой QuotaExceededError
 * @param {string} key - ключ
 * @param {string} value - значение (уже сериализованное)
 * @returns {boolean} - успех записи
 */
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.error('[Storage] Quota exceeded for key:', key);
            if (typeof showToast === 'function') {
                showToast('Хранилище переполнено. Очистите историю или удалите старые вкладки.');
            }
            return false;
        }
        console.error('[Storage] Failed to save:', key, e);
        throw e;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TABS VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

// Кэш для tabs
let _tabsCache = null;

/**
 * Установить кэш вкладок напрямую (для undo/redo)
 */
function setTabsCache(tabs) {
    _tabsCache = tabs;
}

function isValidTab(tab) {
    if (!tab || typeof tab !== 'object') return false;
    if (typeof tab.id !== 'string' || !tab.id) return false;
    if (typeof tab.name !== 'string') return false;
    if (!Array.isArray(tab.items)) return false;
    return tab.items.every(item => {
        if (!item || typeof item !== 'object') return false;
        if (item.type !== 'block') return false;
        if (typeof item.id !== 'string' || !item.id) return false;
        return true;
    });
}

function isValidTabsStructure(tabs) {
    if (!tabs || typeof tabs !== 'object' || Array.isArray(tabs)) return false;
    if (Object.keys(tabs).length === 0) return false;
    return Object.entries(tabs).every(([id, tab]) => {
        if (tab.id !== id) return false;
        return isValidTab(tab);
    });
}

function repairTab(tabId, tab) {
    const repaired = {
        id: tabId,
        name: (tab && typeof tab.name === 'string') ? tab.name : tabId,
        items: []
    };
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
            } else if (item && typeof item === 'object' && item.type === 'scraper') {
                repaired.items.push({
                    type: 'scraper',
                    id: item.id || `scraper-repaired_${Date.now()}_${idx}`,
                    title: item.title || 'SERP Scraper',
                    keyword: item.keyword || '',
                    queries: item.queries || undefined,
                    result: item.result || null
                });
            }
        });
    }
    return repaired;
}

// ═══════════════════════════════════════════════════════════════════════════
// HYBRID TABS STORAGE (File + localStorage)
// ═══════════════════════════════════════════════════════════════════════════

/** @type {boolean} Флаг: файловое хранение доступно */
let _fileStorageAvailable = null;

/**
 * Проверить доступность файлового хранения (Tauri)
 */
async function isFileStorageAvailable() {
    if (_fileStorageAvailable !== null) return _fileStorageAvailable;
    try {
        _fileStorageAvailable = !!(window.__TAURI__?.core?.invoke);
        return _fileStorageAvailable;
    } catch (_) {
        _fileStorageAvailable = false;
        return false;
    }
}

/**
 * Загрузить вкладки из файла (Tauri)
 * @returns {Object|null} - данные вкладок или null
 */
async function loadTabsFromFile() {
    try {
        const data = await window.__TAURI__.core.invoke('load_tabs_from_file');
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        // File storage failed
    }
    return null;
}

/**
 * Сохранить вкладки в файл (Tauri) — асинхронно, не блокирует UI
 * @param {Object} tabs - данные вкладок
 */
async function saveTabsToFile(tabs) {
    try {
        await window.__TAURI__.core.invoke('save_tabs_to_file', {
            data: JSON.stringify(tabs)
        });
    } catch (e) {
        console.error('[Storage] File save failed:', e);
    }
}

/**
 * Получить все вкладки — гибридное хранение
 * Приоритет: кэш → файл (Tauri) → localStorage
 */
function getAllTabs() {
    // Возвращаем кэш если есть
    if (_tabsCache !== null) {
        return _tabsCache;
    }
    
    // Синхронно: пробуем localStorage (быстрый кэш)
    try {
        const data = localStorage.getItem(STORAGE_KEYS.TABS);
        if (data) {
            const parsed = JSON.parse(data);
            
            if (!isValidTabsStructure(parsed)) {
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
                    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(repaired));
                    return _tabsCache;
                }
                _tabsCache = {};
                return _tabsCache;
            }
            
            _tabsCache = parsed;
            return _tabsCache;
        }
        _tabsCache = {};
        return _tabsCache;
    } catch (e) {
        _tabsCache = {};
        return _tabsCache;
    }
}

/**
 * Инициализировать гибридное хранение
 * Вызывается при старте приложения — подтягивает данные из файла если нужно
 */
async function initHybridStorage() {
    if (!await isFileStorageAvailable()) return;
    
    const localData = localStorage.getItem(STORAGE_KEYS.TABS);
    const fileData = await loadTabsFromFile();
    
    if (fileData && !localData) {
        // Есть файл, нет localStorage — восстанавливаем (первый запуск после миграции)
        if (isValidTabsStructure(fileData)) {
            _tabsCache = fileData;
            safeSetItem(STORAGE_KEYS.TABS, JSON.stringify(fileData));
        }
    } else if (!fileData && localData) {
        // Есть localStorage, нет файла — первая миграция на файловое хранение
        saveTabsToFile(getAllTabs());
    } else if (fileData && localData) {
        // Оба источника есть — используем localStorage (он обновляется синхронно)
        // Но синхронизируем файл
        saveTabsToFile(getAllTabs());
    }
    
    // Проверяем использование хранилища
    StorageMonitor.checkAndWarn();
}

/**
 * Сохранить все вкладки — гибридно
 * Синхронно: localStorage (кэш). Асинхронно: файл (backup).
 */
function saveAllTabs(tabs) {
    _tabsCache = tabs;
    safeSetItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
    
    // Асинхронно сохраняем в файл (не блокирует UI)
    if (_fileStorageAvailable) {
        saveTabsToFile(tabs);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

window.StorageMonitor = StorageMonitor;
window.initHybridStorage = initHybridStorage;
