/**
 * AI Prompts Manager - Initialization Module
 * Главный модуль инициализации приложения
 * 
 * @requires Все остальные модули должны быть загружены до init.js
 */

// ═══════════════════════════════════════════════════════════════════════════
// AUTOCOMPLETE DISABLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Глобально отключает autocomplete для всех input и textarea
 */
function initAutocompleteDisable() {
    document.querySelectorAll('input, textarea').forEach(el => {
        el.setAttribute('autocomplete', 'off');
    });
    
    // Для динамически создаваемых элементов
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
                        node.setAttribute('autocomplete', 'off');
                    }
                    node.querySelectorAll?.('input, textarea').forEach(el => {
                        el.setAttribute('autocomplete', 'off');
                    });
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEXT SELECTION PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Глобальная защита от закрытия модалок/dropdown/inline-элементов
 * при выделении текста с уводом курсора за пределы поля.
 * 
 * Проблема: mousedown на textarea → drag за пределы → mouseup на оверлее →
 * браузер генерирует click на общем предке (оверлей) → обработчик закрывает модалку.
 * 
 * Решение: capture-фаза перехватывает click/mousedown и блокирует их,
 * если mousedown начался на текстовом поле, а событие пришло на другой элемент.
 */
function initTextSelectionProtection() {
    // Элемент, на котором начался mousedown
    let mousedownTarget = null;
    // Флаг: mousedown был на текстовом поле
    let mousedownOnText = false;
    
    const TEXT_SELECTOR = 'textarea, input[type="text"], input[type="search"], input[type="number"], input[type="url"], input[type="email"], input[type="password"], input:not([type]), [contenteditable="true"]';
    
    // 1. Отслеживаем mousedown — запоминаем откуда начали
    document.addEventListener('mousedown', (e) => {
        const target = e.target;
        const isTextElement = target.matches?.(TEXT_SELECTOR) || 
                              target.closest?.(TEXT_SELECTOR);
        
        mousedownTarget = target;
        mousedownOnText = !!isTextElement;
        
        if (mousedownOnText) {
            window.isTextSelecting = true;
        }
    }, true);
    
    // 2. На mouseup сбрасываем флаг с задержкой (после click)
    document.addEventListener('mouseup', () => {
        setTimeout(() => {
            mousedownTarget = null;
            mousedownOnText = false;
            window.isTextSelecting = false;
        }, 50);
    }, true);
    
    // 3. CAPTURE-фаза click — блокируем если это результат drag из текстового поля
    document.addEventListener('click', (e) => {
        if (!mousedownOnText) return;
        
        // Если click target совпадает с mousedown target — это обычный клик, пропускаем
        if (e.target === mousedownTarget) return;
        
        // Если click внутри того же текстового поля (дочерний элемент) — пропускаем
        if (mousedownTarget?.contains?.(e.target) || e.target?.contains?.(mousedownTarget)) return;
        
        // mousedown был на текстовом поле, а click пришёл на другой элемент —
        // это drag-release при выделении текста. Блокируем.
        e.stopImmediatePropagation();
        e.preventDefault();
    }, true);
    
    // 4. CAPTURE-фаза mousedown на оверлеях — дополнительная защита
    //    Некоторые модалки закрываются по mousedown на оверлее.
    //    Если mousedown начался на тексте и всплыл до оверлея — блокируем.
    //    (Не нужно — mousedown на оверлее имеет e.target === оверлей,
    //    а mousedown на textarea имеет e.target === textarea,
    //    поэтому проверки e.target.id === modalId уже защищают.
    //    Оставляем только click-protection выше.)
}

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOAD LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

let downloadListenersRegistered = false;
let downloadListenersRetryCount = 0;
const MAX_DOWNLOAD_LISTENER_RETRIES = 50; // 50 * 50ms = 2.5 сек максимум

/**
 * Настройка слушателей событий загрузки файлов из Claude
 */
function setupDownloadListeners() {
    if (downloadListenersRegistered) return;
    if (!window.__TAURI__?.event?.listen) {
        downloadListenersRetryCount++;
        if (downloadListenersRetryCount < MAX_DOWNLOAD_LISTENER_RETRIES) {
            setTimeout(setupDownloadListeners, 50);
        }
        return;
    }
    downloadListenersRegistered = true;
    
    window.__TAURI__.event.listen('download-started', (event) => {
        showToast(`⬇️ Загрузка: ${event.payload}`, 2000);
    });
    
    window.__TAURI__.event.listen('download-finished', async (event) => {
        const { filename, tab, url, file_path } = event.payload;
        showToast(`✅ Скачан: ${filename}`, 3000);
        
        // Извлекаем префикс из названия текущей вкладки
        const tabs = getAllTabs();
        const currentTabData = tabs[currentTab];
        const tabName = currentTabData?.name || '';
        
        const dashIndex = tabName.indexOf('-');
        const prefix = dashIndex > 0 ? tabName.slice(0, dashIndex) : tabName;
        
        // Автозавершение проекта при скачивании финального архива
        try {
            if (isCurrentTabProjectOwner() && 
                filename.toLowerCase().endsWith('.zip') && 
                prefix && filename.startsWith(prefix)) {
                await finishProject();
            }
        } catch (e) {
            console.error('Auto-finish project error:', e);
        }
        
        // Если файл не начинается с префикса — не логируем в archive log
        if (!prefix || !filename.startsWith(prefix)) return;
        
        try {
            await window.__TAURI__.core.invoke('add_archive_log_entry', {
                tab: tab,
                filename: filename,
                claudeUrl: url
            });
        } catch (e) {
            // Ignore
        }
    });
    
    window.__TAURI__.event.listen('download-failed', (event) => {
        showToast(`❌ Ошибка загрузки: ${event.payload}`, 3000);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE MENU
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT MENU HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Настройка глобального обработчика контекстного меню
 */
function initContextMenuHandlers() {
    // Глобальный обработчик ПКМ
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        hideContextMenu();
        
        const target = e.target;
        
        // 1. ПКМ на холсте (пустое место) в edit mode
        const workflowCanvas = target.closest('#workflow-canvas');
        const isOnNode = target.closest('.workflow-node');
        
        if (workflowMode && isEditMode && workflowCanvas && !isOnNode) {
            showCanvasContextMenu(e);
            return;
        }
        
        // 2. ПКМ на заголовке блока в edit mode
        const nodeHeader = target.closest('.workflow-node-header');
        const node = target.closest('.workflow-node');
        
        if (workflowMode && isEditMode && nodeHeader && node) {
            showNodeContextMenu(e, node);
            return;
        }
        
        // 3. ПКМ на textarea блока в edit mode
        const nodeTextarea = target.closest('.workflow-node-textarea');
        const workflowEditModal = target.closest('#workflow-edit-modal');
        const editableField = nodeTextarea || (target.closest('textarea') || target.closest('input[type="text"]'));
        
        if (workflowMode && isEditMode && editableField && (nodeTextarea || workflowEditModal)) {
            showTextContextMenu(e, editableField);
            return;
        }
    });
    
    // Скрываем контекстное меню при клике
    document.addEventListener('click', () => hideContextMenu());
    document.addEventListener('scroll', () => hideContextMenu(), true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideContextMenu();
    });
}

/**
 * Контекстное меню для пустого холста
 */
function showCanvasContextMenu(e) {
    showContextMenu(e.clientX, e.clientY, [
        {
            label: 'Создать блок',
            icon: CONTEXT_ICONS.create,
            action: () => createBlockAtPosition(e)
        },
        {
            label: 'Вставить',
            icon: CONTEXT_ICONS.paste,
            disabled: clipboard.length === 0,
            action: () => pasteBlocksAtPosition(e)
        }
    ]);
}

/**
 * Контекстное меню для ноды
 */
function showNodeContextMenu(e, node) {
    const blockId = node.dataset.blockId;
    const index = parseInt(node.dataset.index);
    
    // Если несколько блоков выделено
    if (selectedNodes.size > 1 && selectedNodes.has(blockId)) {
        showContextMenu(e.clientX, e.clientY, [
            {
                label: `Копировать (${selectedNodes.size})`,
                icon: CONTEXT_ICONS.copy,
                action: () => copyBlocksToClipboard([...selectedNodes])
            }
        ]);
    } else {
        // Один блок - выделяем если не выделен
        if (!selectedNodes.has(blockId)) {
            clearNodeSelection();
            node.classList.add('selected');
            selectedNodes.add(blockId);
        }
        
        showContextMenu(e.clientX, e.clientY, [
            {
                label: 'Переименовать',
                icon: CONTEXT_ICONS.rename,
                action: () => renameBlockInline(blockId)
            },
            {
                label: 'Копировать',
                icon: CONTEXT_ICONS.copy,
                action: () => copyBlocksToClipboard([blockId])
            },
            {
                label: 'Скрипт',
                icon: CONTEXT_ICONS.script,
                submenu: Object.entries(EMBEDDED_SCRIPTS).map(([key, script]) => ({
                    label: script.label,
                    checked: hasBlockScript(blockId, key),
                    action: () => toggleBlockScript(blockId, key)
                }))
            },
            {
                label: 'Автоматизация',
                icon: CONTEXT_ICONS.automation,
                submenu: [
                    {
                        label: 'Новый проект',
                        checked: hasBlockAutomation(blockId, 'newProject'),
                        action: () => toggleBlockAutomation(blockId, 'newProject')
                    },
                    {
                        label: 'Новый чат',
                        checked: hasBlockAutomation(blockId, 'newChat'),
                        action: () => toggleBlockAutomation(blockId, 'newChat')
                    }
                ]
            },
            {
                label: 'Файлы',
                icon: CONTEXT_ICONS.attachment,
                checked: hasBlockAttachmentsPanel(blockId),
                action: () => toggleAttachmentsPanel(blockId, !hasBlockAttachmentsPanel(blockId))
            },
            {
                label: 'Редактировать',
                icon: CONTEXT_ICONS.edit,
                action: () => editWorkflowNode(index)
            },
            { separator: true },
            {
                label: 'Удалить',
                icon: CONTEXT_ICONS.delete,
                action: () => deleteWorkflowBlock(index)
            }
        ]);
    }
}

/**
 * Контекстное меню для текстового поля
 */
function showTextContextMenu(e, editableField) {
    const selectedText = editableField.value.substring(
        editableField.selectionStart, 
        editableField.selectionEnd
    );
    
    showContextMenu(e.clientX, e.clientY, [
        {
            label: 'Копировать',
            icon: CONTEXT_ICONS.copy,
            disabled: !selectedText,
            action: () => selectedText && copyTextToClipboard(selectedText)
        },
        {
            label: 'Вставить',
            icon: CONTEXT_ICONS.paste,
            action: () => pasteTextFromClipboard(editableField)
        }
    ]);
}

/**
 * Создать блок в позиции клика
 */
function createBlockAtPosition(e) {
    const container = getWorkflowContainer();
    const scale = workflowZoom || 1;
    
    const containerRect = container.getBoundingClientRect();
    const clickX = (e.clientX - containerRect.left + container.scrollLeft) / scale;
    const clickY = (e.clientY - containerRect.top + container.scrollTop) / scale;
    
    const gridSize = 40;
    const newX = Math.round(clickX / gridSize) * gridSize;
    const newY = Math.round(clickY / gridSize) * gridSize;
    
    const newId = generateItemId();
    const blocks = getTabBlocks(currentTab);
    const newNumber = blocks.length > 0 ? Math.max(...blocks.map(b => b.number)) + 1 : 1;
    
    const tabs = getAllTabs();
    if (tabs[currentTab]) {
        tabs[currentTab].items.push({
            id: newId,
            type: 'block',
            title: `Блок ${newNumber}`,
            content: ''
        });
        saveAllTabs(tabs);
    }
    
    workflowPositions[newId] = { x: newX, y: newY };
    renderWorkflow(true);
    saveWorkflowState(true);
}

/**
 * Вставить блоки в позицию клика
 */
function pasteBlocksAtPosition(e) {
    if (clipboard.length === 0) return;
    
    const container = getWorkflowContainer();
    const scale = workflowZoom || 1;
    
    const containerRect = container.getBoundingClientRect();
    const baseX = Math.round(((e.clientX - containerRect.left + container.scrollLeft) / scale) / 40) * 40;
    const baseY = Math.round(((e.clientY - containerRect.top + container.scrollTop) / scale) / 40) * 40;
    
    pasteBlocksAtCoords(baseX, baseY);
}

/**
 * Вставить блоки по координатам
 */
function pasteBlocksAtCoords(baseX, baseY) {
    clearNodeSelection();
    
    const tabs = getAllTabs();
    const newBlockIds = [];
    const idMapping = {};
    
    clipboard.forEach(item => {
        const newId = generateItemId();
        if (item.origId) {
            idMapping[item.origId] = newId;
        }
        
        if (tabs[currentTab]) {
            const newBlock = {
                id: newId,
                type: 'block',
                title: item.title,
                content: item.content,
                instruction: item.instruction
            };
            if (item.hasAttachments) newBlock.hasAttachments = true;
            tabs[currentTab].items.push(newBlock);
        }
        
        // Записываем в отдельные хранилища
        if (item.collapsed) {
            collapsedBlocks[newId] = true;
        }
        if (item.scripts && item.scripts.length > 0) {
            item.scripts.forEach(scriptKey => {
                toggleBlockScript(newId, scriptKey);
            });
        }
        if (item.automation && Object.keys(item.automation).length > 0) {
            blockAutomation[newId] = {...item.automation};
        }
        
        workflowPositions[newId] = {
            x: baseX + item.relX,
            y: baseY + item.relY
        };
        
        if (item.width || item.height) {
            workflowSizes[newId] = {
                width: item.width,
                height: item.height
            };
        }
        
        newBlockIds.push(newId);
    });
    
    // Сохраняем хранилища
    saveCollapsedBlocks();
    saveBlockScripts();
    saveBlockAutomation();
    
    // Вставляем соединения с новыми ID
    if (window.clipboardConnections && window.clipboardConnections.length > 0) {
        window.clipboardConnections.forEach(conn => {
            const newFrom = idMapping[conn.from];
            const newTo = idMapping[conn.to];
            if (newFrom && newTo) {
                workflowConnections.push({
                    from: newFrom,
                    to: newTo,
                    fromSide: conn.fromSide,
                    toSide: conn.toSide
                });
            }
        });
    }
    
    saveWorkflowState(true);
    saveAllTabs(tabs);
    renderWorkflow(true);
    
    newBlockIds.forEach(id => {
        selectedNodes.add(id);
        const node = document.querySelector(`.workflow-node[data-block-id="${id}"]`);
        node?.classList.add('selected');
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Настройка глобальных горячих клавиш
 */
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // F5 - обновить страницу
        if (e.key === 'F5') {
            e.preventDefault();
            location.reload();
            return;
        }
        
        const activeElement = document.activeElement;
        const isInInput = activeElement && 
            (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
        
        // Ctrl+Z / Ctrl+Y - undo/redo (не в input)
        if (!isInInput && e.ctrlKey) {
            if (e.code === 'KeyZ') {
                e.preventDefault();
                undo();
                return;
            }
            if (e.code === 'KeyY') {
                e.preventDefault();
                redo();
                return;
            }
        }
        
        // Workflow shortcuts
        if (workflowMode && isEditMode && !isInInput) {
            handleWorkflowShortcuts(e);
        }
    });
}

/**
 * Обработка горячих клавиш workflow
 */
function handleWorkflowShortcuts(e) {
    // Del/Backspace - удалить выделенные блоки
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodes.size > 0) {
        e.preventDefault();
        deleteSelectedNodes();
        return;
    }
    
    // Escape - снять выделение
    if (e.key === 'Escape' && selectedNodes.size > 0) {
        e.preventDefault();
        clearNodeSelection();
        return;
    }
    
    // Ctrl+A - выделить все
    if (e.ctrlKey && e.code === 'KeyA') {
        e.preventDefault();
        selectAllNodes();
        return;
    }
    
    // Ctrl+C - копировать
    if (e.ctrlKey && e.code === 'KeyC' && selectedNodes.size > 0) {
        e.preventDefault();
        copyBlocksToClipboard([...selectedNodes]);
        return;
    }
    
    // Ctrl+V - вставить
    if (e.ctrlKey && e.code === 'KeyV' && clipboard.length > 0) {
        e.preventDefault();
        pasteBlocksWithOffset();
        return;
    }
    
    // Стрелки - двигать блоки
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedNodes.size > 0) {
        e.preventDefault();
        moveSelectedNodes(e.key);
        return;
    }
}

/**
 * Удалить выделенные ноды
 */
function deleteSelectedNodes() {
    selectedNodes.forEach(blockId => {
        // Удаляем связи
        workflowConnections = workflowConnections.filter(
            c => c.from !== blockId && c.to !== blockId
        );
        // Удаляем позицию и размер
        delete workflowPositions[blockId];
        delete workflowSizes[blockId];
        // removeItemFromTab очищает: collapsedBlocks, blockScripts, blockAutomation, blockAttachments, field-values
        removeItemFromTab(currentTab, blockId);
    });
    
    selectedNodes.clear();
    renderWorkflow(true);
    saveWorkflowState(true);
}

/**
 * Выделить все ноды
 */
function selectAllNodes() {
    selectedNodes.clear();
    document.querySelectorAll('.workflow-node').forEach(node => {
        node.classList.add('selected');
        const blockId = node.dataset.blockId;
        if (blockId) selectedNodes.add(blockId);
    });
}

/**
 * Вставить блоки со смещением
 */
function pasteBlocksWithOffset() {
    // Находим базовую точку группы
    let minOrigX = Infinity, minOrigY = Infinity;
    clipboard.forEach(item => {
        if (item.origX !== undefined) minOrigX = Math.min(minOrigX, item.origX);
        if (item.origY !== undefined) minOrigY = Math.min(minOrigY, item.origY);
    });
    
    if (minOrigX === Infinity) minOrigX = 120;
    if (minOrigY === Infinity) minOrigY = 80;
    
    const offsetX = 80;
    const offsetY = 80;
    const baseX = minOrigX + offsetX;
    const baseY = minOrigY + offsetY;
    
    pasteBlocksAtCoords(baseX, baseY);
}

/**
 * Переместить выделенные ноды стрелками
 */
function moveSelectedNodes(key) {
    const gridSize = 40;
    
    selectedNodes.forEach(blockId => {
        const pos = workflowPositions[blockId];
        if (pos) {
            switch (key) {
                case 'ArrowUp': pos.y = Math.max(gridSize, pos.y - gridSize); break;
                case 'ArrowDown': pos.y += gridSize; break;
                case 'ArrowLeft': pos.x = Math.max(0, pos.x - gridSize); break;
                case 'ArrowRight': pos.x += gridSize; break;
            }
            const node = document.querySelector(`.workflow-node[data-block-id="${blockId}"]`);
            if (node) {
                node.style.left = pos.x + 'px';
                node.style.top = pos.y + 'px';
            }
        }
    });
    
    renderConnections();
    saveWorkflowState();
}

// ═══════════════════════════════════════════════════════════════════════════
// ADD BLOCK BUTTON
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Обработчик кнопки добавления блока
 */
function initAddBlockButton() {
    const addBlockBtn = document.getElementById('add-block-btn');
    if (!addBlockBtn) return;
    
    addBlockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const newId = generateItemId();
        const blocks = getTabBlocks(currentTab);
        const newNumber = blocks.length > 0 ? Math.max(...blocks.map(b => b.number)) + 1 : 1;
        
        // Находим позицию для нового блока
        let newX = 40, newY = 40;
        if (blocks.length > 0) {
            const position = findNewBlockPosition(blocks);
            newX = position.x;
            newY = position.y;
        }
        
        // Добавляем в данные
        const tabs = getAllTabs();
        if (tabs[currentTab]) {
            tabs[currentTab].items.push({
                id: newId,
                type: 'block',
                title: `Блок ${newNumber}`,
                content: ''
            });
            saveAllTabs(tabs);
        }
        
        workflowPositions[newId] = { x: newX, y: newY };
        renderWorkflow(true);
        saveWorkflowState(true);
    });
}

/**
 * Найти позицию для нового блока
 */
function findNewBlockPosition(blocks) {
    let minY = Infinity;
    let maxXAtMinY = 0;
    let widthAtMaxX = 700;
    
    blocks.forEach(block => {
        const pos = workflowPositions[block.id];
        const size = workflowSizes[block.id];
        if (pos) {
            if (pos.y < minY) {
                minY = pos.y;
                maxXAtMinY = pos.x;
                widthAtMaxX = size?.width || 700;
            } else if (pos.y === minY && pos.x > maxXAtMinY) {
                maxXAtMinY = pos.x;
                widthAtMaxX = size?.width || 700;
            }
        }
    });
    
    let newX = maxXAtMinY + widthAtMaxX + 80;
    let newY = minY;
    
    // Если уходит за пределы, новый ряд
    if (newX > 4000) {
        newX = 40;
        let maxYBottom = 0;
        blocks.forEach(block => {
            const pos = workflowPositions[block.id];
            const size = workflowSizes[block.id];
            if (pos) {
                const bottom = pos.y + (size?.height || 400);
                maxYBottom = Math.max(maxYBottom, bottom);
            }
        });
        newY = maxYBottom + 80;
    }
    
    return { x: newX, y: newY };
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Инициализация обработчиков настроек
 */
function initSettingsHandlers() {
    // Кнопка настроек
    document.getElementById('settings-btn')?.addEventListener('click', showSettingsModal);
    
    // Автообновления
    document.getElementById('auto-update-off')?.addEventListener('click', () => {
        toggleAutoUpdate(false);
        updateAutoUpdateButtons(false);
    });
    document.getElementById('auto-update-on')?.addEventListener('click', () => {
        toggleAutoUpdate(true);
        updateAutoUpdateButtons(true);
    });
    
    // Ручная проверка обновлений
    document.getElementById('manual-update-check-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('manual-update-check-btn');
        btn.classList.add('checking');
        try {
            await checkForUpdates(true);
        } finally {
            btn.classList.remove('checking');
        }
    });
    
    document.getElementById('manual-prompts-check-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('manual-prompts-check-btn');
        btn.classList.add('checking');
        try {
            await checkForPromptsUpdate(true);
        } finally {
            btn.classList.remove('checking');
        }
    });
    
    // Темы
    document.getElementById('theme-light')?.addEventListener('click', () => setTheme('light'));
    document.getElementById('theme-auto')?.addEventListener('click', () => setTheme('auto'));
    document.getElementById('theme-dark')?.addEventListener('click', () => setTheme('dark'));
    
    // Импорт
    document.getElementById('import-file-input')?.addEventListener('change', handleImportFile);
    
    // Режим редактирования
    initEditModeHandlers();
    
    // Дополнительные настройки
    initAdvancedSettings();
}

/**
 * Обработчики режима редактирования
 */
function initEditModeHandlers() {
    document.getElementById('edit-mode-off')?.addEventListener('click', () => {
        if (isAdminMode) {
            isAdminMode = false;
            const settings = getSettings();
            settings.adminMode = false;
            saveSettings(settings);
            if (isEditMode) {
                isEditMode = false;
                if (workflowMode) {
                    renderWorkflow();
                } else {
                    loadPrompts();
                }
            }
            updateEditModeToggle();
            showToast('Режим редактирования выключен');
        }
    });
    
    document.getElementById('edit-mode-on')?.addEventListener('click', () => {
        if (!isAdminMode) {
            showEditModeConfirmModal();
        }
    });
    
    document.getElementById('confirm-edit-mode-btn')?.addEventListener('click', () => {
        isAdminMode = true;
        const settings = getSettings();
        settings.adminMode = true;
        saveSettings(settings);
        updateEditModeToggle();
        hideEditModeConfirmModal();
        showToast('Режим редактирования включён');
    });
}

/**
 * Дополнительные настройки
 */
function initAdvancedSettings() {
    // Раздел "Дополнительно"
    document.getElementById('advanced-settings-toggle')?.addEventListener('click', () => {
        const content = document.getElementById('advanced-settings-content');
        const arrow = document.getElementById('advanced-settings-arrow');
        if (content && arrow) {
            content.classList.toggle('hidden');
            arrow.style.transform = content.classList.contains('hidden') ? '' : 'rotate(180deg)';
        }
    });
    
    // Открытие папки данных
    document.getElementById('open-app-data-btn')?.addEventListener('click', async () => {
        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('open_app_data_dir');
            } else {
                showToast('Доступно только в десктопном приложении');
            }
        } catch (e) {
            showToast('Не удалось открыть папку');
        }
    });
    
    // Путь загрузок
    initDownloadsPathHandlers();
    
    // Лог скачиваний
    initArchiveLogHandlers();
}

/**
 * Обработчики пути загрузок
 */
function initDownloadsPathHandlers() {
    async function updateDownloadsPathDisplay() {
        const display = document.getElementById('downloads-path-display');
        if (!display) return;
        
        try {
            if (window.__TAURI__) {
                const path = await window.__TAURI__.core.invoke('get_downloads_path');
                if (path) {
                    display.textContent = path;
                    display.title = path;
                } else {
                    display.textContent = 'По умолчанию';
                    display.title = '';
                }
            }
        } catch (e) {
            display.textContent = 'По умолчанию';
        }
    }
    
    updateDownloadsPathDisplay();
    
    document.getElementById('set-downloads-path-btn')?.addEventListener('click', async () => {
        try {
            if (window.__TAURI__) {
                const path = await window.__TAURI__.core.invoke('pick_downloads_folder');
                if (path) {
                    await updateDownloadsPathDisplay();
                    showToast('Папка загрузок изменена');
                }
            } else {
                showToast('Доступно только в десктопном приложении');
            }
        } catch (e) {
            if (!e.toString().includes('не выбрана')) {
                showToast('Не удалось выбрать папку');
            }
        }
    });
}

/**
 * Обработчики лога скачиваний
 */
function initArchiveLogHandlers() {
    document.getElementById('open-archive-log-btn')?.addEventListener('click', async () => {
        await showArchiveLogModal();
    });
    
    document.getElementById('clear-archive-log-btn')?.addEventListener('click', async () => {
        if (confirm('Очистить весь лог скачиваний?')) {
            try {
                await window.__TAURI__.core.invoke('clear_archive_log');
                await showArchiveLogModal();
                showToast('Лог очищен');
            } catch (e) {
                // Ignore
            }
        }
    });
    
    document.getElementById('archive-log-search')?.addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#archive-log-tbody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(search) ? '' : 'none';
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Инициализация обработчиков модальных окон
 */
function initModalHandlers() {
    // Кнопки отмены
    document.getElementById('cancel-edit-mode-btn')?.addEventListener('click', hideEditModeConfirmModal);
    document.getElementById('cancel-constructor-btn')?.addEventListener('click', hideInputConstructorModal);
    document.getElementById('cancel-dynamic-input-btn')?.addEventListener('click', hideDynamicInputModal);
    document.getElementById('settings-close-btn')?.addEventListener('click', hideSettingsModal);
    document.getElementById('close-archive-log-btn')?.addEventListener('click', hideArchiveLogModal);
    document.getElementById('cancel-add-tab-btn')?.addEventListener('click', hideAddTabModal);
    
    // Сброс
    document.getElementById('confirm-reset-btn')?.addEventListener('click', confirmReset);
    document.getElementById('cancel-reset-btn')?.addEventListener('click', hideResetModal);
    document.getElementById('reset-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'reset-modal') hideResetModal();
    });
    
    // Импорт
    document.getElementById('import-confirm-btn')?.addEventListener('click', () => hideImportConfirm(true));
    document.getElementById('import-cancel-btn')?.addEventListener('click', () => hideImportConfirm(false));
    document.getElementById('import-confirm-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'import-confirm-modal') hideImportConfirm(false);
    });
    
    // Алерт
    document.getElementById('alert-ok-btn')?.addEventListener('click', hideAlert);
    document.getElementById('alert-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'alert-modal') hideAlert();
    });
    
    // Обновления
    initUpdateModalHandlers();
    
    // Закрытие по клику на оверлей
    const modalCloseHandlers = [
        ['edit-mode-confirm-modal', hideEditModeConfirmModal],
        ['settings-modal', hideSettingsModal],
        ['archive-log-modal', hideArchiveLogModal],
        ['add-tab-modal', hideAddTabModal],
        ['reset-modal', hideResetModal],
        ['input-constructor-modal', hideInputConstructorModal],
        ['dynamic-input-modal', hideDynamicInputModal]
    ];
    
    modalCloseHandlers.forEach(([id, handler]) => {
        document.getElementById(id)?.addEventListener('mousedown', (e) => {
            if (e.target.id === id) handler();
        });
    });
}

/**
 * Обработчики модалки обновлений
 */
function initUpdateModalHandlers() {
    const installBtn = document.getElementById('install-update-btn');
    const laterBtn = document.getElementById('update-later-btn');
    const okBtn = document.getElementById('update-ok-btn');
    const updateModal = document.getElementById('update-modal');
    
    if (installBtn) installBtn.addEventListener('click', installUpdate);
    if (laterBtn) laterBtn.addEventListener('click', hideUpdateModal);
    if (okBtn) okBtn.addEventListener('click', hideUpdateModal);
    if (updateModal) {
        updateModal.addEventListener('click', (e) => {
            if (e.target.id === 'update-modal') hideUpdateModal();
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOLBAR HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Инициализация панели инструментов
 */
function initToolbarHandlers() {
    // Кнопка вставки языкового блока
    const langBtn = document.getElementById('insert-lang-btn');
    if (langBtn) {
        langBtn.addEventListener('mousedown', (e) => e.preventDefault());
        langBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Находим активную textarea (в edit mode)
            const activeTextarea = document.querySelector('.prompt-textarea:focus') || 
                                   document.querySelector('.workflow-edit-textarea:focus');
            showLanguageFormMenu(activeTextarea, langBtn);
        });
    }
    
    // Закрытие меню вставки форм языка обрабатывается в showLanguageFormMenu
    
    // Конструктор полей
    document.getElementById('add-constructor-field-btn')?.addEventListener('click', addConstructorFieldElement);
    document.getElementById('save-constructor-btn')?.addEventListener('click', saveConstructorFields);
    
    // Иконки конструктора
    document.querySelectorAll('#constructor-icon-selector .icon-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#constructor-icon-selector .icon-option').forEach(b => 
                b.classList.remove('selected')
            );
            btn.classList.add('selected');
        });
    });
    
    // Закрытие конструктора
    document.getElementById('input-constructor-modal')?.addEventListener('mousedown', (e) => {
        if (e.target.id === 'input-constructor-modal') hideInputConstructorModal();
    });
    
    // Динамическая модалка
    document.getElementById('apply-dynamic-input-btn')?.addEventListener('click', applyDynamicInput);
    document.getElementById('dynamic-input-modal')?.addEventListener('mousedown', (e) => {
        if (e.target.id === 'dynamic-input-modal') hideDynamicInputModal();
    });
    
    // Выход из режима редактирования
    document.getElementById('exit-edit-mode-btn')?.addEventListener('click', () => {
        isEditMode = false;
        toggleEditToolbar(false);
        if (workflowMode) {
            renderWorkflow();
            setTimeout(() => scrollToBlocks(), 50);
        } else {
            loadPrompts();
        }
    });
    
    // Undo/Redo
    getUndoBtn()?.addEventListener('click', undo);
    getRedoBtn()?.addEventListener('click', redo);
    
    // Кнопки навигации
    document.getElementById('scroll-top-btn')?.addEventListener('click', () => {
        if (workflowMode) {
            getWorkflowContainer().scrollTo({top: 0, behavior: 'smooth'});
        } else {
            document.getElementById('scroll-container').scrollTo({top: 0, behavior: 'smooth'});
        }
    });
    
    document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload());
    
    document.getElementById('reset-btn')?.addEventListener('click', showResetModal);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Главная функция инициализации приложения
 */
function initApp() {
    // 0. Базовые настройки
    initAutocompleteDisable();
    initTextSelectionProtection();
    
    // 1. Загружаем состояние блоков
    loadBlockScripts();
    loadCollapsedBlocks();
    loadBlockAutomation();
    
    // 2. Настраиваем download listeners
    setupDownloadListeners();
    
    // 3. Инициализация workflow
    initWorkflow();
    
    // 4. Восстанавливаем состояние проекта
    if (typeof restoreProjectState === 'function') {
        restoreProjectState();
    }
    if (typeof initProjectUrlTracking === 'function') {
        initProjectUrlTracking();
    }
    
    // 5. Инициализация undo системы
    setTimeout(() => {
        const initialState = captureCurrentTabState();
        undoStack.push(initialState);
        tabHistories[currentTab] = {
            undoStack: [...undoStack],
            redoStack: [...redoStack]
        };
        isAppInitialized = true;
        updateUndoRedoButtons();
    }, 500);
    
    // 6. Автосохранение
    setInterval(() => {
        if (workflowMode && !isResetting) {
            document.querySelectorAll('.workflow-node-textarea').forEach(textarea => {
                const blockId = textarea.dataset.blockId;
                if (blockId) saveBlockContent(blockId, textarea.value);
            });
            saveWorkflowState(true);
        }
    }, TIMEOUTS.AUTOSAVE);
    
    // 7. Инициализация обработчиков
    initContextMenuHandlers();
    initKeyboardShortcuts();
    initAddBlockButton();
    initToolbarHandlers();
    initSettingsHandlers();
    initModalHandlers();
    
    // 8. Глобальные слушатели
    initScrollbarGlobalHandlers();
    
    window.addEventListener('beforeunload', async () => {
        if (isResetting) return;
        if (isClaudeVisible) await saveClaudeSettings();
        if (workflowMode) saveWorkflowState();
    });
    
    window.addEventListener('resize', () => {
        if (workflowMode) adjustWorkflowScale();
    });
    
    // 9. Асинхронная инициализация
    const initPromise = (async () => {
        initThemeListener();
        
        await initializePersistence();
        await initializeDefaultTabs();
        
        // Перезагружаем состояние блоков из localStorage (страховка после reset + remote load)
        loadBlockScripts();
        loadCollapsedBlocks();
        loadBlockAutomation();
        
        // Fallback: если хранилища пустые, но items содержат данные — синхронизируем
        syncBlockStatesFromItems();
        
        // Проверка currentTab
        const allTabs = getAllTabs();
        const tabIds = Object.keys(allTabs);
        if (!currentTab || !allTabs[currentTab]) {
            if (tabIds.length > 0) {
                const firstTab = Object.values(allTabs).sort((a, b) => a.name.localeCompare(b.name))[0];
                currentTab = firstTab.id;
                localStorage.setItem(STORAGE_KEYS.CURRENT_TAB, currentTab);
            }
        }
        
        loadPrompts();
        initTabSelector();
        initLanguageSelector();
        
        // Обработчики вкладок
        document.getElementById('confirm-add-tab-btn')?.addEventListener('click', () => {
            const name = document.getElementById('new-tab-name')?.value?.trim();
            const errorEl = document.getElementById('add-tab-error');
            if (!name) {
                errorEl?.classList.remove('hidden');
                return;
            }
            errorEl?.classList.add('hidden');
            const newTabId = createNewTab(name);
            hideAddTabModal();
            window.switchToTab?.(newTabId);
            if (isAdminMode) {
                isEditMode = true;
                toggleEditToolbar(true);
                if (workflowMode) {
                    renderWorkflow();
                } else {
                    loadPrompts();
                }
            }
        });
        
        document.getElementById('new-tab-name')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('confirm-add-tab-btn')?.click();
        });
    })();
    
    // 10. Claude интеграция
    initClaudeHandlers();
    
    // 11. Скроллбар
    const scrollContainer = document.getElementById('scroll-container');
    const mainScrollbar = document.createElement('div');
    mainScrollbar.className = 'main-scrollbar';
    mainScrollbar.innerHTML = '<div class="main-scrollbar-thumb"></div>';
    document.body.appendChild(mainScrollbar);
    initCustomScrollbar(scrollContainer, mainScrollbar);
    
    // 12. Промпты обработчики
    if (typeof initPromptsUpdateHandlers === 'function') {
        initPromptsUpdateHandlers();
    }
    
    // 13. Фоновая проверка обновлений (ждём завершения инициализации)
    setTimeout(async () => {
        // Дождаться завершения async инициализации (шаг 9)
        // чтобы не было гонки между initializeRemotePrompts и autoCheckPromptsUpdates
        await initPromise;
        
        const settings = getSettings();
        
        if (settings.autoUpdate) {
            try {
                const result = await checkForUpdates(false);
                if (result?.available) {
                    showUpdateModalAvailable(result.version, result.body);
                    return;
                }
            } catch (e) {
                console.warn('[Init] App update check failed:', e);
            }
        }
        
        if (typeof autoCheckPromptsUpdates === 'function') {
            try {
                await autoCheckPromptsUpdates();
            } catch (e) {
                console.warn('[Init] Prompts update check failed:', e);
            }
        }
    }, 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

window.initApp = initApp;
window.setupDownloadListeners = setupDownloadListeners;

// Запуск при загрузке DOM
document.addEventListener('DOMContentLoaded', initApp);
