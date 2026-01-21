/**
 * AI Prompts Manager - Tabs Management
 * Функции управления вкладками
 */

// ═══════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ: TABS CRUD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Получить все items вкладки (блоки + разделители)
 * @param {string} tabId - ID вкладки
 * @returns {Array} Массив items
 */
function getTabItems(tabId) {
    const tabs = getAllTabs();
    const tab = tabs[tabId];
    return tab?.items || [];
}

/**
 * Получить только блоки вкладки (с номерами)
 * @param {string} tabId - ID вкладки
 * @returns {Array} Массив блоков с добавленным полем number
 */
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

/**
 * Создать новую вкладку
 * @param {string} name - Название вкладки
 * @returns {string} ID созданной вкладки
 */
function createNewTab(name) {
    const tabs = getAllTabs();
    const id = generateTabId();
    const maxOrder = Math.max(0, ...Object.values(tabs).map(t => t.order || 0));
    tabs[id] = {
        id,
        name,
        order: maxOrder + 1,
        items: []
    };
    saveAllTabs(tabs, true); // skipUndo - создание вкладки не записывается
    
    return id;
}

/**
 * Обновить данные вкладки
 * @param {string} id - ID вкладки
 * @param {Object} updates - Объект с обновлениями
 */
function updateTab(id, updates) {
    const tabs = getAllTabs();
    if (tabs[id]) {
        tabs[id] = { ...tabs[id], ...updates };
        saveAllTabs(tabs, true); // skipUndo - переименование вкладки не записывается
    }
}

/**
 * Переименовать вкладку (меняет и name, и id)
 * @param {string} oldId - Текущий ID вкладки
 * @param {string} newName - Новое название
 */
function renameTab(oldId, newName) {
    const tabs = getAllTabs();
    if (!tabs[oldId]) return;
    
    // Генерируем новый ID из названия
    const newId = newName.toLowerCase()
        .replace(/[^a-zа-яё0-9\s-]/gi, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'tab';
    
    // Если ID не изменился — просто обновляем name
    if (newId === oldId) {
        tabs[oldId].name = newName;
        saveAllTabs(tabs, true);
        return;
    }
    
    // Проверяем что новый ID не занят
    let finalId = newId;
    let counter = 1;
    while (tabs[finalId] && finalId !== oldId) {
        finalId = `${newId}-${counter}`;
        counter++;
    }
    
    // Создаём новую запись с новым ID
    const tabData = { ...tabs[oldId], name: newName };
    tabs[finalId] = tabData;
    
    // Удаляем старую запись
    delete tabs[oldId];
    
    // Переносим workflow данные
    const oldWorkflow = localStorage.getItem(`workflow-${oldId}`);
    if (oldWorkflow) {
        localStorage.setItem(`workflow-${finalId}`, oldWorkflow);
        localStorage.removeItem(`workflow-${oldId}`);
    }
    
    // Переносим историю undo/redo
    if (typeof tabHistories !== 'undefined' && tabHistories[oldId]) {
        tabHistories[finalId] = tabHistories[oldId];
        delete tabHistories[oldId];
    }
    
    // Обновляем currentTab если это текущая вкладка
    if (typeof currentTab !== 'undefined' && currentTab === oldId) {
        currentTab = finalId;
        if (window.AppState?.app) {
            window.AppState.app.currentTab = finalId;
        }
    }
    
    // Обновляем project owner если это вкладка-владелец проекта
    if (window.AppState?.claude?.project?.ownerTab === oldId) {
        window.AppState.claude.project.ownerTab = finalId;
        localStorage.setItem('active-project', JSON.stringify(window.AppState.claude.project));
    }
    
    saveAllTabs(tabs, true);
    
    // Перерендериваем UI
    if (typeof renderTabMenu === 'function') {
        renderTabMenu();
    }
    if (typeof updateTabSelectorUI === 'function') {
        updateTabSelectorUI();
    }
}

/**
 * Удалить вкладку
 * @param {string} id - ID вкладки
 * @returns {boolean} Успешность удаления
 */
function deleteTab(id) {
    const tabs = getAllTabs();
    
    // Нельзя удалить последнюю вкладку
    if (Object.keys(tabs).length <= 1) {
        showAlert('Нельзя удалить последнюю вкладку');
        return false;
    }
    
    // Очищаем связанные данные перед удалением
    const tabItems = tabs[id]?.items || [];
    tabItems.forEach(item => {
        if (item.type === 'block' && item.id) {
            // Очищаем скрипты блоков
            if (typeof blockScripts !== 'undefined' && blockScripts[item.id]) {
                delete blockScripts[item.id];
            }
            // Очищаем состояние свёрнутых блоков
            if (typeof collapsedBlocks !== 'undefined' && collapsedBlocks[item.id]) {
                delete collapsedBlocks[item.id];
            }
            // Очищаем прикреплённые файлы
            if (typeof blockAttachments !== 'undefined' && blockAttachments[item.id]) {
                delete blockAttachments[item.id];
            }
        }
    });
    
    // Очищаем историю undo/redo для этой вкладки
    if (typeof tabHistories !== 'undefined' && tabHistories[id]) {
        delete tabHistories[id];
    }
    
    // Удаляем workflow данные
    localStorage.removeItem(`workflow-${id}`);
    
    delete tabs[id];
    saveAllTabs(tabs, true); // skipUndo - удаление вкладки не записывается
    // Удаляем данные контента вкладки
    localStorage.removeItem(`ai-prompts-manager-${id}`);
    localStorage.removeItem(`ai-prompts-manager-data-${id}`);
    
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ: BLOCKS CRUD (в контексте вкладок)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Добавить блок в вкладку
 * @param {string} tabId - ID вкладки
 * @returns {string|undefined} ID нового блока
 */
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
    saveAllTabs(tabs);
    
    return newBlock.id;
}

/**
 * Удалить item из вкладки по ID
 * @param {string} tabId - ID вкладки
 * @param {string} itemId - ID элемента
 */
function removeItemFromTab(tabId, itemId) {
    const tabs = getAllTabs();
    if (!tabs[tabId] || !tabs[tabId].items) return;
    
    const items = tabs[tabId].items;
    
    // autoSaveToUndo() вызывается в вызывающем коде
    tabs[tabId].items = items.filter(i => i.id !== itemId);
    saveAllTabs(tabs);
}

/**
 * Удалить блок из вкладки по номеру
 * @param {string} tabId - ID вкладки
 * @param {string} blockNumber - Номер блока
 */
function removeBlockFromTab(tabId, blockNumber) {
    // Находим блок по номеру
    const blocks = getTabBlocks(tabId);
    const block = blocks.find(b => b.number === blockNumber);
    if (block) {
        removeItemFromTab(tabId, block.id);
    }
}

/**
 * Обновить заголовок блока
 * @param {string} tabId - ID вкладки
 * @param {string} blockNumber - Номер блока
 * @param {string} newTitle - Новый заголовок
 */
function updateBlockTitle(tabId, blockNumber, newTitle) {
    const tabs = getAllTabs();
    if (!tabs[tabId] || !tabs[tabId].items) return;
    
    // Находим блок по номеру
    const blocks = getTabBlocks(tabId);
    const block = blocks.find(b => b.number === blockNumber);
    if (!block) return;
    
    // Обновляем в items
    const item = tabs[tabId].items.find(i => i.id === block.id);
    if (item) {
        item.title = newTitle;
        saveAllTabs(tabs);
    }
}

/**
 * Обновить инструкцию блока
 * @param {string} tabId - ID вкладки
 * @param {string} blockNumber - Номер блока
 * @param {string} instruction - Инструкция
 */
function updateBlockInstruction(tabId, blockNumber, instruction) {
    const tabs = getAllTabs();
    if (!tabs[tabId] || !tabs[tabId].items) return;
    
    const blocks = getTabBlocks(tabId);
    const block = blocks.find(b => b.number === blockNumber);
    if (!block) return;
    
    const item = tabs[tabId].items.find(i => i.id === block.id);
    if (item) {
        item.instruction = instruction;
        saveAllTabs(tabs);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ: TAB MODALS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показать модалку добавления вкладки
 */
function showAddTabModal() {
    closeAllModals();
    const modal = document.getElementById('add-tab-modal');
    const input = document.getElementById('new-tab-name');
    const errorEl = document.getElementById('add-tab-error');
    if (input) input.value = '';
    errorEl?.classList.add('hidden');
    modal?.classList.add('open');
    setTimeout(() => input?.focus(), 100);
}

/** Скрыть модалку добавления вкладки */
const hideAddTabModal = () => hideModal('add-tab-modal');
