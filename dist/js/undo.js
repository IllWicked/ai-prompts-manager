/**
 * AI Prompts Manager - Undo/Redo System v2
 * Command-based per-tab history
 * 
 * Snapshot создаётся только по явной команде из точки действия пользователя.
 * Save-функции больше не триггерят undo.
 * 
 * @requires config.js (STORAGE_KEYS)
 * @requires storage.js (getAllTabs, setTabsCache)
 * @requires blocks.js (collapsedBlocks, saveCollapsedBlocks, blockScripts, saveBlockScripts, blockAutomation, saveBlockAutomation)
 * @requires persistence.js (loadPrompts)
 * @requires workflow-render.js (renderWorkflow)
 * @requires workflow-state.js (workflowPositions, workflowConnections, workflowSizes)
 * @requires index.html (getUndoBtn, getRedoBtn, getWorkflowContainer, currentTab, workflowMode)
 */

// ═══════════════════════════════════════════════════════════════════════════
// UNDO/REDO SYSTEM v2
// ═══════════════════════════════════════════════════════════════════════════

/** @constant {number} Максимальный размер истории */
const MAX_HISTORY_SIZE = 50;

/** @constant {number} Debounce для snapshot при наборе текста (мс) */
const SNAPSHOT_DEBOUNCE_MS = 1000;

/** @type {boolean} Предотвращение прыжка скролла при рендере */
let skipScrollOnRender = false;

// ─── Shared state (доступно UndoManager и shim-ам, инкапсулируется в шаге 5) ───

/** @type {Array} Undo-стек текущей вкладки */
let undoStack = [];

/** @type {Array} Redo-стек текущей вкладки */
let redoStack = [];

/** @type {Object.<string, {undo: Array, redo: Array}>} Per-tab история */
const tabHistories = {};

/** @type {boolean} Флаг инициализации */
let isAppInitialized = false;

// ─── UndoManager ────────────────────────────────────────────────────────

const UndoManager = (() => {
    /** @type {boolean} Идёт восстановление состояния */
    let restoring = false;
    
    /** @type {number} Время последнего snapshot */
    let lastSnapshotTime = 0;
    
    // ─── Internal helpers ────────────────────────────────────────
    
    /** Синхронизировать текущие стеки в tabHistories */
    function syncToHistory() {
        tabHistories[currentTab] = {
            undo: [...undoStack],
            redo: [...redoStack]
        };
    }
    
    /** Обновить состояние кнопок Undo/Redo */
    function updateButtons() {
        const undoBtn = getUndoBtn();
        const redoBtn = getRedoBtn();
        if (undoBtn) undoBtn.disabled = undoStack.length <= 1;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    }
    
    /**
     * Захватить текущее состояние из памяти (не из localStorage)
     * @returns {Object} snapshot
     */
    function capture() {
        const tabId = currentTab;
        
        // Workflow — из глобальных переменных
        const workflow = {
            positions: structuredClone(workflowPositions || {}),
            connections: structuredClone(workflowConnections || []),
            sizes: structuredClone(workflowSizes || {})
        };
        
        // Данные вкладки — из кэша
        const tabs = getAllTabs();
        const tabData = tabs[tabId] ? structuredClone(tabs[tabId]) : null;
        
        // Значения полей — из localStorage (единственное хранилище)
        const fieldValues = {};
        const prefix = `field-value-${tabId}-`;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                fieldValues[key] = localStorage.getItem(key);
            }
        }
        
        // Метаданные блоков — из глобальных объектов
        const blockIds = tabData?.items?.map(item => item.id) || [];
        
        const collapsed = {};
        const scripts = {};
        const automation = {};
        
        blockIds.forEach(id => {
            if (typeof collapsedBlocks !== 'undefined' && collapsedBlocks[id]) {
                collapsed[id] = true;
            }
            if (typeof blockScripts !== 'undefined' && blockScripts[id]) {
                scripts[id] = [...blockScripts[id]];
            }
            if (typeof blockAutomation !== 'undefined' && blockAutomation[id]) {
                automation[id] = { ...blockAutomation[id] };
            }
        });
        
        return {
            tabId,
            workflow,
            tabData,
            fieldValues,
            collapsedBlocks: collapsed,
            blockScripts: scripts,
            blockAutomation: automation
        };
    }
    
    /**
     * Проверить идентичность двух состояний
     */
    function statesEqual(a, b) {
        if (!a || !b) return false;
        return JSON.stringify(a.tabData) === JSON.stringify(b.tabData) &&
               JSON.stringify(a.fieldValues) === JSON.stringify(b.fieldValues) &&
               JSON.stringify(a.workflow) === JSON.stringify(b.workflow);
    }
    
    /**
     * Применить состояние (восстановление)
     */
    function apply(state) {
        if (!state || state.tabId !== currentTab) return;
        
        restoring = true;
        
        try {
            const tabId = state.tabId;
            
            // Workflow
            if (state.workflow) {
                workflowPositions = structuredClone(state.workflow.positions) || {};
                workflowConnections = structuredClone(state.workflow.connections) || [];
                workflowSizes = structuredClone(state.workflow.sizes) || {};
                localStorage.setItem(STORAGE_KEYS.workflow(tabId), JSON.stringify(state.workflow));
            }
            
            // Данные вкладки
            if (state.tabData) {
                const tabs = getAllTabs();
                tabs[tabId] = structuredClone(state.tabData);
                localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
                setTabsCache(tabs);
            }
            
            // Значения полей
            const prefix = `field-value-${tabId}-`;
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) keysToRemove.push(key);
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            if (state.fieldValues) {
                Object.entries(state.fieldValues).forEach(([key, value]) => {
                    localStorage.setItem(key, value);
                });
            }
            
            // Свёрнутые блоки
            if (state.collapsedBlocks && typeof collapsedBlocks !== 'undefined') {
                const blockIds = state.tabData?.items?.map(i => i.id) || [];
                blockIds.forEach(id => delete collapsedBlocks[id]);
                Object.assign(collapsedBlocks, state.collapsedBlocks);
                saveCollapsedBlocks();
            }
            
            // Скрипты блоков
            if (state.blockScripts && typeof blockScripts !== 'undefined') {
                const blockIds = state.tabData?.items?.map(i => i.id) || [];
                blockIds.forEach(id => delete blockScripts[id]);
                Object.entries(state.blockScripts).forEach(([id, s]) => {
                    blockScripts[id] = [...s];
                });
                saveBlockScripts();
            }
            
            // Automation
            if (state.blockAutomation && typeof blockAutomation !== 'undefined') {
                const blockIds = state.tabData?.items?.map(i => i.id) || [];
                blockIds.forEach(id => delete blockAutomation[id]);
                Object.entries(state.blockAutomation).forEach(([id, a]) => {
                    blockAutomation[id] = { ...a };
                });
                saveBlockAutomation();
            }
            
            // Перерендер
            loadPrompts();
            if (workflowMode) {
                renderWorkflow();
            }
        } finally {
            restoring = false;
        }
    }
    
    // ─── Public API ──────────────────────────────────────────────
    
    return {
        /** @returns {boolean} Идёт ли восстановление */
        get isRestoring() { return restoring; },
        
        /**
         * Сохранить текущее состояние в undo-стек.
         * Вызывается из точек действий пользователя ДО изменения.
         * @param {boolean} [force=false] — обойти debounce (для деструктивных операций)
         */
        snapshot(force = false) {
            if (!isAppInitialized || restoring) return;
            
            // Debounce — для набора текста
            if (!force) {
                const now = Date.now();
                if (now - lastSnapshotTime < SNAPSHOT_DEBOUNCE_MS && undoStack.length > 0) {
                    return;
                }
            }
            
            const state = capture();
            
            // Пропустить если идентично последнему
            if (undoStack.length > 0 && statesEqual(undoStack[undoStack.length - 1], state)) {
                return;
            }
            
            undoStack.push(state);
            lastSnapshotTime = Date.now();
            
            if (undoStack.length > MAX_HISTORY_SIZE) {
                undoStack.shift();
            }
            
            redoStack = [];
            syncToHistory();
            updateButtons();
        },
        
        /** Отмена */
        undo() {
            if (undoStack.length <= 1) return;
            
            // Сохраняем позицию камеры
            const container = getWorkflowContainer();
            const scrollLeft = container?.scrollLeft || 0;
            const scrollTop = container?.scrollTop || 0;
            
            // Текущее состояние в redo
            redoStack.push(capture());
            // Убираем верхушку undo
            undoStack.pop();
            // Применяем предыдущее
            apply(undoStack[undoStack.length - 1]);
            
            syncToHistory();
            
            // Восстанавливаем камеру
            if (container) {
                container.scrollLeft = scrollLeft;
                container.scrollTop = scrollTop;
            }
            
            updateButtons();
        },
        
        /** Повтор */
        redo() {
            if (redoStack.length === 0) return;
            
            const container = getWorkflowContainer();
            const scrollLeft = container?.scrollLeft || 0;
            const scrollTop = container?.scrollTop || 0;
            
            const state = redoStack.pop();
            undoStack.push(state);
            apply(state);
            
            syncToHistory();
            
            if (container) {
                container.scrollLeft = scrollLeft;
                container.scrollTop = scrollTop;
            }
            
            updateButtons();
        },
        
        /** Инициализация для текущей вкладки */
        init() {
            setTimeout(() => {
                const state = capture();
                undoStack = [state];
                redoStack = [];
                syncToHistory();
                isAppInitialized = true;
                updateButtons();
            }, 500);
        },
        
        /**
         * Переключение вкладки — сохранить стеки старой, загрузить стеки новой
         */
        switchTab(oldTab, newTab) {
            if (oldTab && oldTab !== newTab) {
                tabHistories[oldTab] = {
                    undo: [...undoStack],
                    redo: [...redoStack]
                };
            }
            
            if (tabHistories[newTab]) {
                undoStack = [...tabHistories[newTab].undo];
                redoStack = [...tabHistories[newTab].redo];
            } else {
                undoStack = [];
                redoStack = [];
            }
            
            updateButtons();
            
            if (undoStack.length === 0) {
                setTimeout(() => {
                    undoStack.push(capture());
                    syncToHistory();
                    updateButtons();
                }, 100);
            }
        },
        
        /** Переименование вкладки — перенести историю */
        renameTab(oldId, newId) {
            if (tabHistories[oldId]) {
                tabHistories[newId] = tabHistories[oldId];
                delete tabHistories[oldId];
            }
        },
        
        /** Удаление вкладки — очистить историю */
        deleteTab(tabId) {
            delete tabHistories[tabId];
        },
        
        /** Обновить кнопки */
        updateButtons
    };
})();


// Backward-compatible shims удалены — вся кодовая база мигрирована на UndoManager
