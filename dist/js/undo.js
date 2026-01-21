/**
 * AI Prompts Manager - Undo/Redo System
 * Per-tab история изменений
 */
// ═══════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ 3: UNDO/REDO (Per-tab история)
// ═══════════════════════════════════════════════════════════════════════════

/** @constant {number} Максимальный размер истории undo */
const MAX_HISTORY_SIZE = 50;

/** @type {Array} Текущий стек undo для активной вкладки */
let undoStack = [];

/** @type {Array} Текущий стек redo для активной вкладки */
let redoStack = [];

/** 
 * История для каждой вкладки
 * @type {Object.<string, {undoStack: Array, redoStack: Array}>}
 */
const tabHistories = {};

/** @type {boolean} Флаг для предотвращения записи при undo/redo */
let isUndoRedoAction = false;

/** @type {boolean} Флаг для предотвращения прыжка скролла при редактировании */
let skipScrollOnRender = false;

/** @type {boolean} Флаг для предотвращения рекурсии сохранения */
let isSavingToUndo = false;

/** @type {boolean} Флаг инициализации приложения */
let isAppInitialized = false;

/** @type {number} Время последнего сохранения в undo */
let lastUndoSaveTime = 0;

/** @constant {number} Debounce для объединения быстрых изменений (мс) */
const UNDO_DEBOUNCE_MS = 500;

/**
 * Захватывает состояние ТОЛЬКО текущей вкладки для undo
 * @returns {Object} snapshot состояния {tabId, workflow, tabData, fieldValues}
 */
function captureCurrentTabState() {
    const tabId = currentTab;
    
    // Workflow только для текущей вкладки
    let workflow = null;
    try {
        const workflowData = localStorage.getItem(`workflow-${tabId}`);
        workflow = workflowData ? JSON.parse(workflowData) : null;
    } catch (e) {
        
    }
    
    // Данные промптов из STORAGE_KEYS.TABS (основное хранилище)
    let tabData = null;
    try {
        const tabsData = localStorage.getItem(STORAGE_KEYS.TABS);
        const tabs = tabsData ? JSON.parse(tabsData) : {};
        tabData = tabs[tabId] ? JSON.stringify(tabs[tabId]) : null;
    } catch (e) {
        
    }
    
    // Значения полей только для текущей вкладки
    const fieldValues = {};
    const prefix = `field-value-${tabId}-`;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            fieldValues[key] = localStorage.getItem(key);
        }
    }
    
    return {
        tabId: tabId,
        workflow: workflow,
        tabData: tabData, // Данные вкладки из tabs
        fieldValues: fieldValues
    };
}

/**
 * Применяет состояние ТОЛЬКО к текущей вкладке
 */
function applyCurrentTabState(state) {
    if (!state || state.tabId !== currentTab) return;
    
    const tabId = state.tabId;
    
    // Восстанавливаем workflow
    if (state.workflow) {
        localStorage.setItem(`workflow-${tabId}`, JSON.stringify(state.workflow));
        workflowPositions = state.workflow.positions || {};
        workflowSizes = state.workflow.sizes || {};
        workflowConnections = state.workflow.connections || [];
    }
    
    // Восстанавливаем данные вкладки в STORAGE_KEYS.TABS
    if (state.tabData) {
        try {
            const tabsData = localStorage.getItem(STORAGE_KEYS.TABS);
            const tabs = tabsData ? JSON.parse(tabsData) : {};
            tabs[tabId] = JSON.parse(state.tabData);
            localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
            setTabsCache(tabs); // Обновляем кэш через API
        } catch (e) {
            
        }
    }
    
    // Удаляем старые field-value для этой вкладки
    const prefix = `field-value-${tabId}-`;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Восстанавливаем field-value из состояния
    if (state.fieldValues) {
        Object.entries(state.fieldValues).forEach(([key, value]) => {
            localStorage.setItem(key, value);
        });
    }
    
    // Перезагружаем интерфейс
    loadPrompts();
    if (workflowMode) {
        renderWorkflow();
    }
}

/**
 * Автоматически сохраняет состояние в undo стек (per-tab)
 * Вызывается из saveAllTabs и saveWorkflowState
 */
function autoSaveToUndo() {
    if (!isAppInitialized || isUndoRedoAction || isSavingToUndo) return;
    
    const now = Date.now();
    // Debounce - если прошло мало времени, не создаём новую запись
    if (now - lastUndoSaveTime < UNDO_DEBOUNCE_MS && undoStack.length > 0) {
        return;
    }
    
    isSavingToUndo = true;
    
    try {
        const state = captureCurrentTabState();
        
        // Проверяем что состояние отличается от последнего в стеке
        if (undoStack.length > 0) {
            const lastState = undoStack[undoStack.length - 1];
            if (JSON.stringify(lastState.tabData) === JSON.stringify(state.tabData) &&
                JSON.stringify(lastState.fieldValues) === JSON.stringify(state.fieldValues) &&
                JSON.stringify(lastState.workflow) === JSON.stringify(state.workflow)) {
                return; // Состояние не изменилось
            }
        }
        
        undoStack.push(state);
        lastUndoSaveTime = now;
        
        if (undoStack.length > MAX_HISTORY_SIZE) {
            undoStack.shift();
        }
        
        redoStack = [];
        
        // Сохраняем историю для текущей вкладки
        tabHistories[currentTab] = {
            undoStack: [...undoStack],
            redoStack: [...redoStack]
        };
        
        updateUndoRedoButtons();
    } finally {
        isSavingToUndo = false;
    }
}

/**
 * Общий helper для undo/redo операций
 */
function executeUndoRedo(action) {
    isUndoRedoAction = true;
    
    // Сохраняем позицию камеры
    const container = getWorkflowContainer();
    const savedScrollLeft = container?.scrollLeft || 0;
    const savedScrollTop = container?.scrollTop || 0;
    
    action();
    
    // Сохраняем историю для текущей вкладки
    tabHistories[currentTab] = {
        undoStack: [...undoStack],
        redoStack: [...redoStack]
    };
    
    // Восстанавливаем позицию камеры
    if (container) {
        container.scrollLeft = savedScrollLeft;
        container.scrollTop = savedScrollTop;
    }
    
    // Держим флаг активным дольше чем debounce savePrompt (800ms) + запас
    // Это предотвращает запись debounced сохранений после undo/redo
    setTimeout(() => {
        isUndoRedoAction = false;
    }, 1000);
    
    updateUndoRedoButtons();
}

/**
 * Отменяет последнее действие (per-tab)
 */
function undo() {
    if (undoStack.length <= 1) return;
    executeUndoRedo(() => {
        redoStack.push(captureCurrentTabState());
        undoStack.pop();
        applyCurrentTabState(undoStack[undoStack.length - 1]);
    });
}

/**
 * Повторяет отменённое действие (per-tab)
 */
function redo() {
    if (redoStack.length === 0) return;
    executeUndoRedo(() => {
        const nextState = redoStack.pop();
        undoStack.push(nextState);
        applyCurrentTabState(nextState);
    });
}


/**
 * Обновляет состояние кнопок Undo/Redo
 */
function updateUndoRedoButtons() {
    const undoBtn = getUndoBtn();
    const redoBtn = getRedoBtn();
    
    if (undoBtn) {
        undoBtn.disabled = undoStack.length <= 1;
    }
    if (redoBtn) {
        redoBtn.disabled = redoStack.length === 0;
    }
}

