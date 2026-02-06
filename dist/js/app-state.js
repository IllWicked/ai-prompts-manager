/**
 * AI Prompts Manager - Application State
 * Глобальное состояние приложения и алиасы для обратной совместимости
 * 
 * @description
 * Этот модуль инициализирует window.AppState — единый источник истины
 * для всего состояния приложения. Также создаёт алиасы на window
 * для обратной совместимости с существующим кодом.
 * 
 * @requires config.js (STORAGE_KEYS, DEFAULT_TAB)
 */

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
window.onerror = (msg, src, line, col, err) => {
    return false;
};
window.onunhandledrejection = (e) => {
};

// ═══════════════════════════════════════════════════════════════════════════
// SHARED STATE — единое состояние приложения
// ═══════════════════════════════════════════════════════════════════════════

window.AppState = {
    // Workflow состояние
    workflow: {
        mode: true,
        connections: [],
        positions: {},
        sizes: {},
        zoom: parseFloat(localStorage.getItem(STORAGE_KEYS.WORKFLOW_ZOOM)) || 0.6
    },
    // Состояние взаимодействия (drag, resize, select)
    interaction: {
        isResizing: false,
        resizeNode: null,
        resizeStart: { x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 },
        resizeDirection: null,
        selectedNodes: new Set(),
        isDragging: false,
        dragOffsets: {},
        clipboard: [],
        isCreatingConnection: false,
        connectionStart: null,
        tempLineEl: null
    },
    // Claude панель
    claude: {
        isVisible: false,
        activeTab: 1,
        generatingTabs: {},
        tabUrls: {},
        tabNames: {},
        panelRatio: 50,
        isResetting: false,
        project: null
    },
    // Ресайзер панелей Claude
    resizer: {
        element: null,
        isResizing: false,
        startX: 0,
        startRatio: 0,
        windowWidth: 0,
        lastAppliedRatio: 0,
        updateScheduled: false
    },
    // Общее состояние приложения
    app: {
        currentTab: localStorage.getItem(STORAGE_KEYS.CURRENT_TAB) || DEFAULT_TAB,
        isEditMode: false,
        isAdminMode: false,
        isAppInitialized: false,
        currentLanguage: localStorage.getItem(STORAGE_KEYS.LANGUAGE) || 'en'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// АЛИАСЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ═══════════════════════════════════════════════════════════════════════════

// App state алиасы
Object.defineProperty(window, 'currentTab', {
    get() { return window.AppState.app.currentTab; },
    set(v) { window.AppState.app.currentTab = v; }
});
Object.defineProperty(window, 'isEditMode', {
    get() { return window.AppState.app.isEditMode; },
    set(v) { window.AppState.app.isEditMode = v; }
});
Object.defineProperty(window, 'isAdminMode', {
    get() { return window.AppState.app.isAdminMode; },
    set(v) { window.AppState.app.isAdminMode = v; }
});
Object.defineProperty(window, 'currentLanguage', {
    get() { return window.AppState.app.currentLanguage; },
    set(v) { window.AppState.app.currentLanguage = v; }
});

// Workflow алиасы
Object.defineProperty(window, 'workflowMode', {
    get() { return window.AppState.workflow.mode; },
    set(v) { window.AppState.workflow.mode = v; }
});
Object.defineProperty(window, 'workflowConnections', {
    get() { return window.AppState.workflow.connections; },
    set(v) { window.AppState.workflow.connections = v; }
});
Object.defineProperty(window, 'workflowPositions', {
    get() { return window.AppState.workflow.positions; },
    set(v) { window.AppState.workflow.positions = v; }
});
Object.defineProperty(window, 'workflowSizes', {
    get() { return window.AppState.workflow.sizes; },
    set(v) { window.AppState.workflow.sizes = v; }
});
Object.defineProperty(window, 'workflowZoom', {
    get() { return window.AppState.workflow.zoom; },
    set(v) { window.AppState.workflow.zoom = v; }
});

// Interaction алиасы
Object.defineProperty(window, 'isResizingNode', {
    get() { return window.AppState.interaction.isResizing; },
    set(v) { window.AppState.interaction.isResizing = v; }
});
Object.defineProperty(window, 'resizeNode', {
    get() { return window.AppState.interaction.resizeNode; },
    set(v) { window.AppState.interaction.resizeNode = v; }
});
Object.defineProperty(window, 'resizeDirection', {
    get() { return window.AppState.interaction.resizeDirection; },
    set(v) { window.AppState.interaction.resizeDirection = v; }
});
Object.defineProperty(window, 'selectedNodes', {
    get() { return window.AppState.interaction.selectedNodes; },
    set(v) { window.AppState.interaction.selectedNodes = v; }
});
Object.defineProperty(window, 'isDraggingNode', {
    get() { return window.AppState.interaction.isDragging; },
    set(v) { window.AppState.interaction.isDragging = v; }
});
Object.defineProperty(window, 'dragOffsets', {
    get() { return window.AppState.interaction.dragOffsets; },
    set(v) { window.AppState.interaction.dragOffsets = v; }
});
Object.defineProperty(window, 'clipboard', {
    get() { return window.AppState.interaction.clipboard; },
    set(v) { window.AppState.interaction.clipboard = v; }
});
Object.defineProperty(window, 'isCreatingConnection', {
    get() { return window.AppState.interaction.isCreatingConnection; },
    set(v) { window.AppState.interaction.isCreatingConnection = v; }
});
Object.defineProperty(window, 'connectionStart', {
    get() { return window.AppState.interaction.connectionStart; },
    set(v) { window.AppState.interaction.connectionStart = v; }
});
Object.defineProperty(window, 'tempLineEl', {
    get() { return window.AppState.interaction.tempLineEl; },
    set(v) { window.AppState.interaction.tempLineEl = v; }
});

// Claude алиасы
Object.defineProperty(window, 'isClaudeVisible', {
    get() { return window.AppState.claude.isVisible; },
    set(v) { window.AppState.claude.isVisible = v; }
});
Object.defineProperty(window, 'activeClaudeTab', {
    get() { return window.AppState.claude.activeTab; },
    set(v) { window.AppState.claude.activeTab = v; }
});
Object.defineProperty(window, 'generatingTabs', {
    get() { return window.AppState.claude.generatingTabs; },
    set(v) { window.AppState.claude.generatingTabs = v; }
});
Object.defineProperty(window, 'tabUrls', {
    get() { return window.AppState.claude.tabUrls; },
    set(v) { window.AppState.claude.tabUrls = v; }
});
Object.defineProperty(window, 'tabNames', {
    get() { return window.AppState.claude.tabNames; },
    set(v) { window.AppState.claude.tabNames = v; }
});
Object.defineProperty(window, 'panelRatio', {
    get() { return window.AppState.claude.panelRatio; },
    set(v) { window.AppState.claude.panelRatio = v; }
});
Object.defineProperty(window, 'isResetting', {
    get() { return window.AppState.claude.isResetting; },
    set(v) { window.AppState.claude.isResetting = v; }
});
Object.defineProperty(window, 'activeProject', {
    get() { return window.AppState.claude.project; },
    set(v) { window.AppState.claude.project = v; }
});

// Resizer алиасы
Object.defineProperty(window, 'resizer', {
    get() { return window.AppState.resizer.element; },
    set(v) { window.AppState.resizer.element = v; }
});
Object.defineProperty(window, 'isResizing', {
    get() { return window.AppState.resizer.isResizing; },
    set(v) { window.AppState.resizer.isResizing = v; }
});
Object.defineProperty(window, 'startX', {
    get() { return window.AppState.resizer.startX; },
    set(v) { window.AppState.resizer.startX = v; }
});
Object.defineProperty(window, 'startRatio', {
    get() { return window.AppState.resizer.startRatio; },
    set(v) { window.AppState.resizer.startRatio = v; }
});
Object.defineProperty(window, 'windowWidth', {
    get() { return window.AppState.resizer.windowWidth; },
    set(v) { window.AppState.resizer.windowWidth = v; }
});
Object.defineProperty(window, 'lastAppliedRatio', {
    get() { return window.AppState.resizer.lastAppliedRatio; },
    set(v) { window.AppState.resizer.lastAppliedRatio = v; }
});
Object.defineProperty(window, 'updateScheduled', {
    get() { return window.AppState.resizer.updateScheduled; },
    set(v) { window.AppState.resizer.updateScheduled = v; }
});

// ═══════════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ПЕРЕМЕННЫЕ
// ═══════════════════════════════════════════════════════════════════════════

// Флаг для защиты выделения текста от сброса при mouseup вне элемента
window.isTextSelecting = false;

/**
 * Инициализация isAdminMode из настроек
 * Вызывается после загрузки storage.js
 */
function initAdminMode() {
    const settings = typeof getSettings === 'function' ? getSettings() : {};
    const adminMode = settings.adminMode || false;
    window.isAdminMode = adminMode; // defineProperty синхронизирует AppState.app.isAdminMode
}

// Экспорт для использования в других модулях
window.initAdminMode = initAdminMode;
