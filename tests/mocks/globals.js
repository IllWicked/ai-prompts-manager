/**
 * Mock для глобальных объектов приложения
 * AppState, STORAGE_KEYS, константы
 */

/**
 * Создаёт свежий AppState для каждого теста
 * @returns {Object}
 */
function createMockAppState() {
    return {
        workflow: {
            mode: true,
            connections: [],
            positions: {},
            sizes: {},
            zoom: 0.6
        },
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
        claude: {
            isVisible: false,
            activeTab: 1,
            existingTabs: [1],
            generatingTabs: {},
            tabUrls: {},
            tabNames: {},
            panelRatio: 50,
            isResetting: false,
            project: null
        },
        resizer: {
            element: null,
            isResizing: false,
            startX: 0,
            startRatio: 0,
            windowWidth: 0,
            lastAppliedRatio: 0,
            updateScheduled: false
        },
        app: {
            currentTab: 'test-tab',
            isEditMode: false,
            isAdminMode: false,
            isAppInitialized: false,
            currentLanguage: 'en'
        }
    };
}

/**
 * STORAGE_KEYS константы
 */
const MOCK_STORAGE_KEYS = {
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
    ACTIVE_PROJECT: 'active-project',
    
    // Динамические ключи (функции)
    workflow: (tabId) => `workflow-${tabId}`,
    promptsData: (tabId) => `ai-prompts-manager-data-${tabId}`,
    fieldValue: (fieldId) => `field-value-${fieldId}`
};

/**
 * WORKFLOW_CONFIG константы
 */
const MOCK_WORKFLOW_CONFIG = {
    GRID_SIZE: 40,
    NODE_MIN_WIDTH: 480,
    NODE_MIN_HEIGHT: 440,
    NODE_DEFAULT_WIDTH: 680,
    NODE_GAP_X: 40,
    NODE_GAP_Y: 40,
    CANVAS_SIZE: 5000,
    CANVAS_CENTER: 2500,
    MAGNET_DISTANCE: 30,
    ZOOM_MIN: 0.4,
    ZOOM_MAX: 1.25
};

/**
 * DEFAULT_SETTINGS константы
 */
const MOCK_DEFAULT_SETTINGS = {
    autoUpdate: true,
    theme: 'auto',
    adminMode: false
};

/**
 * Другие константы
 */
const MOCK_CONSTANTS = {
    DEFAULT_TAB: null,
    CURRENT_DATA_VERSION: 4,
    NODE_DEFAULT_WIDTH: 680,
    MAX_HISTORY_SIZE: 50,
    UNDO_DEBOUNCE_MS: 500
};

/**
 * Настраивает глобальное окружение для тестов
 * @param {Object} localStorage - Mock localStorage
 */
function setupGlobalMocks(localStorage) {
    // Глобальные константы
    global.STORAGE_KEYS = MOCK_STORAGE_KEYS;
    global.WORKFLOW_CONFIG = MOCK_WORKFLOW_CONFIG;
    global.DEFAULT_SETTINGS = MOCK_DEFAULT_SETTINGS;
    global.DEFAULT_TAB = MOCK_CONSTANTS.DEFAULT_TAB;
    global.CURRENT_DATA_VERSION = MOCK_CONSTANTS.CURRENT_DATA_VERSION;
    global.NODE_DEFAULT_WIDTH = MOCK_CONSTANTS.NODE_DEFAULT_WIDTH;
    global.MAX_HISTORY_SIZE = MOCK_CONSTANTS.MAX_HISTORY_SIZE;
    global.UNDO_DEBOUNCE_MS = MOCK_CONSTANTS.UNDO_DEBOUNCE_MS;
    
    // AppState
    global.AppState = createMockAppState();
    global.window = global.window || {};
    global.window.AppState = global.AppState;
    
    // localStorage
    global.localStorage = localStorage;
    
    // Алиасы для обратной совместимости
    global.currentTab = global.AppState.app.currentTab;
    global.isEditMode = global.AppState.app.isEditMode;
    global.workflowConnections = global.AppState.workflow.connections;
    global.workflowPositions = global.AppState.workflow.positions;
    global.workflowSizes = global.AppState.workflow.sizes;
    global.workflowZoom = global.AppState.workflow.zoom;
    global.isCreatingConnection = global.AppState.interaction.isCreatingConnection;
    global.connectionStart = global.AppState.interaction.connectionStart;
    global.tempLineEl = global.AppState.interaction.tempLineEl;
    
    // Mock функции которые могут понадобиться
    global.showToast = jest.fn();
    global.showAlert = jest.fn();
    global.log = jest.fn();
    
    return {
        resetAppState: () => {
            global.AppState = createMockAppState();
            global.window.AppState = global.AppState;
            global.currentTab = global.AppState.app.currentTab;
            global.workflowConnections = global.AppState.workflow.connections;
            global.workflowPositions = global.AppState.workflow.positions;
            global.workflowSizes = global.AppState.workflow.sizes;
        }
    };
}

module.exports = {
    createMockAppState,
    MOCK_STORAGE_KEYS,
    MOCK_WORKFLOW_CONFIG,
    MOCK_DEFAULT_SETTINGS,
    MOCK_CONSTANTS,
    setupGlobalMocks
};
