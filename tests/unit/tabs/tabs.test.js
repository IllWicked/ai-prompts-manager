/**
 * Unit Tests: tabs.js
 * Тестирование функций управления вкладками
 */

// ============================================================================
// Вспомогательные функции и моки
// ============================================================================

// Кэш для tabs (эмулирует внутренний кэш storage.js)
let _tabsCache = null;

function setTabsCache(tabs) {
    _tabsCache = tabs;
}

function clearTabsCache() {
    _tabsCache = null;
}

// Эмуляция getAllTabs из storage.js
function getAllTabs() {
    if (_tabsCache !== null) {
        return _tabsCache;
    }
    try {
        const data = localStorage.getItem(STORAGE_KEYS.TABS);
        if (data) {
            _tabsCache = JSON.parse(data);
            return _tabsCache;
        }
        return {};
    } catch (e) {
        return {};
    }
}

// Эмуляция saveAllTabs из storage.js
function saveAllTabs(tabs, skipUndo = false) {
    _tabsCache = tabs;
    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
}

// Генератор ID (упрощённый)
let idCounter = 0;
function generateTabId() {
    return `tab_${Date.now()}_${idCounter++}`;
}

function generateItemId() {
    return `item_${Date.now()}_${idCounter++}`;
}

// Глобальные переменные для тестов
let collapsedBlocks = {};
let blockScripts = {};
let blockAutomation = {};
let blockAttachments = {};
let tabHistories = {};

function saveCollapsedBlocks() {
    localStorage.setItem(STORAGE_KEYS.COLLAPSED_BLOCKS, JSON.stringify(collapsedBlocks));
}

function saveBlockScripts() {
    localStorage.setItem(STORAGE_KEYS.BLOCK_SCRIPTS, JSON.stringify(blockScripts));
}

function saveBlockAutomation() {
    localStorage.setItem(STORAGE_KEYS.BLOCK_AUTOMATION, JSON.stringify(blockAutomation));
}

// ============================================================================
// Функции из tabs.js (копируем для изолированного тестирования)
// ============================================================================

function getTabItems(tabId) {
    const tabs = getAllTabs();
    const tab = tabs[tabId];
    return tab?.items || [];
}

function getTabBlocks(tabId) {
    const items = getTabItems(tabId);
    let blockNumber = 1;
    return items
        .filter(item => item.type === 'block')
        .map(item => ({
            ...item,
            number: String(blockNumber++)
        }));
}

function createNewTab(name) {
    const tabs = getAllTabs();
    const id = generateTabId();
    tabs[id] = {
        id,
        name,
        items: []
    };
    saveAllTabs(tabs, true);
    return id;
}

function updateTab(id, updates) {
    const tabs = getAllTabs();
    if (tabs[id]) {
        tabs[id] = { ...tabs[id], ...updates };
        saveAllTabs(tabs, true);
    }
}

function renameTab(oldId, newName) {
    const tabs = getAllTabs();
    if (!tabs[oldId]) return;
    
    const newId = newName.toLowerCase()
        .replace(/[^a-zа-яё0-9\s-]/gi, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'tab';
    
    if (newId === oldId) {
        tabs[oldId].name = newName;
        saveAllTabs(tabs, true);
        return;
    }
    
    let finalId = newId;
    let counter = 1;
    while (tabs[finalId] && finalId !== oldId) {
        finalId = `${newId}-${counter}`;
        counter++;
    }
    
    const tabData = { ...tabs[oldId], id: finalId, name: newName };
    tabs[finalId] = tabData;
    delete tabs[oldId];
    
    const oldWorkflow = localStorage.getItem(`workflow-${oldId}`);
    if (oldWorkflow) {
        localStorage.setItem(`workflow-${finalId}`, oldWorkflow);
        localStorage.removeItem(`workflow-${oldId}`);
    }
    
    if (tabHistories[oldId]) {
        tabHistories[finalId] = tabHistories[oldId];
        delete tabHistories[oldId];
    }
    
    if (global.currentTab === oldId) {
        global.currentTab = finalId;
        if (global.AppState?.app) {
            global.AppState.app.currentTab = finalId;
        }
    }
    
    if (global.AppState?.claude?.project?.ownerTab === oldId) {
        global.AppState.claude.project.ownerTab = finalId;
        localStorage.setItem('active-project', JSON.stringify(global.AppState.claude.project));
    }
    
    saveAllTabs(tabs, true);
}

function deleteTab(id) {
    const tabs = getAllTabs();
    
    if (Object.keys(tabs).length <= 1) {
        showAlert('Нельзя удалить последнюю вкладку');
        return false;
    }
    
    const tabItems = tabs[id]?.items || [];
    tabItems.forEach(item => {
        if (item.type === 'block' && item.id) {
            if (blockScripts[item.id]) {
                delete blockScripts[item.id];
            }
            if (collapsedBlocks[item.id]) {
                delete collapsedBlocks[item.id];
            }
            if (blockAttachments[item.id]) {
                delete blockAttachments[item.id];
            }
        }
    });
    
    if (tabHistories[id]) {
        delete tabHistories[id];
    }
    
    localStorage.removeItem(`workflow-${id}`);
    
    delete tabs[id];
    saveAllTabs(tabs, true);
    localStorage.removeItem(`ai-prompts-manager-${id}`);
    localStorage.removeItem(`ai-prompts-manager-data-${id}`);
    
    return true;
}

function addBlockToTab(tabId) {
    const tabs = getAllTabs();
    if (!tabs[tabId]?.items) return;
    
    const items = tabs[tabId].items;
    const blockCount = items.filter(i => i.type === 'block').length;
    const newBlock = {
        type: 'block',
        id: generateItemId(),
        title: `Блок ${blockCount + 1}`,
        content: ''
    };
    items.push(newBlock);
    markTabAsModified(tabId);
    saveAllTabs(tabs);
    
    return newBlock.id;
}

function removeItemFromTab(tabId, itemId) {
    const tabs = getAllTabs();
    if (!tabs[tabId] || !tabs[tabId].items) return;
    
    const items = tabs[tabId].items;
    
    const prefix = `field-value-${tabId}-${itemId}`;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (collapsedBlocks[itemId]) {
        delete collapsedBlocks[itemId];
        saveCollapsedBlocks();
    }
    
    if (blockScripts[itemId]) {
        delete blockScripts[itemId];
        saveBlockScripts();
    }
    
    if (blockAutomation[itemId]) {
        delete blockAutomation[itemId];
        saveBlockAutomation();
    }
    
    if (blockAttachments[itemId]) {
        delete blockAttachments[itemId];
    }
    
    markTabAsModified(tabId);
    
    tabs[tabId].items = items.filter(i => i.id !== itemId);
    saveAllTabs(tabs);
}

function removeBlockFromTab(tabId, blockNumber) {
    const blocks = getTabBlocks(tabId);
    const block = blocks.find(b => b.number === blockNumber);
    if (block) {
        removeItemFromTab(tabId, block.id);
    }
}

function updateBlockTitle(tabId, blockNumber, newTitle) {
    const tabs = getAllTabs();
    if (!tabs[tabId] || !tabs[tabId].items) return;
    
    const blocks = getTabBlocks(tabId);
    const block = blocks.find(b => b.number === blockNumber);
    if (!block) return;
    
    const item = tabs[tabId].items.find(i => i.id === block.id);
    if (item) {
        item.title = newTitle;
        markTabAsModified(tabId);
        saveAllTabs(tabs);
    }
}

function updateBlockInstruction(tabId, blockNumber, instruction) {
    const tabs = getAllTabs();
    if (!tabs[tabId] || !tabs[tabId].items) return;
    
    const blocks = getTabBlocks(tabId);
    const block = blocks.find(b => b.number === blockNumber);
    if (!block) return;
    
    const item = tabs[tabId].items.find(i => i.id === block.id);
    if (item) {
        item.instruction = instruction;
        markTabAsModified(tabId);
        saveAllTabs(tabs);
    }
}

function markTabAsModified(tabId) {
    const tabs = getAllTabs();
    if (!tabs[tabId]) return;
    
    if (tabs[tabId].version) {
        tabs[tabId].userModified = true;
    }
}

// ============================================================================
// ТЕСТЫ
// ============================================================================

describe('tabs.js', () => {
    
    beforeEach(() => {
        clearTabsCache();
        idCounter = 0;
        collapsedBlocks = {};
        blockScripts = {};
        blockAutomation = {};
        blockAttachments = {};
        tabHistories = {};
        global.currentTab = 'test-tab';
    });

    // ========================================================================
    // getTabItems()
    // ========================================================================
    describe('getTabItems()', () => {
        
        it('должен вернуть items вкладки', () => {
            const tabs = {
                'my-tab': {
                    id: 'my-tab',
                    name: 'My Tab',
                    items: [
                        { type: 'block', id: 'b1' },
                        { type: 'block', id: 'b2' }
                    ]
                }
            };
            saveAllTabs(tabs);
            
            const items = getTabItems('my-tab');
            
            expect(items).toHaveLength(2);
            expect(items[0].id).toBe('b1');
        });

        it('должен вернуть пустой массив для несуществующей вкладки', () => {
            saveAllTabs({});
            
            const items = getTabItems('non-existent');
            
            expect(items).toEqual([]);
        });

        it('должен вернуть пустой массив если items отсутствует', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'My Tab' }
            };
            saveAllTabs(tabs);
            
            const items = getTabItems('my-tab');
            
            expect(items).toEqual([]);
        });
    });

    // ========================================================================
    // getTabBlocks()
    // ========================================================================
    describe('getTabBlocks()', () => {
        
        it('должен вернуть только блоки (без separators)', () => {
            const tabs = {
                'my-tab': {
                    id: 'my-tab',
                    name: 'My Tab',
                    items: [
                        { type: 'block', id: 'b1', title: 'Block 1' },
                        { type: 'separator', id: 's1' },
                        { type: 'block', id: 'b2', title: 'Block 2' }
                    ]
                }
            };
            saveAllTabs(tabs);
            
            const blocks = getTabBlocks('my-tab');
            
            expect(blocks).toHaveLength(2);
            expect(blocks[0].type).toBe('block');
            expect(blocks[1].type).toBe('block');
        });

        it('должен добавить номера блокам', () => {
            const tabs = {
                'my-tab': {
                    id: 'my-tab',
                    name: 'My Tab',
                    items: [
                        { type: 'block', id: 'b1' },
                        { type: 'block', id: 'b2' },
                        { type: 'block', id: 'b3' }
                    ]
                }
            };
            saveAllTabs(tabs);
            
            const blocks = getTabBlocks('my-tab');
            
            expect(blocks[0].number).toBe('1');
            expect(blocks[1].number).toBe('2');
            expect(blocks[2].number).toBe('3');
        });

        it('должен нумеровать только блоки (пропуская separators)', () => {
            const tabs = {
                'my-tab': {
                    id: 'my-tab',
                    name: 'My Tab',
                    items: [
                        { type: 'separator', id: 's1' },
                        { type: 'block', id: 'b1' },
                        { type: 'separator', id: 's2' },
                        { type: 'block', id: 'b2' }
                    ]
                }
            };
            saveAllTabs(tabs);
            
            const blocks = getTabBlocks('my-tab');
            
            expect(blocks).toHaveLength(2);
            expect(blocks[0].number).toBe('1');
            expect(blocks[1].number).toBe('2');
        });

        it('должен вернуть пустой массив для пустой вкладки', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'My Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            const blocks = getTabBlocks('my-tab');
            
            expect(blocks).toEqual([]);
        });
    });

    // ========================================================================
    // createNewTab()
    // ========================================================================
    describe('createNewTab()', () => {
        
        it('должен создать вкладку с уникальным ID', () => {
            saveAllTabs({});
            
            const id = createNewTab('New Tab');
            
            expect(id).toMatch(/^tab_\d+_\d+$/);
        });

        it('должен создать вкладку с пустыми items', () => {
            saveAllTabs({});
            
            const id = createNewTab('New Tab');
            const allTabs = getAllTabs();
            
            expect(allTabs[id].items).toEqual([]);
        });

        it('должен сохранить имя вкладки', () => {
            saveAllTabs({});
            
            const id = createNewTab('My Custom Tab');
            const allTabs = getAllTabs();
            
            expect(allTabs[id].name).toBe('My Custom Tab');
        });
    });

    // ========================================================================
    // updateTab()
    // ========================================================================
    describe('updateTab()', () => {
        
        it('должен обновить данные вкладки', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Old Name', items: [] }
            };
            saveAllTabs(tabs);
            
            updateTab('my-tab', { name: 'New Name' });
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].name).toBe('New Name');
        });

        it('должен сохранить существующие поля при частичном обновлении', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [{ type: 'block', id: 'b1' }] }
            };
            saveAllTabs(tabs);
            
            updateTab('my-tab', { name: 'Updated Tab' });
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].items).toHaveLength(1);
        });

        it('должен игнорировать несуществующую вкладку', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            updateTab('non-existent', { name: 'New Name' });
            const allTabs = getAllTabs();
            
            expect(allTabs['non-existent']).toBeUndefined();
        });

        it('должен позволять добавлять новые поля', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            updateTab('my-tab', { version: '1.0.0', customField: 'value' });
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].version).toBe('1.0.0');
            expect(allTabs['my-tab'].customField).toBe('value');
        });
    });

    // ========================================================================
    // renameTab()
    // ========================================================================
    describe('renameTab()', () => {
        
        it('должен сгенерировать новый ID из нового имени', () => {
            const tabs = {
                'old-tab': { id: 'old-tab', name: 'Old Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            renameTab('old-tab', 'New Tab Name');
            const allTabs = getAllTabs();
            
            expect(allTabs['new-tab-name']).toBeDefined();
            expect(allTabs['old-tab']).toBeUndefined();
        });

        it('должен обновить только name если ID не изменился', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'My Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            renameTab('my-tab', 'MY TAB'); // ID будет тем же: my-tab
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab']).toBeDefined();
            expect(allTabs['my-tab'].name).toBe('MY TAB');
        });

        it('должен добавить суффикс при конфликте ID', () => {
            const tabs = {
                'existing': { id: 'existing', name: 'Existing', items: [] },
                'old-tab': { id: 'old-tab', name: 'Old Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            renameTab('old-tab', 'Existing');
            const allTabs = getAllTabs();
            
            expect(allTabs['existing-1']).toBeDefined();
            expect(allTabs['existing-1'].name).toBe('Existing');
        });

        it('должен перенести workflow данные', () => {
            const tabs = {
                'old-tab': { id: 'old-tab', name: 'Old', items: [] }
            };
            saveAllTabs(tabs);
            localStorage.setItem('workflow-old-tab', JSON.stringify({ positions: { b1: { x: 100, y: 200 } } }));
            
            renameTab('old-tab', 'New Tab');
            
            expect(localStorage.getItem('workflow-new-tab')).toBeDefined();
            expect(localStorage.getItem('workflow-old-tab')).toBeNull();
        });

        it('должен обновить currentTab если это текущая вкладка', () => {
            const tabs = {
                'current': { id: 'current', name: 'Current', items: [] }
            };
            saveAllTabs(tabs);
            global.currentTab = 'current';
            global.AppState.app.currentTab = 'current';
            
            renameTab('current', 'Renamed Tab');
            
            expect(global.currentTab).toBe('renamed-tab');
            expect(global.AppState.app.currentTab).toBe('renamed-tab');
        });

        it('должен игнорировать несуществующую вкладку', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            renameTab('non-existent', 'New Name');
            const allTabs = getAllTabs();
            
            expect(Object.keys(allTabs)).toEqual(['my-tab']);
        });

        it('должен корректно обрабатывать кириллицу', () => {
            const tabs = {
                'old-tab': { id: 'old-tab', name: 'Old', items: [] }
            };
            saveAllTabs(tabs);
            
            renameTab('old-tab', 'Моя вкладка');
            const allTabs = getAllTabs();
            
            expect(allTabs['моя-вкладка']).toBeDefined();
            expect(allTabs['моя-вкладка'].name).toBe('Моя вкладка');
        });

        it('должен удалять спецсимволы из ID', () => {
            const tabs = {
                'old-tab': { id: 'old-tab', name: 'Old', items: [] }
            };
            saveAllTabs(tabs);
            
            renameTab('old-tab', 'Tab @#$% Name!');
            const allTabs = getAllTabs();
            
            expect(allTabs['tab-name']).toBeDefined();
        });
    });

    // ========================================================================
    // deleteTab()
    // ========================================================================
    describe('deleteTab()', () => {
        
        it('должен удалить вкладку', () => {
            const tabs = {
                'tab1': { id: 'tab1', name: 'Tab 1', items: [] },
                'tab2': { id: 'tab2', name: 'Tab 2', items: [] }
            };
            saveAllTabs(tabs);
            
            const result = deleteTab('tab1');
            const allTabs = getAllTabs();
            
            expect(result).toBe(true);
            expect(allTabs['tab1']).toBeUndefined();
            expect(allTabs['tab2']).toBeDefined();
        });

        it('должен запретить удаление последней вкладки', () => {
            const tabs = {
                'only-tab': { id: 'only-tab', name: 'Only Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            const result = deleteTab('only-tab');
            const allTabs = getAllTabs();
            
            expect(result).toBe(false);
            expect(allTabs['only-tab']).toBeDefined();
            expect(showAlert).toHaveBeenCalledWith('Нельзя удалить последнюю вкладку');
        });

        it('должен очистить blockScripts связанных блоков', () => {
            const tabs = {
                'tab1': { id: 'tab1', name: 'Tab 1', items: [
                    { type: 'block', id: 'block1' }
                ] },
                'tab2': { id: 'tab2', name: 'Tab 2', items: [] }
            };
            saveAllTabs(tabs);
            blockScripts['block1'] = ['convert', 'count'];
            
            deleteTab('tab1');
            
            expect(blockScripts['block1']).toBeUndefined();
        });

        it('должен очистить collapsedBlocks связанных блоков', () => {
            const tabs = {
                'tab1': { id: 'tab1', name: 'Tab 1', items: [
                    { type: 'block', id: 'block1' }
                ] },
                'tab2': { id: 'tab2', name: 'Tab 2', items: [] }
            };
            saveAllTabs(tabs);
            collapsedBlocks['block1'] = true;
            
            deleteTab('tab1');
            
            expect(collapsedBlocks['block1']).toBeUndefined();
        });

        it('должен удалить workflow данные', () => {
            const tabs = {
                'tab1': { id: 'tab1', name: 'Tab 1', items: [] },
                'tab2': { id: 'tab2', name: 'Tab 2', items: [] }
            };
            saveAllTabs(tabs);
            localStorage.setItem('workflow-tab1', JSON.stringify({ positions: {} }));
            
            deleteTab('tab1');
            
            expect(localStorage.getItem('workflow-tab1')).toBeNull();
        });

        it('должен очистить tabHistories', () => {
            const tabs = {
                'tab1': { id: 'tab1', name: 'Tab 1', items: [] },
                'tab2': { id: 'tab2', name: 'Tab 2', items: [] }
            };
            saveAllTabs(tabs);
            tabHistories['tab1'] = { undoStack: [], redoStack: [] };
            
            deleteTab('tab1');
            
            expect(tabHistories['tab1']).toBeUndefined();
        });
    });

    // ========================================================================
    // addBlockToTab()
    // ========================================================================
    describe('addBlockToTab()', () => {
        
        it('должен добавить блок в вкладку', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            const blockId = addBlockToTab('my-tab');
            const allTabs = getAllTabs();
            
            expect(blockId).toBeDefined();
            expect(allTabs['my-tab'].items).toHaveLength(1);
            expect(allTabs['my-tab'].items[0].type).toBe('block');
        });

        it('должен сгенерировать уникальный ID для блока', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            const blockId = addBlockToTab('my-tab');
            
            expect(blockId).toMatch(/^item_\d+_\d+$/);
        });

        it('должен присвоить корректный title', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'b1' },
                    { type: 'block', id: 'b2' }
                ] }
            };
            saveAllTabs(tabs);
            
            addBlockToTab('my-tab');
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].items[2].title).toBe('Блок 3');
        });

        it('должен вернуть undefined для несуществующей вкладки', () => {
            saveAllTabs({});
            
            const result = addBlockToTab('non-existent');
            
            expect(result).toBeUndefined();
        });

        it('должен создать блок с пустым content', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            addBlockToTab('my-tab');
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].items[0].content).toBe('');
        });
    });

    // ========================================================================
    // removeItemFromTab()
    // ========================================================================
    describe('removeItemFromTab()', () => {
        
        it('должен удалить item по ID', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'b1' },
                    { type: 'block', id: 'b2' }
                ] }
            };
            saveAllTabs(tabs);
            
            removeItemFromTab('my-tab', 'b1');
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].items).toHaveLength(1);
            expect(allTabs['my-tab'].items[0].id).toBe('b2');
        });

        it('должен очистить field-values из localStorage', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'block1' }
                ] }
            };
            saveAllTabs(tabs);
            localStorage.setItem('field-value-my-tab-block1-field1', 'value1');
            localStorage.setItem('field-value-my-tab-block1-field2', 'value2');
            localStorage.setItem('field-value-my-tab-other-block', 'keep-this');
            
            removeItemFromTab('my-tab', 'block1');
            
            expect(localStorage.getItem('field-value-my-tab-block1-field1')).toBeNull();
            expect(localStorage.getItem('field-value-my-tab-block1-field2')).toBeNull();
            expect(localStorage.getItem('field-value-my-tab-other-block')).toBe('keep-this');
        });

        it('должен очистить collapsedBlocks', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'block1' }
                ] }
            };
            saveAllTabs(tabs);
            collapsedBlocks['block1'] = true;
            
            removeItemFromTab('my-tab', 'block1');
            
            expect(collapsedBlocks['block1']).toBeUndefined();
        });

        it('должен очистить blockScripts', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'block1' }
                ] }
            };
            saveAllTabs(tabs);
            blockScripts['block1'] = ['convert'];
            
            removeItemFromTab('my-tab', 'block1');
            
            expect(blockScripts['block1']).toBeUndefined();
        });

        it('должен очистить blockAutomation', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'block1' }
                ] }
            };
            saveAllTabs(tabs);
            blockAutomation['block1'] = { newProject: true };
            
            removeItemFromTab('my-tab', 'block1');
            
            expect(blockAutomation['block1']).toBeUndefined();
        });

        it('не должен падать для несуществующей вкладки', () => {
            saveAllTabs({});
            
            expect(() => removeItemFromTab('non-existent', 'block1')).not.toThrow();
        });
    });

    // ========================================================================
    // removeBlockFromTab()
    // ========================================================================
    describe('removeBlockFromTab()', () => {
        
        it('должен удалить блок по номеру', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'b1' },
                    { type: 'block', id: 'b2' },
                    { type: 'block', id: 'b3' }
                ] }
            };
            saveAllTabs(tabs);
            
            removeBlockFromTab('my-tab', '2');
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].items).toHaveLength(2);
            expect(allTabs['my-tab'].items.map(i => i.id)).toEqual(['b1', 'b3']);
        });

        it('не должен ничего делать для несуществующего номера', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'b1' }
                ] }
            };
            saveAllTabs(tabs);
            
            removeBlockFromTab('my-tab', '99');
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].items).toHaveLength(1);
        });
    });

    // ========================================================================
    // updateBlockTitle()
    // ========================================================================
    describe('updateBlockTitle()', () => {
        
        it('должен обновить заголовок блока', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'b1', title: 'Old Title' }
                ] }
            };
            saveAllTabs(tabs);
            
            updateBlockTitle('my-tab', '1', 'New Title');
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].items[0].title).toBe('New Title');
        });

        it('не должен падать для несуществующего номера блока', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            expect(() => updateBlockTitle('my-tab', '1', 'Title')).not.toThrow();
        });

        it('не должен падать для несуществующей вкладки', () => {
            saveAllTabs({});
            
            expect(() => updateBlockTitle('non-existent', '1', 'Title')).not.toThrow();
        });
    });

    // ========================================================================
    // updateBlockInstruction()
    // ========================================================================
    describe('updateBlockInstruction()', () => {
        
        it('должен обновить инструкцию блока', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'b1', title: 'Block' }
                ] }
            };
            saveAllTabs(tabs);
            
            const instruction = { type: 'input', text: 'Enter value' };
            updateBlockInstruction('my-tab', '1', instruction);
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].items[0].instruction).toEqual(instruction);
        });

        it('должен позволять установить instruction в null', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [
                    { type: 'block', id: 'b1', instruction: { type: 'info' } }
                ] }
            };
            saveAllTabs(tabs);
            
            updateBlockInstruction('my-tab', '1', null);
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].items[0].instruction).toBeNull();
        });
    });

    // ========================================================================
    // markTabAsModified()
    // ========================================================================
    describe('markTabAsModified()', () => {
        
        it('должен пометить remote вкладку как изменённую', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', version: '1.0.0', items: [] }
            };
            saveAllTabs(tabs);
            
            markTabAsModified('my-tab');
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].userModified).toBe(true);
        });

        it('не должен помечать локальную вкладку (без version)', () => {
            const tabs = {
                'my-tab': { id: 'my-tab', name: 'Tab', items: [] }
            };
            saveAllTabs(tabs);
            
            markTabAsModified('my-tab');
            const allTabs = getAllTabs();
            
            expect(allTabs['my-tab'].userModified).toBeUndefined();
        });

        it('не должен падать для несуществующей вкладки', () => {
            saveAllTabs({});
            
            expect(() => markTabAsModified('non-existent')).not.toThrow();
        });
    });
});
