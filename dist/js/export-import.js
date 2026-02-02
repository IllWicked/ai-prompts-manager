/**
 * AI Prompts Manager - Export/Import
 * Функции экспорта и импорта конфигурации вкладок
 * 
 * @requires storage.js (getAllTabs, saveAllTabs, loadFromLocalStorage)
 * @requires tabs.js (getTabBlocks, switchToTab)
 * @requires blocks.js (getBlockScripts, isBlockCollapsed, getBlockAutomationFlags, 
 *                      hasBlockScript, toggleBlockScript, collapsedBlocks, blockAutomation,
 *                      saveCollapsedBlocks, saveBlockAutomation)
 * @requires attachments.js (hasBlockAttachmentsPanel)
 * @requires modals.js (showImportConfirm)
 * @requires toast.js (showToast)
 * @requires config.js (DEFAULT_TAB, STORAGE_KEYS)
 */

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Экспорт текущей вкладки в JSON файл
 * Использует Tauri dialog для выбора пути сохранения, с fallback на browser download
 */
async function exportConfig() {
    const tabs = getAllTabs();
    const currentTabData = tabs[currentTab];
    
    if (!currentTabData) {
        return;
    }
    
    // Подтягиваем контент из localStorage для каждого блока
    const savedContent = loadFromLocalStorage();
    const blocks = getTabBlocks(currentTab);
    
    // Создаём копию данных вкладки с актуальным контентом
    const exportTabData = JSON.parse(JSON.stringify(currentTabData));
    
    // Обновляем content в items на основе сохранённого контента
    let blockIndex = 0;
    exportTabData.items = exportTabData.items.map(item => {
        if (item.type === 'block') {
            blockIndex++;
            const blockNumber = String(blockIndex);
            // Сначала пробуем по ID, потом по номеру (обратная совместимость)
            const content = savedContent[item.id] !== undefined ? savedContent[item.id] : savedContent[blockNumber];
            // Получаем прикреплённые скрипты
            const scripts = getBlockScripts(item.id);
            // Получаем состояние свёрнутости
            const collapsed = isBlockCollapsed(item.id);
            // Получаем automation флаги
            const automation = getBlockAutomationFlags(item.id);
            // Получаем hasAttachments
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
    
    const config = {
        version: 2,
        exportDate: new Date().toISOString(),
        tab: exportTabData,
        workflow: {
            positions: workflowPositions,
            sizes: workflowSizes,
            connections: workflowConnections
        }
    };
    
    const jsonContent = JSON.stringify(config, null, 2);
    const safeName = currentTabData.name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ]/g, '-').toLowerCase();
    const defaultFileName = `${safeName}-${new Date().toISOString().split('T')[0]}.json`;
    
    // Проверяем, есть ли Tauri API для диалога сохранения
    if (window.__TAURI__ && window.__TAURI__.dialog) {
        try {
            const filePath = await window.__TAURI__.dialog.save({
                defaultPath: defaultFileName,
                filters: [{
                    name: 'JSON',
                    extensions: ['json']
                }]
            });
            
            if (filePath) {
                // Записываем файл через Tauri fs plugin (v2 API)
                try {
                    if (window.__TAURI__.fs && window.__TAURI__.fs.writeTextFile) {
                        await window.__TAURI__.fs.writeTextFile(filePath, jsonContent);
                    } else {
                        // Альтернативный способ через core.invoke
                        await window.__TAURI__.core.invoke('plugin:fs|write_text_file', {
                            path: filePath,
                            contents: jsonContent
                        });
                    }
                    showToast('Конфигурация сохранена!');
                } catch (writeError) {
                    showToast('Ошибка записи файла');
                }
            }
        } catch (e) {
            // Fallback на обычное скачивание если dialog не работает
            downloadFile(jsonContent, defaultFileName);
            showToast('Файл скачан в папку загрузок');
        }
    } else {
        // Fallback для браузера
        downloadFile(jsonContent, defaultFileName);
    }
}

/**
 * Скачивание файла через браузер (fallback)
 * @param {string} content - содержимое файла
 * @param {string} fileName - имя файла
 */
function downloadFile(content, fileName) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════
// ИМПОРТ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Открыть диалог выбора файла для импорта
 */
async function importConfig() {
    const input = document.getElementById('import-file-input');
    input.click();
}

/**
 * Обработчик выбора файлов для импорта
 * @param {Event} event - событие change от input[type=file]
 */
async function handleImportFile(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    let importedCount = 0;
    let lastTabId = null;
    const tabs = getAllTabs();
    const conflicts = [];
    
    // Собираем все вкладки из всех файлов
    const allImportedTabs = {};
    const allImportedWorkflows = {}; // tabId -> workflow data
    
    for (const file of files) {
        try {
            const text = await file.text();
            const config = JSON.parse(text);
            
            if (config.tab) {
                const tabId = config.tab.id || `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                config.tab.id = tabId;
                allImportedTabs[tabId] = config.tab;
                if (tabs[tabId]) {
                    conflicts.push(tabs[tabId].name);
                }
                // Сохраняем workflow state если есть (версия 2+)
                if (config.workflow) {
                    allImportedWorkflows[tabId] = config.workflow;
                }
            } else if (config.tabs) {
                Object.entries(config.tabs).forEach(([id, tab]) => {
                    allImportedTabs[id] = tab;
                    if (tabs[id]) {
                        conflicts.push(tabs[id].name);
                    }
                });
            }
        } catch (e) {
            // Ошибка парсинга файла - пропускаем
        }
    }
    
    if (Object.keys(allImportedTabs).length === 0) {
        showToast('Не найдено вкладок для импорта');
        event.target.value = '';
        return;
    }
    
    // Если есть конфликты - спрашиваем
    if (conflicts.length > 0) {
        const uniqueConflicts = [...new Set(conflicts)];
        const choice = await showImportConfirm(`Следующие вкладки будут перезаписаны: ${uniqueConflicts.join(', ')}`);
        if (!choice) {
            event.target.value = '';
            return;
        }
    }
    
    // Сливаем вкладки
    const mergedTabs = { ...tabs, ...allImportedTabs };
    saveAllTabs(mergedTabs, true); // skipUndo - импорт не записывается
    
    // Извлекаем scripts, collapsed и automation из импортированных блоков
    Object.values(allImportedTabs).forEach(tab => {
        if (tab.items) {
            tab.items.forEach(item => {
                if (item.type === 'block') {
                    // Импорт scripts
                    if (item.scripts && item.scripts.length > 0) {
                        item.scripts.forEach(scriptKey => {
                            if (!hasBlockScript(item.id, scriptKey)) {
                                toggleBlockScript(item.id, scriptKey);
                            }
                        });
                    }
                    // Импорт collapsed
                    if (item.collapsed) {
                        collapsedBlocks[item.id] = true;
                    }
                    // Импорт automation
                    if (item.automation && Object.keys(item.automation).length > 0) {
                        blockAutomation[item.id] = { ...item.automation };
                    }
                }
            });
        }
    });
    saveCollapsedBlocks();
    saveBlockAutomation();
    
    // Применяем workflow state для всех импортированных вкладок
    Object.entries(allImportedWorkflows).forEach(([tabId, workflow]) => {
        const workflowData = {
            positions: workflow.positions || {},
            sizes: workflow.sizes || {},
            connections: workflow.connections || []
        };
        localStorage.setItem(STORAGE_KEYS.workflow(tabId), JSON.stringify(workflowData));
    });
    
    // Переключаемся на первую импортированную
    const firstImported = Object.keys(allImportedTabs)[0];
    switchToTab(firstImported || DEFAULT_TAB);
    
    const count = Object.keys(allImportedTabs).length;
    showToast(`Импортировано вкладок: ${count}`);
    
    // Сбрасываем input
    event.target.value = '';
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.exportConfig = exportConfig;
window.downloadFile = downloadFile;
window.importConfig = importConfig;
window.handleImportFile = handleImportFile;
