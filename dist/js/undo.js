/**
 * AI Prompts Manager - Undo/Redo System v3
 * Incremental snapshots + input grouping
 * 
 * Оптимизации v3 vs v2:
 * - Быстрое сравнение по djb2 хешу вместо JSON.stringify
 * - Lazy workflow capture: workflow данные захватываются только в workflowMode
 * - Input grouping: быстрые правки одного блока объединяются в одну операцию
 * - restoring флаг выставляется через try/finally (crash-safe)
 * 
 * @requires config.js (STORAGE_KEYS)
 * @requires storage.js (getAllTabs, setTabsCache, saveAllTabs)
 * @requires blocks.js (collapsedBlocks, saveCollapsedBlocks, blockScripts, saveBlockScripts, blockAutomation, saveBlockAutomation)
 * @requires persistence.js (loadPrompts)
 * @requires workflow-render.js (renderWorkflow)
 * @requires workflow-state.js (workflowPositions, workflowConnections, workflowSizes)
 * @requires index.html (getUndoBtn, getRedoBtn, getWorkflowContainer, currentTab, workflowMode)
 */

// ═══════════════════════════════════════════════════════════════════════════
// UNDO/REDO SYSTEM v3
// ═══════════════════════════════════════════════════════════════════════════

/** @constant {number} Максимальный размер истории */
const MAX_HISTORY_SIZE = 50;

/** @constant {number} Debounce для snapshot при наборе текста (мс) */
const SNAPSHOT_DEBOUNCE_MS = 300;

/** @constant {number} Группировка ввода: макс. пауза между нажатиями (мс) */
const INPUT_GROUP_MS = 800;

/** @type {boolean} Предотвращение прыжка скролла при рендере */
let skipScrollOnRender = false;

// ─── Shared state ─────────────────────────────────────────────────────

/** @type {Array} Undo-стек текущей вкладки */
let undoStack = [];

/** @type {Array} Redo-стек текущей вкладки */
let redoStack = [];

/** @type {Object.<string, {undo: Array, redo: Array}>} Per-tab история */
const tabHistories = {};

/** @type {boolean} Флаг инициализации */
let isAppInitialized = false;

// ═══════════════════════════════════════════════════════════════════════════
// FAST HASH — быстрое сравнение состояний без JSON.stringify
// ═══════════════════════════════════════════════════════════════════════════

/**
 * djb2 hash строки — быстрый некриптографический хеш
 * @param {string} str
 * @returns {number}
 */
function djb2Hash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit int
    }
    return hash;
}

/**
 * Быстрый хеш объекта вкладки (items — основные данные)
 * Учитывает id, title, длину и начало контента — достаточно для детекции изменений
 * @param {Object} tabData
 * @returns {number}
 */
function hashTabData(tabData) {
    if (!tabData?.items) return 0;
    let combined = '' + tabData.items.length;
    for (const item of tabData.items) {
        const c = item.content || '';
        combined += '|' + item.id + '|' + (item.title || '') + '|' + c.length + '|' + c.slice(0, 64);
    }
    return djb2Hash(combined);
}

/**
 * Быстрый хеш workflow позиций
 * @returns {number}
 */
function hashWorkflow() {
    const pos = workflowPositions || {};
    const keys = Object.keys(pos);
    if (keys.length === 0) return 0;
    let combined = '' + keys.length;
    for (const k of keys) {
        const p = pos[k];
        combined += '|' + k + ':' + (p?.x|0) + ',' + (p?.y|0);
    }
    combined += '|c' + (workflowConnections?.length || 0);
    return djb2Hash(combined);
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT GROUPING — объединение быстрых правок в одну операцию
// ═══════════════════════════════════════════════════════════════════════════

const InputGroup = {
    /** @type {boolean} Группа активна */
    _active: false,
    
    /** @type {number} Timestamp последнего ввода */
    _lastTime: 0,
    
    /**
     * Проверить стратегию для текущего snapshot
     * @param {boolean} force — принудительный snapshot (завершает группу)
     * @returns {'new'|'extend'|'close_and_new'} стратегия
     */
    classify(force) {
        const now = Date.now();
        
        // force = true → деструктивная операция, завершаем группу
        if (force) {
            if (this._active) {
                this.reset();
                return 'close_and_new';
            }
            return 'new';
        }
        
        // Нет активной группы → новая
        if (!this._active) {
            return 'new';
        }
        
        // Пауза > INPUT_GROUP_MS → завершаем и начинаем новую
        if (now - this._lastTime > INPUT_GROUP_MS) {
            this.reset();
            return 'new';
        }
        
        // Продолжаем группу
        this._lastTime = now;
        return 'extend';
    },
    
    /** Начать новую группу */
    start() {
        this._active = true;
        this._lastTime = Date.now();
    },
    
    /** Сбросить группу */
    reset() {
        this._active = false;
        this._lastTime = 0;
    },
    
    /** @returns {boolean} Активна ли группа */
    get active() { return this._active; }
};

// ═══════════════════════════════════════════════════════════════════════════
// CAPTURE & APPLY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Полный захват состояния
 * @returns {Object} snapshot
 */
function captureFullState() {
    const tabId = currentTab;
    const tabs = getAllTabs();
    const tabData = tabs[tabId] ? structuredClone(tabs[tabId]) : null;
    
    // Notes — отдельная сущность, не участвуют в undo промптов.
    // Сохраняем ссылку но убираем из snapshot чтобы undo не удалял заметки.
    if (tabData) {
        delete tabData.notes;
    }
    
    // Workflow — только если в workflow mode
    let workflow = null;
    if (workflowMode) {
        workflow = {
            positions: structuredClone(workflowPositions || {}),
            connections: structuredClone(workflowConnections || []),
            sizes: structuredClone(workflowSizes || {})
        };
    }
    
    // Значения полей
    const fieldValues = {};
    const prefix = `field-value-${tabId}-`;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            fieldValues[key] = localStorage.getItem(key);
        }
    }
    
    // Метаданные блоков
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
        blockAutomation: automation,
        _tabHash: hashTabData(tabData),
        _wfHash: workflowMode ? hashWorkflow() : 0
    };
}

/**
 * Быстрая проверка: изменилось ли состояние
 * @param {Object} lastSnapshot
 * @returns {boolean}
 */
function hasStateChanged(lastSnapshot) {
    if (!lastSnapshot) return true;
    
    const tabs = getAllTabs();
    const tabData = tabs[currentTab];
    
    // Хеш вкладки
    if (hashTabData(tabData) !== lastSnapshot._tabHash) return true;
    
    // Хеш workflow
    if (workflowMode && hashWorkflow() !== lastSnapshot._wfHash) return true;
    
    // Подробная проверка контента (при коллизии хеша)
    if (tabData?.items && lastSnapshot.tabData?.items) {
        if (tabData.items.length !== lastSnapshot.tabData.items.length) return true;
        for (let i = 0; i < tabData.items.length; i++) {
            const a = tabData.items[i];
            const b = lastSnapshot.tabData.items[i];
            if (!b || a.content !== b.content || a.title !== b.title || a.id !== b.id) return true;
        }
        return false; // Данные идентичны
    }
    
    return false;
}

/**
 * Применить состояние
 * @param {Object} state
 */
function applyState(state) {
    if (!state || state.tabId !== currentTab) return;
    
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
        const restored = structuredClone(state.tabData);
        // Сохраняем текущие notes — они не участвуют в undo
        if (tabs[tabId]?.notes) {
            restored.notes = tabs[tabId].notes;
        }
        tabs[tabId] = restored;
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
}

// ═══════════════════════════════════════════════════════════════════════════
// UNDO MANAGER v3
// ═══════════════════════════════════════════════════════════════════════════

const UndoManager = (() => {
    /** @type {boolean} Идёт восстановление состояния */
    let restoring = false;
    
    /** @type {number} Время последнего snapshot */
    let lastSnapshotTime = 0;
    
    // ─── Internal helpers ────────────────────────────────────────

    function syncToHistory() {
        tabHistories[currentTab] = {
            undo: [...undoStack],
            redo: [...redoStack]
        };
    }
    
    function updateButtons() {
        const undoBtn = getUndoBtn();
        const redoBtn = getRedoBtn();
        if (undoBtn) undoBtn.disabled = undoStack.length <= 1;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    }
    
    // ─── Public API ──────────────────────────────────────────────
    
    return {
        /** @returns {boolean} Идёт ли восстановление */
        get isRestoring() { return restoring; },
        
        /**
         * Сохранить текущее состояние в undo-стек.
         * 
         * v3 оптимизации:
         * - Быстрая проверка по хешу (без JSON.stringify)
         * - Input grouping: extend не создаёт новый snapshot
         * - Lazy workflow capture
         * 
         * @param {boolean} [force=false] — обойти debounce
         */
        snapshot(force = false) {
            if (!isAppInitialized || restoring) return;
            
            const now = Date.now();
            const lastState = undoStack[undoStack.length - 1] || null;
            
            // Быстрая проверка: изменилось ли состояние
            if (lastState && !hasStateChanged(lastState)) {
                return;
            }
            
            // Input grouping
            const strategy = InputGroup.classify(force);
            
            if (strategy === 'extend') {
                // Продолжаем группу: НЕ добавляем snapshot
                // При undo вернёмся к состоянию до начала группы
                return;
            }
            
            // 'close_and_new' или 'new' — делаем новый snapshot
            
            // Debounce для не-force
            if (!force && now - lastSnapshotTime < SNAPSHOT_DEBOUNCE_MS && undoStack.length > 0) {
                // Начинаем группу ввода вместо snapshot
                if (!InputGroup.active) {
                    InputGroup.start();
                }
                return;
            }
            
            // Полный захват
            const state = captureFullState();
            
            undoStack.push(state);
            lastSnapshotTime = now;
            
            if (undoStack.length > MAX_HISTORY_SIZE) {
                undoStack.shift();
            }
            
            redoStack = [];
            
            // Начинаем группу для не-force
            if (!force) {
                InputGroup.start();
            }
            
            syncToHistory();
            updateButtons();
        },
        
        /** Отмена */
        undo() {
            if (undoStack.length <= 1) return;
            
            InputGroup.reset();
            
            const container = getWorkflowContainer();
            const scrollLeft = container?.scrollLeft || 0;
            const scrollTop = container?.scrollTop || 0;
            
            restoring = true;
            try {
                redoStack.push(captureFullState());
                undoStack.pop();
                applyState(undoStack[undoStack.length - 1]);
            } finally {
                restoring = false;
            }
            
            syncToHistory();
            
            if (container) {
                container.scrollLeft = scrollLeft;
                container.scrollTop = scrollTop;
            }
            
            updateButtons();
        },
        
        /** Повтор */
        redo() {
            if (redoStack.length === 0) return;
            
            InputGroup.reset();
            
            const container = getWorkflowContainer();
            const scrollLeft = container?.scrollLeft || 0;
            const scrollTop = container?.scrollTop || 0;
            
            restoring = true;
            try {
                const state = redoStack.pop();
                undoStack.push(state);
                applyState(state);
            } finally {
                restoring = false;
            }
            
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
                const state = captureFullState();
                undoStack = [state];
                redoStack = [];
                InputGroup.reset();
                syncToHistory();
                isAppInitialized = true;
                updateButtons();
            }, 500);
        },
        
        /** Переключение вкладки */
        switchTab(oldTab, newTab) {
            InputGroup.reset();
            
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
                    undoStack.push(captureFullState());
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
