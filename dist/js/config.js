/**
 * AI Prompts Manager - Configuration
 * Константы и настройки приложения
 */

// Ключи localStorage
const STORAGE_KEYS = {
    // Основные данные
    TABS: 'ai-prompts-manager-tabs',
    SETTINGS: 'ai-prompts-manager-settings',
    CURRENT_TAB: 'ai-prompts-manager-tab',
    LANGUAGE: 'ai-prompts-manager-language',
    
    // Версионирование
    DATA_VERSION: 'ai-prompts-manager-version',
    APP_VERSION: 'ai-prompts-manager-app-version',
    
    // Workflow
    WORKFLOW_ZOOM: 'workflowZoom',
    COLLAPSED_BLOCKS: 'collapsed-blocks',
    BLOCK_SCRIPTS: 'block-scripts',
    BLOCK_AUTOMATION: 'block-automation',
    
    // Claude
    CLAUDE_SETTINGS: 'claudeSettings',
    CLAUDE_AUTO_SEND: 'claude_auto_send',
    ACTIVE_PROJECT: 'active-project', // Привязка к проекту Claude
    
    // Динамические ключи (функции)
    workflow: (tabId) => `workflow-${tabId}`,
    promptsData: (tabId) => `ai-prompts-manager-data-${tabId}`,
    fieldValue: (fieldId) => `field-value-${fieldId}`
};

// URL адреса
const URLS = {
    CLAUDE_NEW: 'https://claude.ai/new',
    GITHUB_RELEASES: 'https://api.github.com/repos/IllWicked/ai-prompts-manager/releases/latest'
};

// Default tab ID (null = первая доступная вкладка)
const DEFAULT_TAB = null;

// Workflow node defaults
const NODE_DEFAULT_WIDTH = 680;

// SVG иконки
const SVG_ICONS = {
    arrow: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M14 5l7 7-7 7"/></svg>',
    arrowSmall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M14 5l7 7-7 7"/></svg>',
    chevronDown: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>',
    chevronUp: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#228c46" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l3 3 7-7"/></svg>',
    dot: '<svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor"><circle cx="3" cy="3" r="3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    rename: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    script: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    automation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>'
};

// Версия данных (увеличить при изменении структуры)
const CURRENT_DATA_VERSION = 4;

// Константы таймаутов (мс)
const TIMEOUTS = {
    ANIMATION: 300,        // Анимации UI
    FOCUS: 50,             // Фокус элементов
    SCROLL: 50,            // Скролл к элементам
    INPUT_FOCUS: 100,      // Фокус на input
    DEBOUNCE_SAVE: 2000,   // Debounce автосохранения
    AUTOSAVE: 30000,       // Периодическое автосохранение
    MENU_SCROLL: 10,       // Обновление скроллбара меню
    GENERATION_CHECK: 500, // Проверка статуса генерации
    URL_SAVE: 2000         // Сохранение URL табов
};

/**
 * Конфигурация Workflow режима
 * @constant {Object}
 */
const WORKFLOW_CONFIG = {
    // Сетка
    GRID_SIZE: 40,
    
    // Размеры нод
    NODE_MIN_WIDTH: 480,
    NODE_MIN_HEIGHT: 440,
    NODE_DEFAULT_WIDTH: 680,
    NODE_GAP_X: 40,
    NODE_GAP_Y: 40,
    
    // Canvas
    CANVAS_SIZE: 5000,
    CANVAS_CENTER: 2500,
    
    // Связи
    MAGNET_DISTANCE: 30,
    
    // Zoom
    ZOOM_MIN: 0.4,
    ZOOM_MAX: 1.25
};

// Debug режим (отключить в продакшене)
const DEBUG = false;

/**
 * Логирование в debug режиме
 * @param {...any} args - аргументы для console.log
 */
function log(...args) { if (DEBUG) console.log('[APM]', ...args); }
