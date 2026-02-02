/**
 * Экспорт всех моков из одной точки
 */

const localStorage = require('./localStorage');
const dom = require('./dom');
const globals = require('./globals');

module.exports = {
    // localStorage
    LocalStorageMock: localStorage.LocalStorageMock,
    localStorageMock: localStorage.localStorageMock,
    
    // DOM
    createMockNode: dom.createMockNode,
    createMockPort: dom.createMockPort,
    createMockSvg: dom.createMockSvg,
    createMockCanvas: dom.createMockCanvas,
    createMockContainer: dom.createMockContainer,
    createMockWorkflowEnvironment: dom.createMockWorkflowEnvironment,
    createMockEditModal: dom.createMockEditModal,
    createMockZoomIndicator: dom.createMockZoomIndicator,
    createMockUndoRedoButtons: dom.createMockUndoRedoButtons,
    
    // Globals
    createMockAppState: globals.createMockAppState,
    MOCK_STORAGE_KEYS: globals.MOCK_STORAGE_KEYS,
    MOCK_WORKFLOW_CONFIG: globals.MOCK_WORKFLOW_CONFIG,
    MOCK_DEFAULT_SETTINGS: globals.MOCK_DEFAULT_SETTINGS,
    MOCK_CONSTANTS: globals.MOCK_CONSTANTS,
    setupGlobalMocks: globals.setupGlobalMocks
};
