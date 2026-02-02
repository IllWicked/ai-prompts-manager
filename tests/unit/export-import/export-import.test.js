/**
 * Unit Tests: export-import.js
 * Тестирование функций экспорта и импорта конфигурации
 */

// ============================================================================
// Моки и глобальные переменные
// ============================================================================

let _tabsCache = null;
let collapsedBlocks = {};
let blockScripts = {};
let blockAutomation = {};
let workflowPositions = {};
let workflowSizes = {};
let workflowConnections = [];

const DEFAULT_TAB = null;

// Mock функции из других модулей
function getAllTabs() {
    if (_tabsCache) return _tabsCache;
    try {
        const data = localStorage.getItem(STORAGE_KEYS.TABS);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        return {};
    }
}

function saveAllTabs(tabs, skipUndo = false) {
    _tabsCache = tabs;
    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
}

function getTabBlocks(tabId) {
    const tabs = getAllTabs();
    const tab = tabs[tabId];
    if (!tab || !tab.items) return [];
    
    let blockNumber = 1;
    return tab.items
        .filter(item => item.type === 'block')
        .map(item => ({ ...item, number: String(blockNumber++) }));
}

function loadFromLocalStorage() {
    try {
        const key = `ai-prompts-manager-data-${global.currentTab}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        return {};
    }
}

function getBlockScripts(blockId) {
    return blockScripts[blockId] || [];
}

function isBlockCollapsed(blockId) {
    return !!collapsedBlocks[blockId];
}

function getBlockAutomationFlags(blockId) {
    return blockAutomation[blockId] || {};
}

function hasBlockAttachmentsPanel(blockId) {
    return false; // Mock - всегда false
}

function hasBlockScript(blockId, scriptKey) {
    return blockScripts[blockId]?.includes(scriptKey) || false;
}

function toggleBlockScript(blockId, scriptKey) {
    if (!blockScripts[blockId]) {
        blockScripts[blockId] = [];
    }
    const index = blockScripts[blockId].indexOf(scriptKey);
    if (index === -1) {
        blockScripts[blockId].push(scriptKey);
    } else {
        blockScripts[blockId].splice(index, 1);
    }
}

function saveCollapsedBlocks() {
    localStorage.setItem('collapsed-blocks', JSON.stringify(collapsedBlocks));
}

function saveBlockAutomation() {
    localStorage.setItem('block-automation', JSON.stringify(blockAutomation));
}

function switchToTab(tabId) {
    global.currentTab = tabId;
}

function showImportConfirm(message) {
    return Promise.resolve(true); // Mock - всегда подтверждаем
}

// ============================================================================
// Функции из export-import.js (копируем для тестирования)
// ============================================================================

/**
 * Подготовка данных для экспорта (без Tauri-specific кода)
 */
function prepareExportData(tabId) {
    const tabs = getAllTabs();
    const currentTabData = tabs[tabId];
    
    if (!currentTabData) {
        return null;
    }
    
    const savedContent = loadFromLocalStorage();
    
    const exportTabData = JSON.parse(JSON.stringify(currentTabData));
    
    let blockIndex = 0;
    exportTabData.items = exportTabData.items.map(item => {
        if (item.type === 'block') {
            blockIndex++;
            const blockNumber = String(blockIndex);
            const content = savedContent[item.id] !== undefined ? savedContent[item.id] : savedContent[blockNumber];
            const scripts = getBlockScripts(item.id);
            const collapsed = isBlockCollapsed(item.id);
            const automation = getBlockAutomationFlags(item.id);
            const hasAttachments = hasBlockAttachmentsPanel(item.id);
            
            const updatedItem = { ...item };
            if (content !== undefined) {
                updatedItem.content = content;
            }
            if (scripts.length > 0) {
                updatedItem.scripts = scripts;
            }
            if (collapsed) {
                updatedItem.collapsed = true;
            }
            if (Object.keys(automation).length > 0) {
                updatedItem.automation = automation;
            }
            if (hasAttachments) {
                updatedItem.hasAttachments = true;
            }
            return updatedItem;
        }
        return item;
    });
    
    return {
        version: 2,
        exportDate: new Date().toISOString(),
        tab: exportTabData,
        workflow: {
            positions: workflowPositions,
            sizes: workflowSizes,
            connections: workflowConnections
        }
    };
}

/**
 * Обработка импорта (без file input)
 */
function processImportData(configText, existingTabs) {
    try {
        const config = JSON.parse(configText);
        const result = {
            tabs: {},
            workflows: {},
            conflicts: []
        };
        
        if (config.tab) {
            const tabId = config.tab.id || `imported-${Date.now()}`;
            config.tab.id = tabId;
            result.tabs[tabId] = config.tab;
            if (existingTabs[tabId]) {
                result.conflicts.push(existingTabs[tabId].name);
            }
            if (config.workflow) {
                result.workflows[tabId] = config.workflow;
            }
        } else if (config.tabs) {
            Object.entries(config.tabs).forEach(([id, tab]) => {
                result.tabs[id] = tab;
                if (existingTabs[id]) {
                    result.conflicts.push(existingTabs[id].name);
                }
            });
        }
        
        return result;
    } catch (e) {
        return null;
    }
}

/**
 * Применение импортированных данных
 */
function applyImportedData(importResult) {
    const tabs = getAllTabs();
    const mergedTabs = { ...tabs, ...importResult.tabs };
    saveAllTabs(mergedTabs, true);
    
    // Извлекаем scripts, collapsed и automation
    Object.values(importResult.tabs).forEach(tab => {
        if (tab.items) {
            tab.items.forEach(item => {
                if (item.type === 'block') {
                    if (item.scripts && item.scripts.length > 0) {
                        item.scripts.forEach(scriptKey => {
                            if (!hasBlockScript(item.id, scriptKey)) {
                                toggleBlockScript(item.id, scriptKey);
                            }
                        });
                    }
                    if (item.collapsed) {
                        collapsedBlocks[item.id] = true;
                    }
                    if (item.automation && Object.keys(item.automation).length > 0) {
                        blockAutomation[item.id] = { ...item.automation };
                    }
                }
            });
        }
    });
    saveCollapsedBlocks();
    saveBlockAutomation();
    
    // Workflow state
    Object.entries(importResult.workflows).forEach(([tabId, workflow]) => {
        const workflowData = {
            positions: workflow.positions || {},
            sizes: workflow.sizes || {},
            connections: workflow.connections || []
        };
        localStorage.setItem(`workflow-${tabId}`, JSON.stringify(workflowData));
    });
    
    return Object.keys(importResult.tabs).length;
}

/**
 * Генерация безопасного имени файла
 */
function generateSafeFileName(tabName) {
    const safeName = tabName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ]/g, '-').toLowerCase();
    const date = new Date().toISOString().split('T')[0];
    return `${safeName}-${date}.json`;
}

// ============================================================================
// Вспомогательные функции для тестов
// ============================================================================

function resetState() {
    _tabsCache = null;
    collapsedBlocks = {};
    blockScripts = {};
    blockAutomation = {};
    workflowPositions = {};
    workflowSizes = {};
    workflowConnections = [];
    global.currentTab = 'test-tab';
}

function setupTestTab(tabId, tabData) {
    const tabs = {};
    tabs[tabId] = tabData;
    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
    _tabsCache = tabs;
    global.currentTab = tabId;
}

// ============================================================================
// ТЕСТЫ
// ============================================================================

describe('export-import.js', () => {
    
    beforeEach(() => {
        resetState();
    });

    // ========================================================================
    // prepareExportData()
    // ========================================================================
    describe('prepareExportData()', () => {
        
        it('должен вернуть null для несуществующей вкладки', () => {
            setupTestTab('other-tab', { id: 'other-tab', name: 'Other', items: [] });
            
            const result = prepareExportData('non-existent');
            
            expect(result).toBeNull();
        });

        it('должен экспортировать базовую структуру вкладки', () => {
            setupTestTab('test-tab', { 
                id: 'test-tab', 
                name: 'Test Tab', 
                items: [] 
            });
            
            const result = prepareExportData('test-tab');
            
            expect(result.version).toBe(2);
            expect(result.tab.id).toBe('test-tab');
            expect(result.tab.name).toBe('Test Tab');
            expect(result.exportDate).toBeDefined();
        });

        it('должен включить workflow данные', () => {
            setupTestTab('test-tab', { id: 'test-tab', name: 'Test', items: [] });
            workflowPositions = { 'b1': { x: 100, y: 200 } };
            workflowSizes = { 'b1': { w: 300, h: 400 } };
            workflowConnections = [{ from: 'a', to: 'b' }];
            
            const result = prepareExportData('test-tab');
            
            expect(result.workflow.positions).toEqual({ 'b1': { x: 100, y: 200 } });
            expect(result.workflow.sizes).toEqual({ 'b1': { w: 300, h: 400 } });
            expect(result.workflow.connections).toEqual([{ from: 'a', to: 'b' }]);
        });

        it('должен включить скрипты блоков', () => {
            setupTestTab('test-tab', { 
                id: 'test-tab', 
                name: 'Test', 
                items: [{ type: 'block', id: 'b1', title: 'Block 1' }] 
            });
            blockScripts['b1'] = ['convert', 'count'];
            
            const result = prepareExportData('test-tab');
            
            expect(result.tab.items[0].scripts).toEqual(['convert', 'count']);
        });

        it('должен включить collapsed состояние', () => {
            setupTestTab('test-tab', { 
                id: 'test-tab', 
                name: 'Test', 
                items: [{ type: 'block', id: 'b1', title: 'Block 1' }] 
            });
            collapsedBlocks['b1'] = true;
            
            const result = prepareExportData('test-tab');
            
            expect(result.tab.items[0].collapsed).toBe(true);
        });

        it('должен включить automation флаги', () => {
            setupTestTab('test-tab', { 
                id: 'test-tab', 
                name: 'Test', 
                items: [{ type: 'block', id: 'b1', title: 'Block 1' }] 
            });
            blockAutomation['b1'] = { newProject: true, autoSend: true };
            
            const result = prepareExportData('test-tab');
            
            expect(result.tab.items[0].automation).toEqual({ newProject: true, autoSend: true });
        });

        it('не должен включать пустые scripts', () => {
            setupTestTab('test-tab', { 
                id: 'test-tab', 
                name: 'Test', 
                items: [{ type: 'block', id: 'b1', title: 'Block 1' }] 
            });
            blockScripts['b1'] = [];
            
            const result = prepareExportData('test-tab');
            
            expect(result.tab.items[0].scripts).toBeUndefined();
        });

        it('должен корректно обрабатывать смешанные items', () => {
            setupTestTab('test-tab', { 
                id: 'test-tab', 
                name: 'Test', 
                items: [
                    { type: 'separator', id: 's1' },
                    { type: 'block', id: 'b1', title: 'Block 1' },
                    { type: 'separator', id: 's2' },
                    { type: 'block', id: 'b2', title: 'Block 2' }
                ] 
            });
            
            const result = prepareExportData('test-tab');
            
            expect(result.tab.items).toHaveLength(4);
            expect(result.tab.items[0].type).toBe('separator');
            expect(result.tab.items[1].type).toBe('block');
        });
    });

    // ========================================================================
    // processImportData()
    // ========================================================================
    describe('processImportData()', () => {
        
        it('должен вернуть null для невалидного JSON', () => {
            const result = processImportData('invalid json {{{', {});
            
            expect(result).toBeNull();
        });

        it('должен распарсить одиночную вкладку (формат v2)', () => {
            const config = {
                version: 2,
                tab: { id: 'imported-tab', name: 'Imported', items: [] }
            };
            
            const result = processImportData(JSON.stringify(config), {});
            
            expect(result.tabs['imported-tab']).toBeDefined();
            expect(result.tabs['imported-tab'].name).toBe('Imported');
        });

        it('должен распарсить workflow из v2 формата', () => {
            const config = {
                version: 2,
                tab: { id: 'imported-tab', name: 'Imported', items: [] },
                workflow: {
                    positions: { 'b1': { x: 50, y: 50 } },
                    connections: []
                }
            };
            
            const result = processImportData(JSON.stringify(config), {});
            
            expect(result.workflows['imported-tab']).toBeDefined();
            expect(result.workflows['imported-tab'].positions).toEqual({ 'b1': { x: 50, y: 50 } });
        });

        it('должен распарсить множественные вкладки (старый формат)', () => {
            const config = {
                tabs: {
                    'tab1': { id: 'tab1', name: 'Tab 1', items: [] },
                    'tab2': { id: 'tab2', name: 'Tab 2', items: [] }
                }
            };
            
            const result = processImportData(JSON.stringify(config), {});
            
            expect(Object.keys(result.tabs)).toHaveLength(2);
            expect(result.tabs['tab1']).toBeDefined();
            expect(result.tabs['tab2']).toBeDefined();
        });

        it('должен определить конфликты с существующими вкладками', () => {
            const config = {
                version: 2,
                tab: { id: 'existing-tab', name: 'Conflict', items: [] }
            };
            const existingTabs = {
                'existing-tab': { id: 'existing-tab', name: 'Existing', items: [] }
            };
            
            const result = processImportData(JSON.stringify(config), existingTabs);
            
            expect(result.conflicts).toContain('Existing');
        });

        it('должен генерировать ID если отсутствует', () => {
            const config = {
                version: 2,
                tab: { name: 'No ID Tab', items: [] }
            };
            
            const result = processImportData(JSON.stringify(config), {});
            
            const tabIds = Object.keys(result.tabs);
            expect(tabIds).toHaveLength(1);
            expect(tabIds[0]).toMatch(/^imported-\d+$/);
        });
    });

    // ========================================================================
    // applyImportedData()
    // ========================================================================
    describe('applyImportedData()', () => {
        
        it('должен сохранить импортированные вкладки', () => {
            setupTestTab('existing', { id: 'existing', name: 'Existing', items: [] });
            
            const importResult = {
                tabs: {
                    'new-tab': { id: 'new-tab', name: 'New Tab', items: [] }
                },
                workflows: {}
            };
            
            applyImportedData(importResult);
            
            const tabs = getAllTabs();
            expect(tabs['existing']).toBeDefined();
            expect(tabs['new-tab']).toBeDefined();
        });

        it('должен перезаписать существующую вкладку', () => {
            setupTestTab('my-tab', { id: 'my-tab', name: 'Old Name', items: [] });
            
            const importResult = {
                tabs: {
                    'my-tab': { id: 'my-tab', name: 'New Name', items: [] }
                },
                workflows: {}
            };
            
            applyImportedData(importResult);
            
            const tabs = getAllTabs();
            expect(tabs['my-tab'].name).toBe('New Name');
        });

        it('должен импортировать scripts блоков', () => {
            const importResult = {
                tabs: {
                    'new-tab': { 
                        id: 'new-tab', 
                        name: 'New', 
                        items: [
                            { type: 'block', id: 'b1', scripts: ['convert', 'count'] }
                        ] 
                    }
                },
                workflows: {}
            };
            
            applyImportedData(importResult);
            
            expect(blockScripts['b1']).toEqual(['convert', 'count']);
        });

        it('должен импортировать collapsed состояние', () => {
            const importResult = {
                tabs: {
                    'new-tab': { 
                        id: 'new-tab', 
                        name: 'New', 
                        items: [
                            { type: 'block', id: 'b1', collapsed: true }
                        ] 
                    }
                },
                workflows: {}
            };
            
            applyImportedData(importResult);
            
            expect(collapsedBlocks['b1']).toBe(true);
        });

        it('должен импортировать automation флаги', () => {
            const importResult = {
                tabs: {
                    'new-tab': { 
                        id: 'new-tab', 
                        name: 'New', 
                        items: [
                            { type: 'block', id: 'b1', automation: { newProject: true } }
                        ] 
                    }
                },
                workflows: {}
            };
            
            applyImportedData(importResult);
            
            expect(blockAutomation['b1']).toEqual({ newProject: true });
        });

        it('должен сохранить workflow в localStorage', () => {
            const importResult = {
                tabs: {
                    'new-tab': { id: 'new-tab', name: 'New', items: [] }
                },
                workflows: {
                    'new-tab': {
                        positions: { 'b1': { x: 100, y: 200 } },
                        sizes: {},
                        connections: []
                    }
                }
            };
            
            applyImportedData(importResult);
            
            const saved = JSON.parse(localStorage.getItem('workflow-new-tab'));
            expect(saved.positions).toEqual({ 'b1': { x: 100, y: 200 } });
        });

        it('должен вернуть количество импортированных вкладок', () => {
            const importResult = {
                tabs: {
                    'tab1': { id: 'tab1', name: 'Tab 1', items: [] },
                    'tab2': { id: 'tab2', name: 'Tab 2', items: [] },
                    'tab3': { id: 'tab3', name: 'Tab 3', items: [] }
                },
                workflows: {}
            };
            
            const count = applyImportedData(importResult);
            
            expect(count).toBe(3);
        });
    });

    // ========================================================================
    // generateSafeFileName()
    // ========================================================================
    describe('generateSafeFileName()', () => {
        
        it('должен сгенерировать безопасное имя файла', () => {
            const fileName = generateSafeFileName('My Tab Name');
            
            expect(fileName).toMatch(/^my-tab-name-\d{4}-\d{2}-\d{2}\.json$/);
        });

        it('должен удалить спецсимволы', () => {
            const fileName = generateSafeFileName('Tab @#$%^& Name!');
            
            // Спецсимволы заменяются на дефисы
            expect(fileName).toMatch(/^tab-+name-+\d{4}-\d{2}-\d{2}\.json$/);
        });

        it('должен сохранить кириллицу', () => {
            const fileName = generateSafeFileName('Моя Вкладка');
            
            expect(fileName).toContain('моя-вкладка');
        });

        it('должен привести к нижнему регистру', () => {
            const fileName = generateSafeFileName('UPPERCASE');
            
            expect(fileName).toContain('uppercase');
        });

        it('должен добавить дату', () => {
            const today = new Date().toISOString().split('T')[0];
            const fileName = generateSafeFileName('Test');
            
            expect(fileName).toContain(today);
        });
    });

    // ========================================================================
    // Интеграционные тесты
    // ========================================================================
    describe('Integration: export → import cycle', () => {
        
        it('должен корректно экспортировать и импортировать вкладку', () => {
            // Подготавливаем вкладку
            setupTestTab('original', { 
                id: 'original', 
                name: 'Original Tab', 
                items: [
                    { type: 'block', id: 'b1', title: 'Block 1', content: 'Content 1' },
                    { type: 'block', id: 'b2', title: 'Block 2', content: 'Content 2' }
                ] 
            });
            blockScripts['b1'] = ['convert'];
            collapsedBlocks['b2'] = true;
            workflowPositions = { 'b1': { x: 100, y: 100 }, 'b2': { x: 200, y: 200 } };
            
            // Экспорт
            const exportData = prepareExportData('original');
            const jsonString = JSON.stringify(exportData);
            
            // Очистка
            resetState();
            
            // Импорт
            const importResult = processImportData(jsonString, {});
            expect(importResult).not.toBeNull();
            
            applyImportedData(importResult);
            
            // Проверка
            const tabs = getAllTabs();
            expect(tabs['original']).toBeDefined();
            expect(tabs['original'].name).toBe('Original Tab');
            expect(tabs['original'].items).toHaveLength(2);
            expect(blockScripts['b1']).toEqual(['convert']);
            expect(collapsedBlocks['b2']).toBe(true);
            
            const workflow = JSON.parse(localStorage.getItem('workflow-original'));
            expect(workflow.positions['b1']).toEqual({ x: 100, y: 100 });
        });

        it('должен обработать импорт с конфликтами', () => {
            // Существующая вкладка
            setupTestTab('conflict-tab', { 
                id: 'conflict-tab', 
                name: 'Existing', 
                items: [{ type: 'block', id: 'old-b1', title: 'Old Block' }] 
            });
            
            // Импортируемые данные с тем же ID
            const importConfig = {
                version: 2,
                tab: { 
                    id: 'conflict-tab', 
                    name: 'Imported', 
                    items: [{ type: 'block', id: 'new-b1', title: 'New Block' }] 
                }
            };
            
            const importResult = processImportData(JSON.stringify(importConfig), getAllTabs());
            
            expect(importResult.conflicts).toContain('Existing');
            
            // После подтверждения - применяем
            applyImportedData(importResult);
            
            const tabs = getAllTabs();
            expect(tabs['conflict-tab'].name).toBe('Imported');
            expect(tabs['conflict-tab'].items[0].id).toBe('new-b1');
        });
    });
});
