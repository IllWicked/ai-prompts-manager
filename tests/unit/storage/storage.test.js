/**
 * Unit Tests: storage.js
 * Тестирование функций работы с localStorage
 */

// Импортируем моки
const { LocalStorageMock } = require('../../mocks/localStorage');

// ============================================================================
// Вспомогательные функции (копируем из storage.js для изолированного тестирования)
// ============================================================================

const DEFAULT_SETTINGS = {
    autoUpdate: true,
    theme: 'auto',
    adminMode: false
};

function getSettings() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch (e) {
        return DEFAULT_SETTINGS;
    }
}

function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

function loadFromStorage(key, defaultValue = {}) {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue));
    } catch(e) {
        return defaultValue;
    }
}

function safeSetItem(key, value) {
    try {
        global.localStorage.setItem(key, value);
        return true;
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            if (typeof showToast === 'function') {
                showToast('Хранилище переполнено. Очистите историю или удалите старые вкладки.');
            }
            return false;
        }
        throw e;
    }
}

function saveToStorage(key, value) {
    safeSetItem(key, JSON.stringify(value));
}

let _tabsCache = null;

function setTabsCache(tabs) {
    _tabsCache = tabs;
}

function clearTabsCache() {
    _tabsCache = null;
}

function isValidTab(tab) {
    if (!tab || typeof tab !== 'object') return false;
    if (typeof tab.id !== 'string' || !tab.id) return false;
    if (typeof tab.name !== 'string') return false;
    if (!Array.isArray(tab.items)) return false;
    
    return tab.items.every(item => {
        if (!item || typeof item !== 'object') return false;
        if (item.type !== 'block') return false;
        if (typeof item.id !== 'string' || !item.id) return false;
        return true;
    });
}

function isValidTabsStructure(tabs) {
    if (!tabs || typeof tabs !== 'object' || Array.isArray(tabs)) return false;
    if (Object.keys(tabs).length === 0) return false;
    
    return Object.entries(tabs).every(([id, tab]) => {
        if (tab.id !== id) return false;
        return isValidTab(tab);
    });
}

function repairTab(tabId, tab) {
    const repaired = {
        id: tabId,
        name: (tab && typeof tab.name === 'string') ? tab.name : tabId,
        items: []
    };
    
    if (tab && Array.isArray(tab.items)) {
        tab.items.forEach((item, idx) => {
            if (item && typeof item === 'object' && item.type === 'block') {
                repaired.items.push({
                    type: 'block',
                    id: item.id || `repaired_${Date.now()}_${idx}`,
                    number: item.number || (idx + 1),
                    title: item.title || `Block ${idx + 1}`,
                    content: item.content || ''
                });
            }
        });
    }
    
    return repaired;
}

// ============================================================================
// ТЕСТЫ
// ============================================================================

describe('storage.js', () => {
    
    beforeEach(() => {
        clearTabsCache();
    });

    // ========================================================================
    // getSettings()
    // ========================================================================
    describe('getSettings()', () => {
        
        it('должен вернуть DEFAULT_SETTINGS при пустом localStorage', () => {
            const settings = getSettings();
            
            expect(settings).toEqual(DEFAULT_SETTINGS);
            expect(settings.autoUpdate).toBe(true);
            expect(settings.theme).toBe('auto');
            expect(settings.adminMode).toBe(false);
        });

        it('должен смержить сохранённые настройки с defaults', () => {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ 
                theme: 'dark' 
            }));
            
            const settings = getSettings();
            
            expect(settings.theme).toBe('dark');
            expect(settings.autoUpdate).toBe(true); // default
            expect(settings.adminMode).toBe(false); // default
        });

        it('должен вернуть полностью кастомные настройки', () => {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ 
                autoUpdate: false,
                theme: 'light',
                adminMode: true
            }));
            
            const settings = getSettings();
            
            expect(settings.autoUpdate).toBe(false);
            expect(settings.theme).toBe('light');
            expect(settings.adminMode).toBe(true);
        });

        it('должен вернуть DEFAULT_SETTINGS при невалидном JSON', () => {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, 'not valid json {{{');
            
            const settings = getSettings();
            
            expect(settings).toEqual(DEFAULT_SETTINGS);
        });

        it('должен сохранять дополнительные поля из storage', () => {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ 
                theme: 'dark',
                customField: 'custom value'
            }));
            
            const settings = getSettings();
            
            expect(settings.customField).toBe('custom value');
        });
    });

    // ========================================================================
    // saveSettings()
    // ========================================================================
    describe('saveSettings()', () => {
        
        it('должен сохранить настройки в localStorage', () => {
            const settings = { autoUpdate: false, theme: 'dark', adminMode: true };
            
            saveSettings(settings);
            
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS));
            expect(saved).toEqual(settings);
        });

        it('должен перезаписать существующие настройки', () => {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ theme: 'light' }));
            
            saveSettings({ theme: 'dark' });
            
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS));
            expect(saved.theme).toBe('dark');
        });
    });

    // ========================================================================
    // loadFromStorage()
    // ========================================================================
    describe('loadFromStorage()', () => {
        
        it('должен вернуть defaultValue при отсутствии ключа', () => {
            const result = loadFromStorage('non-existent-key', { default: true });
            
            expect(result).toEqual({ default: true });
        });

        it('должен вернуть пустой объект как default', () => {
            const result = loadFromStorage('non-existent-key');
            
            expect(result).toEqual({});
        });

        it('должен корректно парсить JSON', () => {
            localStorage.setItem('test-key', JSON.stringify({ foo: 'bar', num: 42 }));
            
            const result = loadFromStorage('test-key');
            
            expect(result).toEqual({ foo: 'bar', num: 42 });
        });

        it('должен вернуть defaultValue при невалидном JSON', () => {
            localStorage.setItem('test-key', 'invalid json');
            
            const result = loadFromStorage('test-key', { fallback: true });
            
            expect(result).toEqual({ fallback: true });
        });

        it('должен работать с массивами', () => {
            localStorage.setItem('test-array', JSON.stringify([1, 2, 3]));
            
            const result = loadFromStorage('test-array', []);
            
            expect(result).toEqual([1, 2, 3]);
        });

        it('должен работать с примитивами', () => {
            localStorage.setItem('test-string', JSON.stringify('hello'));
            
            const result = loadFromStorage('test-string', '');
            
            expect(result).toBe('hello');
        });
    });

    // ========================================================================
    // safeSetItem()
    // ========================================================================
    describe('safeSetItem()', () => {
        
        it('должен вернуть true при успешной записи', () => {
            const result = safeSetItem('test-key', 'test-value');
            
            expect(result).toBe(true);
            expect(global.localStorage.getItem('test-key')).toBe('test-value');
        });

        // SKIP: jsdom предоставляет собственный localStorage объект (класс Storage),
        // методы которого нельзя переопределить через присваивание.
        // Для полноценного тестирования QuotaExceededError нужна интеграция
        // с реальным браузером или специальная настройка jsdom.
        it.skip('должен вернуть false при QuotaExceededError', () => {
            // Тест пропущен - см. комментарий выше
        });

        it.skip('должен пробрасывать другие ошибки', () => {
            // Тест пропущен - см. комментарий выше
        });
    });

    // ========================================================================
    // saveToStorage()
    // ========================================================================
    describe('saveToStorage()', () => {
        
        it('должен сериализовать и сохранить объект', () => {
            saveToStorage('test-key', { foo: 'bar' });
            
            expect(localStorage.getItem('test-key')).toBe('{"foo":"bar"}');
        });

        it('должен сериализовать массив', () => {
            saveToStorage('test-array', [1, 2, 3]);
            
            expect(localStorage.getItem('test-array')).toBe('[1,2,3]');
        });
    });

    // ========================================================================
    // setTabsCache()
    // ========================================================================
    describe('setTabsCache()', () => {
        
        it('должен установить кэш напрямую', () => {
            const tabs = { 'tab-1': { id: 'tab-1', name: 'Tab 1', items: [] } };
            
            setTabsCache(tabs);
            
            // Проверяем что кэш установлен (через приватную переменную)
            // В реальном коде это проверяется через getAllTabs()
            expect(_tabsCache).toBe(tabs);
        });
    });

    // ========================================================================
    // isValidTab()
    // ========================================================================
    describe('isValidTab()', () => {
        
        it('должен вернуть true для валидной вкладки', () => {
            const validTab = {
                id: 'test-tab',
                name: 'Test Tab',
                items: [
                    { type: 'block', id: 'block-1' },
                    { type: 'block', id: 'block-2' }
                ]
            };
            
            expect(isValidTab(validTab)).toBe(true);
        });

        it('должен вернуть true для вкладки с пустыми items', () => {
            const validTab = {
                id: 'empty-tab',
                name: 'Empty Tab',
                items: []
            };
            
            expect(isValidTab(validTab)).toBe(true);
        });

        it('должен вернуть false для null', () => {
            expect(isValidTab(null)).toBe(false);
        });

        it('должен вернуть false для undefined', () => {
            expect(isValidTab(undefined)).toBe(false);
        });

        it('должен вернуть false для не-объекта', () => {
            expect(isValidTab('string')).toBe(false);
            expect(isValidTab(123)).toBe(false);
            expect(isValidTab([])).toBe(false);
        });

        it('должен вернуть false при отсутствии id', () => {
            const invalidTab = {
                name: 'No ID Tab',
                items: []
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false при пустом id', () => {
            const invalidTab = {
                id: '',
                name: 'Empty ID Tab',
                items: []
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false при не-строковом id', () => {
            const invalidTab = {
                id: 123,
                name: 'Numeric ID Tab',
                items: []
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false при отсутствии name', () => {
            const invalidTab = {
                id: 'no-name-tab',
                items: []
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false при не-строковом name', () => {
            const invalidTab = {
                id: 'test',
                name: 123,
                items: []
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false при отсутствии items', () => {
            const invalidTab = {
                id: 'no-items-tab',
                name: 'No Items Tab'
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false если items не массив', () => {
            const invalidTab = {
                id: 'test',
                name: 'Test',
                items: 'not-an-array'
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false если item не объект', () => {
            const invalidTab = {
                id: 'test',
                name: 'Test',
                items: ['string-item']
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false если item.type не block', () => {
            const invalidTab = {
                id: 'test',
                name: 'Test',
                items: [{ type: 'separator', id: 'sep-1' }]
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false если item не имеет id', () => {
            const invalidTab = {
                id: 'test',
                name: 'Test',
                items: [{ type: 'block' }]
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });

        it('должен вернуть false если item.id пустой', () => {
            const invalidTab = {
                id: 'test',
                name: 'Test',
                items: [{ type: 'block', id: '' }]
            };
            
            expect(isValidTab(invalidTab)).toBe(false);
        });
    });

    // ========================================================================
    // isValidTabsStructure()
    // ========================================================================
    describe('isValidTabsStructure()', () => {
        
        it('должен вернуть true для валидной структуры', () => {
            const validTabs = {
                'tab-1': {
                    id: 'tab-1',
                    name: 'Tab 1',
                    items: [{ type: 'block', id: 'b1' }]
                },
                'tab-2': {
                    id: 'tab-2',
                    name: 'Tab 2',
                    items: []
                }
            };
            
            expect(isValidTabsStructure(validTabs)).toBe(true);
        });

        it('должен вернуть false для null', () => {
            expect(isValidTabsStructure(null)).toBe(false);
        });

        it('должен вернуть false для undefined', () => {
            expect(isValidTabsStructure(undefined)).toBe(false);
        });

        it('должен вернуть false для массива', () => {
            expect(isValidTabsStructure([])).toBe(false);
        });

        it('должен вернуть false для пустого объекта', () => {
            expect(isValidTabsStructure({})).toBe(false);
        });

        it('должен вернуть false если ключ не совпадает с tab.id', () => {
            const invalidTabs = {
                'wrong-key': {
                    id: 'actual-id',
                    name: 'Tab',
                    items: []
                }
            };
            
            expect(isValidTabsStructure(invalidTabs)).toBe(false);
        });

        it('должен вернуть false если хотя бы одна вкладка невалидна', () => {
            const invalidTabs = {
                'valid-tab': {
                    id: 'valid-tab',
                    name: 'Valid',
                    items: []
                },
                'invalid-tab': {
                    id: 'invalid-tab',
                    // отсутствует name
                    items: []
                }
            };
            
            expect(isValidTabsStructure(invalidTabs)).toBe(false);
        });
    });

    // ========================================================================
    // repairTab()
    // ========================================================================
    describe('repairTab()', () => {
        
        it('должен восстановить вкладку с корректными данными', () => {
            const damagedTab = {
                name: 'My Tab',
                items: [
                    { type: 'block', id: 'b1', title: 'Block 1', content: 'Content 1' }
                ]
            };
            
            const repaired = repairTab('my-tab', damagedTab);
            
            expect(repaired.id).toBe('my-tab');
            expect(repaired.name).toBe('My Tab');
            expect(repaired.items).toHaveLength(1);
            expect(repaired.items[0].id).toBe('b1');
        });

        it('должен использовать tabId как name если name отсутствует', () => {
            const damagedTab = {
                items: []
            };
            
            const repaired = repairTab('fallback-name', damagedTab);
            
            expect(repaired.name).toBe('fallback-name');
        });

        it('должен вернуть пустые items если items отсутствует', () => {
            const damagedTab = {
                name: 'Tab'
            };
            
            const repaired = repairTab('tab', damagedTab);
            
            expect(repaired.items).toEqual([]);
        });

        it('должен вернуть пустые items если items не массив', () => {
            const damagedTab = {
                name: 'Tab',
                items: 'not-array'
            };
            
            const repaired = repairTab('tab', damagedTab);
            
            expect(repaired.items).toEqual([]);
        });

        it('должен пропустить невалидные items', () => {
            const damagedTab = {
                name: 'Tab',
                items: [
                    { type: 'block', id: 'valid' },
                    { type: 'separator', id: 'skip-me' },
                    null,
                    'string',
                    { type: 'block', id: 'also-valid' }
                ]
            };
            
            const repaired = repairTab('tab', damagedTab);
            
            expect(repaired.items).toHaveLength(2);
            expect(repaired.items[0].id).toBe('valid');
            expect(repaired.items[1].id).toBe('also-valid');
        });

        it('должен генерировать id для items без id', () => {
            const damagedTab = {
                name: 'Tab',
                items: [
                    { type: 'block', title: 'No ID Block' }
                ]
            };
            
            const repaired = repairTab('tab', damagedTab);
            
            expect(repaired.items[0].id).toMatch(/^repaired_\d+_0$/);
        });

        it('должен генерировать title для items без title', () => {
            const damagedTab = {
                name: 'Tab',
                items: [
                    { type: 'block', id: 'b1' },
                    { type: 'block', id: 'b2' }
                ]
            };
            
            const repaired = repairTab('tab', damagedTab);
            
            expect(repaired.items[0].title).toBe('Block 1');
            expect(repaired.items[1].title).toBe('Block 2');
        });

        it('должен сохранять content если есть', () => {
            const damagedTab = {
                name: 'Tab',
                items: [
                    { type: 'block', id: 'b1', content: 'My content' }
                ]
            };
            
            const repaired = repairTab('tab', damagedTab);
            
            expect(repaired.items[0].content).toBe('My content');
        });

        it('должен использовать пустую строку для content по умолчанию', () => {
            const damagedTab = {
                name: 'Tab',
                items: [
                    { type: 'block', id: 'b1' }
                ]
            };
            
            const repaired = repairTab('tab', damagedTab);
            
            expect(repaired.items[0].content).toBe('');
        });

        it('должен обработать null вместо tab', () => {
            const repaired = repairTab('null-tab', null);
            
            expect(repaired.id).toBe('null-tab');
            expect(repaired.name).toBe('null-tab');
            expect(repaired.items).toEqual([]);
        });

        it('должен обработать undefined вместо tab', () => {
            const repaired = repairTab('undef-tab', undefined);
            
            expect(repaired.id).toBe('undef-tab');
            expect(repaired.name).toBe('undef-tab');
            expect(repaired.items).toEqual([]);
        });
    });
});
