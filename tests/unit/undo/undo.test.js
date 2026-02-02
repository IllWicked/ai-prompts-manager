/**
 * Unit Tests: undo.js
 * Тестирование системы Undo/Redo
 */

// ============================================================================
// Константы и глобальные переменные
// ============================================================================

const MAX_HISTORY_SIZE = 50;
const UNDO_DEBOUNCE_MS = 500;

let undoStack = [];
let redoStack = [];
const tabHistories = {};

let isUndoRedoAction = false;
let isSavingToUndo = false;
let isAppInitialized = false;
let lastUndoSaveTime = 0;

// Глобальные переменные из других модулей
let collapsedBlocks = {};
let blockScripts = {};
let blockAutomation = {};
let workflowPositions = {};
let workflowSizes = {};
let workflowConnections = [];
let workflowMode = false;

// Mock функции
function saveCollapsedBlocks() {
    localStorage.setItem('collapsed-blocks', JSON.stringify(collapsedBlocks));
}

function saveBlockScripts() {
    localStorage.setItem('block-scripts', JSON.stringify(blockScripts));
}

function saveBlockAutomation() {
    localStorage.setItem('block-automation', JSON.stringify(blockAutomation));
}

function setTabsCache(tabs) {
    // Mock - в реальности обновляет _tabsCache в storage.js
}

function loadPrompts() {
    // Mock
}

function renderWorkflow() {
    // Mock
}

function getWorkflowContainer() {
    return null; // Mock
}

function getUndoBtn() {
    return document.getElementById('undo-btn');
}

function getRedoBtn() {
    return document.getElementById('redo-btn');
}

// ============================================================================
// Функции из undo.js (копируем для тестирования)
// ============================================================================

function captureCurrentTabState() {
    const tabId = global.currentTab;
    
    let workflow = null;
    try {
        const workflowData = localStorage.getItem(`workflow-${tabId}`);
        workflow = workflowData ? JSON.parse(workflowData) : null;
    } catch (e) {}
    
    let tabData = null;
    try {
        const tabsData = localStorage.getItem(STORAGE_KEYS.TABS);
        const tabs = tabsData ? JSON.parse(tabsData) : {};
        tabData = tabs[tabId] ? JSON.stringify(tabs[tabId]) : null;
    } catch (e) {}
    
    const fieldValues = {};
    const prefix = `field-value-${tabId}-`;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            fieldValues[key] = localStorage.getItem(key);
        }
    }
    
    let blockIds = [];
    try {
        const tabsData = localStorage.getItem(STORAGE_KEYS.TABS);
        const tabs = tabsData ? JSON.parse(tabsData) : {};
        if (tabs[tabId] && Array.isArray(tabs[tabId].items)) {
            blockIds = tabs[tabId].items.map(item => item.id);
        }
    } catch (e) {}
    
    const collapsedSnapshot = {};
    blockIds.forEach(id => {
        if (collapsedBlocks[id]) {
            collapsedSnapshot[id] = true;
        }
    });
    
    const scriptsSnapshot = {};
    blockIds.forEach(id => {
        if (blockScripts[id]) {
            scriptsSnapshot[id] = [...blockScripts[id]];
        }
    });
    
    const automationSnapshot = {};
    blockIds.forEach(id => {
        if (blockAutomation[id]) {
            automationSnapshot[id] = { ...blockAutomation[id] };
        }
    });
    
    return {
        tabId: tabId,
        workflow: workflow,
        tabData: tabData,
        fieldValues: fieldValues,
        collapsedBlocks: collapsedSnapshot,
        blockScripts: scriptsSnapshot,
        blockAutomation: automationSnapshot
    };
}

function applyCurrentTabState(state) {
    if (!state || state.tabId !== global.currentTab) return;
    
    const tabId = state.tabId;
    
    if (state.workflow) {
        localStorage.setItem(`workflow-${tabId}`, JSON.stringify(state.workflow));
        workflowPositions = state.workflow.positions || {};
        workflowSizes = state.workflow.sizes || {};
        workflowConnections = state.workflow.connections || [];
    }
    
    if (state.tabData) {
        try {
            const tabsData = localStorage.getItem(STORAGE_KEYS.TABS);
            const tabs = tabsData ? JSON.parse(tabsData) : {};
            tabs[tabId] = JSON.parse(state.tabData);
            localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
            setTabsCache(tabs);
        } catch (e) {}
    }
    
    const prefix = `field-value-${tabId}-`;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (state.fieldValues) {
        Object.entries(state.fieldValues).forEach(([key, value]) => {
            localStorage.setItem(key, value);
        });
    }
    
    if (state.collapsedBlocks) {
        if (state.tabData) {
            try {
                const tabDataParsed = JSON.parse(state.tabData);
                if (tabDataParsed.items) {
                    tabDataParsed.items.forEach(item => {
                        delete collapsedBlocks[item.id];
                    });
                }
            } catch (e) {}
        }
        Object.assign(collapsedBlocks, state.collapsedBlocks);
        saveCollapsedBlocks();
    }
    
    if (state.blockScripts) {
        if (state.tabData) {
            try {
                const tabDataParsed = JSON.parse(state.tabData);
                if (tabDataParsed.items) {
                    tabDataParsed.items.forEach(item => {
                        delete blockScripts[item.id];
                    });
                }
            } catch (e) {}
        }
        Object.entries(state.blockScripts).forEach(([id, scripts]) => {
            blockScripts[id] = [...scripts];
        });
        saveBlockScripts();
    }
    
    if (state.blockAutomation) {
        if (state.tabData) {
            try {
                const tabDataParsed = JSON.parse(state.tabData);
                if (tabDataParsed.items) {
                    tabDataParsed.items.forEach(item => {
                        delete blockAutomation[item.id];
                    });
                }
            } catch (e) {}
        }
        Object.entries(state.blockAutomation).forEach(([id, flags]) => {
            blockAutomation[id] = { ...flags };
        });
        saveBlockAutomation();
    }
    
    loadPrompts();
    if (workflowMode) {
        renderWorkflow();
    }
}

function autoSaveToUndo() {
    if (!isAppInitialized || isUndoRedoAction || isSavingToUndo) return;
    
    const now = Date.now();
    if (now - lastUndoSaveTime < UNDO_DEBOUNCE_MS && undoStack.length > 0) {
        return;
    }
    
    isSavingToUndo = true;
    
    try {
        const state = captureCurrentTabState();
        
        if (undoStack.length > 0) {
            const lastState = undoStack[undoStack.length - 1];
            if (JSON.stringify(lastState.tabData) === JSON.stringify(state.tabData) &&
                JSON.stringify(lastState.fieldValues) === JSON.stringify(state.fieldValues) &&
                JSON.stringify(lastState.workflow) === JSON.stringify(state.workflow)) {
                return;
            }
        }
        
        undoStack.push(state);
        lastUndoSaveTime = now;
        
        if (undoStack.length > MAX_HISTORY_SIZE) {
            undoStack.shift();
        }
        
        redoStack = [];
        
        tabHistories[global.currentTab] = {
            undoStack: [...undoStack],
            redoStack: [...redoStack]
        };
        
        updateUndoRedoButtons();
    } finally {
        isSavingToUndo = false;
    }
}

function executeUndoRedo(action) {
    isUndoRedoAction = true;
    
    action();
    
    tabHistories[global.currentTab] = {
        undoStack: [...undoStack],
        redoStack: [...redoStack]
    };
    
    updateUndoRedoButtons();
    
    // В тестах сразу сбрасываем флаг (без setTimeout)
    isUndoRedoAction = false;
}

function undo() {
    if (undoStack.length <= 1) return;
    executeUndoRedo(() => {
        redoStack.push(captureCurrentTabState());
        undoStack.pop();
        applyCurrentTabState(undoStack[undoStack.length - 1]);
    });
}

function redo() {
    if (redoStack.length === 0) return;
    executeUndoRedo(() => {
        const nextState = redoStack.pop();
        undoStack.push(nextState);
        applyCurrentTabState(nextState);
    });
}

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

// ============================================================================
// Вспомогательные функции для тестов
// ============================================================================

function resetUndoState() {
    undoStack = [];
    redoStack = [];
    Object.keys(tabHistories).forEach(k => delete tabHistories[k]);
    isUndoRedoAction = false;
    isSavingToUndo = false;
    isAppInitialized = false;
    lastUndoSaveTime = 0;
    collapsedBlocks = {};
    blockScripts = {};
    blockAutomation = {};
    workflowPositions = {};
    workflowSizes = {};
    workflowConnections = [];
    workflowMode = false;
}

function setupTestTab(tabId, tabData) {
    const tabs = {};
    tabs[tabId] = tabData;
    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
    global.currentTab = tabId;
}

function createUndoRedoButtons() {
    const undoBtn = document.createElement('button');
    undoBtn.id = 'undo-btn';
    undoBtn.disabled = true;
    document.body.appendChild(undoBtn);
    
    const redoBtn = document.createElement('button');
    redoBtn.id = 'redo-btn';
    redoBtn.disabled = true;
    document.body.appendChild(redoBtn);
    
    return { undoBtn, redoBtn };
}

function cleanupButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.remove();
    if (redoBtn) redoBtn.remove();
}

// ============================================================================
// ТЕСТЫ
// ============================================================================

describe('undo.js', () => {
    
    beforeEach(() => {
        resetUndoState();
        cleanupButtons();
    });

    afterEach(() => {
        cleanupButtons();
    });

    // ========================================================================
    // captureCurrentTabState()
    // ========================================================================
    describe('captureCurrentTabState()', () => {
        
        it('должен захватить tabId', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            
            const state = captureCurrentTabState();
            
            expect(state.tabId).toBe('test-tab');
        });

        it('должен захватить workflow данные', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            const workflow = { positions: { b1: { x: 100, y: 200 } }, connections: [] };
            localStorage.setItem('workflow-test-tab', JSON.stringify(workflow));
            
            const state = captureCurrentTabState();
            
            expect(state.workflow).toEqual(workflow);
        });

        it('должен захватить tabData как JSON строку', () => {
            const tabData = { id: 'test-tab', name: 'Test', items: [{ type: 'block', id: 'b1' }] };
            setupTestTab('test-tab', tabData);
            
            const state = captureCurrentTabState();
            
            expect(state.tabData).toBe(JSON.stringify(tabData));
        });

        it('должен захватить fieldValues только для текущей вкладки', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            localStorage.setItem('field-value-test-tab-block1-field1', 'value1');
            localStorage.setItem('field-value-test-tab-block1-field2', 'value2');
            localStorage.setItem('field-value-other-tab-block1-field1', 'other-value');
            
            const state = captureCurrentTabState();
            
            expect(Object.keys(state.fieldValues)).toHaveLength(2);
            expect(state.fieldValues['field-value-test-tab-block1-field1']).toBe('value1');
            expect(state.fieldValues['field-value-other-tab-block1-field1']).toBeUndefined();
        });

        it('должен захватить collapsedBlocks только для блоков текущей вкладки', () => {
            setupTestTab('test-tab', { 
                id: 'test-tab', 
                name: 'Test', 
                items: [{ type: 'block', id: 'b1' }, { type: 'block', id: 'b2' }] 
            });
            collapsedBlocks = { 'b1': true, 'b3': true }; // b3 из другой вкладки
            
            const state = captureCurrentTabState();
            
            expect(state.collapsedBlocks).toEqual({ 'b1': true });
        });

        it('должен захватить blockScripts только для блоков текущей вкладки', () => {
            setupTestTab('test-tab', { 
                id: 'test-tab', 
                name: 'Test', 
                items: [{ type: 'block', id: 'b1' }] 
            });
            blockScripts = { 'b1': ['convert', 'count'], 'b99': ['other'] };
            
            const state = captureCurrentTabState();
            
            expect(state.blockScripts).toEqual({ 'b1': ['convert', 'count'] });
        });

        it('должен захватить blockAutomation только для блоков текущей вкладки', () => {
            setupTestTab('test-tab', { 
                id: 'test-tab', 
                name: 'Test', 
                items: [{ type: 'block', id: 'b1' }] 
            });
            blockAutomation = { 'b1': { newProject: true }, 'b99': { autoSend: true } };
            
            const state = captureCurrentTabState();
            
            expect(state.blockAutomation).toEqual({ 'b1': { newProject: true } });
        });

        it('должен вернуть null для workflow если его нет', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            
            const state = captureCurrentTabState();
            
            expect(state.workflow).toBeNull();
        });

        it('должен вернуть пустые объекты для пустой вкладки', () => {
            setupTestTab('empty-tab', { id: 'empty-tab', name: 'Empty', items: [] });
            
            const state = captureCurrentTabState();
            
            expect(state.fieldValues).toEqual({});
            expect(state.collapsedBlocks).toEqual({});
            expect(state.blockScripts).toEqual({});
            expect(state.blockAutomation).toEqual({});
        });
    });

    // ========================================================================
    // applyCurrentTabState()
    // ========================================================================
    describe('applyCurrentTabState()', () => {
        
        it('должен восстановить workflow данные', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            const state = {
                tabId: 'test-tab',
                workflow: { 
                    positions: { b1: { x: 50, y: 100 } }, 
                    sizes: { b1: { w: 200, h: 300 } },
                    connections: [{ from: 'a', to: 'b' }]
                },
                tabData: null,
                fieldValues: {}
            };
            
            applyCurrentTabState(state);
            
            expect(workflowPositions).toEqual({ b1: { x: 50, y: 100 } });
            expect(workflowSizes).toEqual({ b1: { w: 200, h: 300 } });
            expect(workflowConnections).toEqual([{ from: 'a', to: 'b' }]);
        });

        it('должен восстановить tabData в localStorage', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Old', items: [] });
            const newTabData = { id: 'test-tab', name: 'New', items: [{ type: 'block', id: 'new-b1' }] };
            const state = {
                tabId: 'test-tab',
                workflow: null,
                tabData: JSON.stringify(newTabData),
                fieldValues: {}
            };
            
            applyCurrentTabState(state);
            
            const savedTabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
            expect(savedTabs['test-tab'].name).toBe('New');
            expect(savedTabs['test-tab'].items[0].id).toBe('new-b1');
        });

        it('должен восстановить fieldValues', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            localStorage.setItem('field-value-test-tab-b1-f1', 'old-value');
            
            const state = {
                tabId: 'test-tab',
                workflow: null,
                tabData: null,
                fieldValues: {
                    'field-value-test-tab-b1-f1': 'new-value',
                    'field-value-test-tab-b2-f1': 'another-value'
                }
            };
            
            applyCurrentTabState(state);
            
            expect(localStorage.getItem('field-value-test-tab-b1-f1')).toBe('new-value');
            expect(localStorage.getItem('field-value-test-tab-b2-f1')).toBe('another-value');
        });

        it('должен удалить старые fieldValues перед восстановлением', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            localStorage.setItem('field-value-test-tab-old-field', 'old-value');
            
            const state = {
                tabId: 'test-tab',
                workflow: null,
                tabData: null,
                fieldValues: {
                    'field-value-test-tab-new-field': 'new-value'
                }
            };
            
            applyCurrentTabState(state);
            
            expect(localStorage.getItem('field-value-test-tab-old-field')).toBeNull();
            expect(localStorage.getItem('field-value-test-tab-new-field')).toBe('new-value');
        });

        it('не должен применять состояние если tabId не совпадает', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            const state = {
                tabId: 'other-tab', // Не совпадает с currentTab
                workflow: { positions: { b1: { x: 999, y: 999 } } },
                tabData: null,
                fieldValues: {}
            };
            
            applyCurrentTabState(state);
            
            expect(workflowPositions).toEqual({}); // Не изменилось
        });

        it('не должен падать при null state', () => {
            expect(() => applyCurrentTabState(null)).not.toThrow();
        });

        it('должен восстановить collapsedBlocks', () => {
            const tabData = { id: 'test-tab', name: 'Test', items: [{ type: 'block', id: 'b1' }] };
            setupTestTab('test-tab', tabData);
            collapsedBlocks = { 'b1': false };
            
            const state = {
                tabId: 'test-tab',
                workflow: null,
                tabData: JSON.stringify(tabData),
                fieldValues: {},
                collapsedBlocks: { 'b1': true }
            };
            
            applyCurrentTabState(state);
            
            expect(collapsedBlocks['b1']).toBe(true);
        });

        it('должен восстановить blockScripts', () => {
            const tabData = { id: 'test-tab', name: 'Test', items: [{ type: 'block', id: 'b1' }] };
            setupTestTab('test-tab', tabData);
            blockScripts = {};
            
            const state = {
                tabId: 'test-tab',
                workflow: null,
                tabData: JSON.stringify(tabData),
                fieldValues: {},
                blockScripts: { 'b1': ['convert', 'count'] }
            };
            
            applyCurrentTabState(state);
            
            expect(blockScripts['b1']).toEqual(['convert', 'count']);
        });
    });

    // ========================================================================
    // autoSaveToUndo()
    // ========================================================================
    describe('autoSaveToUndo()', () => {
        
        it('не должен сохранять если приложение не инициализировано', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            isAppInitialized = false;
            
            autoSaveToUndo();
            
            expect(undoStack).toHaveLength(0);
        });

        it('должен сохранять состояние если приложение инициализировано', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            isAppInitialized = true;
            
            autoSaveToUndo();
            
            expect(undoStack).toHaveLength(1);
            expect(undoStack[0].tabId).toBe('test-tab');
        });

        it('не должен сохранять во время undo/redo операции', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            isAppInitialized = true;
            isUndoRedoAction = true;
            
            autoSaveToUndo();
            
            expect(undoStack).toHaveLength(0);
        });

        it('должен применять debounce', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            isAppInitialized = true;
            
            autoSaveToUndo(); // Первое сохранение
            
            // Изменяем данные
            const tabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
            tabs['test-tab'].name = 'Changed';
            localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
            
            autoSaveToUndo(); // Второе сохранение сразу - должно быть пропущено
            
            expect(undoStack).toHaveLength(1); // Только одно сохранение
        });

        it('должен сохранять после истечения debounce', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            isAppInitialized = true;
            
            autoSaveToUndo();
            expect(undoStack).toHaveLength(1);
            
            // Симулируем истечение debounce
            lastUndoSaveTime = Date.now() - UNDO_DEBOUNCE_MS - 100;
            
            // Изменяем данные
            const tabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
            tabs['test-tab'].name = 'Changed';
            localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
            
            autoSaveToUndo();
            
            expect(undoStack).toHaveLength(2);
        });

        it('не должен сохранять дубликаты (одинаковое состояние)', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            isAppInitialized = true;
            
            autoSaveToUndo();
            lastUndoSaveTime = 0; // Сбрасываем debounce
            autoSaveToUndo(); // То же состояние
            
            expect(undoStack).toHaveLength(1); // Дубликат не добавлен
        });

        it('должен ограничивать размер стека MAX_HISTORY_SIZE', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            isAppInitialized = true;
            
            // Заполняем стек до максимума + 5
            for (let i = 0; i < MAX_HISTORY_SIZE + 5; i++) {
                const tabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
                tabs['test-tab'].name = `Test ${i}`;
                localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
                
                lastUndoSaveTime = 0; // Сбрасываем debounce
                autoSaveToUndo();
            }
            
            expect(undoStack.length).toBe(MAX_HISTORY_SIZE);
        });

        it('должен очищать redoStack при новом сохранении', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            isAppInitialized = true;
            redoStack = [{ tabId: 'test-tab', tabData: '{}' }]; // Предзаполняем
            
            autoSaveToUndo();
            
            expect(redoStack).toHaveLength(0);
        });

        it('должен сохранять историю в tabHistories', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            isAppInitialized = true;
            
            autoSaveToUndo();
            
            expect(tabHistories['test-tab']).toBeDefined();
            expect(tabHistories['test-tab'].undoStack).toHaveLength(1);
        });
    });

    // ========================================================================
    // undo()
    // ========================================================================
    describe('undo()', () => {
        
        beforeEach(() => {
            createUndoRedoButtons();
        });

        it('не должен делать ничего если стек пустой', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            undoStack = [];
            
            undo();
            
            expect(redoStack).toHaveLength(0);
        });

        it('не должен делать ничего если только одно состояние в стеке', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            undoStack = [{ tabId: 'test-tab', tabData: '{}' }];
            
            undo();
            
            expect(redoStack).toHaveLength(0);
            expect(undoStack).toHaveLength(1);
        });

        it('должен переместить текущее состояние в redoStack', () => {
            const tabData = { id: 'test-tab', name: 'Test', items: [] };
            setupTestTab('test-tab', tabData);
            undoStack = [
                { tabId: 'test-tab', tabData: JSON.stringify({ id: 'test-tab', name: 'First', items: [] }) },
                { tabId: 'test-tab', tabData: JSON.stringify(tabData) }
            ];
            
            undo();
            
            expect(redoStack).toHaveLength(1);
        });

        it('должен применить предыдущее состояние', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Current', items: [] });
            const previousState = { 
                tabId: 'test-tab', 
                tabData: JSON.stringify({ id: 'test-tab', name: 'Previous', items: [] }),
                workflow: null,
                fieldValues: {}
            };
            undoStack = [
                previousState,
                { tabId: 'test-tab', tabData: JSON.stringify({ id: 'test-tab', name: 'Current', items: [] }) }
            ];
            
            undo();
            
            const savedTabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
            expect(savedTabs['test-tab'].name).toBe('Previous');
        });

        it('должен уменьшить undoStack на 1', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            undoStack = [
                { tabId: 'test-tab', tabData: '{"id":"test-tab","name":"1","items":[]}' },
                { tabId: 'test-tab', tabData: '{"id":"test-tab","name":"2","items":[]}' },
                { tabId: 'test-tab', tabData: '{"id":"test-tab","name":"3","items":[]}' }
            ];
            
            undo();
            
            expect(undoStack).toHaveLength(2);
        });

        it('должен обновить tabHistories', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            undoStack = [
                { tabId: 'test-tab', tabData: '{"id":"test-tab","name":"1","items":[]}' },
                { tabId: 'test-tab', tabData: '{"id":"test-tab","name":"2","items":[]}' }
            ];
            
            undo();
            
            expect(tabHistories['test-tab'].undoStack).toHaveLength(1);
            expect(tabHistories['test-tab'].redoStack).toHaveLength(1);
        });
    });

    // ========================================================================
    // redo()
    // ========================================================================
    describe('redo()', () => {
        
        beforeEach(() => {
            createUndoRedoButtons();
        });

        it('не должен делать ничего если redoStack пустой', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            redoStack = [];
            undoStack = [{ tabId: 'test-tab', tabData: '{}' }];
            const originalLength = undoStack.length;
            
            redo();
            
            expect(undoStack).toHaveLength(originalLength);
        });

        it('должен переместить состояние из redoStack в undoStack', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            const redoState = { 
                tabId: 'test-tab', 
                tabData: JSON.stringify({ id: 'test-tab', name: 'Redo', items: [] }),
                workflow: null,
                fieldValues: {}
            };
            undoStack = [{ tabId: 'test-tab', tabData: '{"id":"test-tab","name":"Current","items":[]}' }];
            redoStack = [redoState];
            
            redo();
            
            expect(undoStack).toHaveLength(2);
            expect(redoStack).toHaveLength(0);
        });

        it('должен применить состояние из redoStack', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Current', items: [] });
            const redoState = { 
                tabId: 'test-tab', 
                tabData: JSON.stringify({ id: 'test-tab', name: 'Restored', items: [] }),
                workflow: null,
                fieldValues: {}
            };
            undoStack = [{ tabId: 'test-tab', tabData: '{}' }];
            redoStack = [redoState];
            
            redo();
            
            const savedTabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
            expect(savedTabs['test-tab'].name).toBe('Restored');
        });

        it('должен обновить tabHistories', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            undoStack = [{ tabId: 'test-tab', tabData: '{}' }];
            redoStack = [{ tabId: 'test-tab', tabData: '{}', workflow: null, fieldValues: {} }];
            
            redo();
            
            expect(tabHistories['test-tab'].undoStack).toHaveLength(2);
            expect(tabHistories['test-tab'].redoStack).toHaveLength(0);
        });
    });

    // ========================================================================
    // updateUndoRedoButtons()
    // ========================================================================
    describe('updateUndoRedoButtons()', () => {
        
        beforeEach(() => {
            createUndoRedoButtons();
        });

        it('должен отключить undo кнопку если стек пустой', () => {
            undoStack = [];
            
            updateUndoRedoButtons();
            
            expect(getUndoBtn().disabled).toBe(true);
        });

        it('должен отключить undo кнопку если только одно состояние', () => {
            undoStack = [{ tabId: 'test' }];
            
            updateUndoRedoButtons();
            
            expect(getUndoBtn().disabled).toBe(true);
        });

        it('должен включить undo кнопку если есть история', () => {
            undoStack = [{ tabId: 'test' }, { tabId: 'test' }];
            
            updateUndoRedoButtons();
            
            expect(getUndoBtn().disabled).toBe(false);
        });

        it('должен отключить redo кнопку если стек пустой', () => {
            redoStack = [];
            
            updateUndoRedoButtons();
            
            expect(getRedoBtn().disabled).toBe(true);
        });

        it('должен включить redo кнопку если есть состояния', () => {
            redoStack = [{ tabId: 'test' }];
            
            updateUndoRedoButtons();
            
            expect(getRedoBtn().disabled).toBe(false);
        });

        it('не должен падать если кнопки отсутствуют', () => {
            cleanupButtons();
            
            expect(() => updateUndoRedoButtons()).not.toThrow();
        });
    });

    // ========================================================================
    // Интеграционные тесты
    // ========================================================================
    describe('Integration: undo/redo workflow', () => {
        
        beforeEach(() => {
            createUndoRedoButtons();
            isAppInitialized = true;
        });

        it('должен корректно восстанавливать состояние через undo -> redo', () => {
            // Начальное состояние
            setupTestTab('test-tab', { id: 'test-tab', name: 'State 1', items: [] });
            autoSaveToUndo();
            
            // Изменяем состояние
            lastUndoSaveTime = 0;
            const tabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
            tabs['test-tab'].name = 'State 2';
            localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
            autoSaveToUndo();
            
            expect(undoStack).toHaveLength(2);
            
            // Undo
            undo();
            let savedTabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
            expect(savedTabs['test-tab'].name).toBe('State 1');
            
            // Redo
            redo();
            savedTabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
            expect(savedTabs['test-tab'].name).toBe('State 2');
        });

        it('должен изолировать историю между вкладками', () => {
            // Вкладка 1
            setupTestTab('tab1', { id: 'tab1', name: 'Tab 1', items: [] });
            autoSaveToUndo();
            
            // Переключаемся на вкладку 2
            global.currentTab = 'tab2';
            const tabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS));
            tabs['tab2'] = { id: 'tab2', name: 'Tab 2', items: [] };
            localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
            
            // Сбрасываем стеки для новой вкладки
            undoStack = [];
            redoStack = [];
            lastUndoSaveTime = 0;
            
            autoSaveToUndo();
            
            expect(tabHistories['tab1'].undoStack).toHaveLength(1);
            expect(tabHistories['tab2'].undoStack).toHaveLength(1);
        });
    });
});
