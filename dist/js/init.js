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
        
        // MD файлы в активном проекте → в knowledge (без промежуточного тоста "Скачан")
        const isKnowledgeUpload = filename.toLowerCase().endsWith('.md') && file_path && isProjectActive();
        
        if (!isKnowledgeUpload) {
            showToast(`✅ Скачан: ${filename}`, 3000);
        }
        
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
        
        // Автозагрузка MD в knowledge проекта
        if (isKnowledgeUpload) {
            try {
                const result = await uploadToProjectKnowledge(file_path, filename);
                if (result.success) {
                    showToast(`📎 ${filename} → knowledge ✓`, 3500);
                } else {
                    showToast(`⚠️ ${filename}: knowledge upload failed`, 4000);
                }
            } catch (e) {
                console.error('Knowledge upload error:', e);
                showToast(`⚠️ ${filename}: knowledge upload error`, 4000);
            }
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
        const isOnNote = target.closest('.workflow-note');
        
        if (workflowMode && isEditMode && workflowCanvas && !isOnNode && !isOnNote) {
            showCanvasContextMenu(e);
            return;
        }
        
        // 1.5. ПКМ на заметке в edit mode
        if (workflowMode && isEditMode && isOnNote) {
            const noteId = isOnNote.dataset.noteId;
            const noteIndex = parseInt(isOnNote.dataset.noteIndex);
            
            // Если заметка в мульти-выделении — показываем общее меню
            if (selectedNodes.size > 1 && selectedNodes.has(noteId)) {
                const ids = [...selectedNodes];
                showContextMenu(e.clientX, e.clientY, [
                    {
                        label: `Копировать (${selectedNodes.size})`,
                        icon: CONTEXT_ICONS.copy,
                        action: () => copyBlocksToClipboard(ids)
                    },
                    { separator: true },
                    buildColorRow(ids)
                ]);
                return;
            }
            
            // Одиночная заметка
            if (!selectedNodes.has(noteId)) {
                clearNodeSelection();
                isOnNote.classList.add('selected');
                selectedNodes.add(noteId);
            }
            
            showContextMenu(e.clientX, e.clientY, [
                {
                    label: 'Копировать',
                    icon: CONTEXT_ICONS.copy,
                    action: () => copyBlocksToClipboard([noteId])
                },
                { separator: true },
                {
                    label: 'Удалить заметку',
                    icon: CONTEXT_ICONS.delete,
                    action: () => {
                        workflowNotes.splice(noteIndex, 1);
                        saveWorkflowState();
                        renderWorkflow(true);
                    }
                }
            ]);
            return;
        }
        
        // 2. ПКМ на заголовке блока или на скрапер-ноде в edit mode
        const nodeHeader = target.closest('.workflow-node-header');
        const node = target.closest('.workflow-node');
        
        if (workflowMode && isEditMode && node && (nodeHeader || node.classList.contains('scraper-node'))) {
            if (target.closest('input, button')) return;
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
    const hasScraperAlready = (getTabScrapers(currentTab) || []).length > 0;
    showContextMenu(e.clientX, e.clientY, [
        {
            label: 'Создать блок',
            icon: CONTEXT_ICONS.create,
            action: () => createBlockAtPosition(e)
        },
        {
            label: 'Создать заметку',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>',
            action: () => createNoteAtPosition(e)
        },
        {
            label: 'Создать скрапер',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>',
            disabled: hasScraperAlready,
            action: () => { document.getElementById('add-scraper-btn')?.click(); }
        },
        {
            label: 'Вставить',
            icon: CONTEXT_ICONS.paste,
            disabled: clipboard.length === 0 && (!window.clipboardNotes || window.clipboardNotes.length === 0),
            action: () => pasteBlocksAtPosition(e)
        }
    ]);
}

/**
 * Строка выбора цвета для контекстного меню
 * @param {string[]} blockIds - ID блоков для раскрашивания
 */
function buildColorRow(blockIds) {
    // Фильтруем заметки — цвет только для блоков
    const colorableIds = blockIds.filter(id => !id.startsWith('note_'));
    if (colorableIds.length === 0) return { separator: true };
    
    const currentColor = colorableIds.length === 1 ? workflowColors[colorableIds[0]] : null;
    return {
        colorRow: true,
        colors: ACCENT_PRESETS.slice(0, 4).map(p => ({
            name: p.name,
            color: p.color,
            active: currentColor === p.color,
            action: () => {
                colorableIds.forEach(id => { workflowColors[id] = p.color; });
                saveWorkflowState();
                renderWorkflow(true);
            }
        })),
        customColor: (hex) => {
            colorableIds.forEach(id => { workflowColors[id] = hex; });
            saveWorkflowState();
            renderWorkflow(true);
        },
        currentColor: currentColor || '#ec7441',
        onReset: () => {
            colorableIds.forEach(id => { delete workflowColors[id]; });
            saveWorkflowState();
            renderWorkflow(true);
        }
    };
}

/**
 * Контекстное меню для ноды
 */
function showNodeContextMenu(e, node) {
    const blockId = node.dataset.blockId;
    const index = parseInt(node.dataset.index);
    
    // Скрапер — сокращённое меню
    if (node.classList.contains('scraper-node')) {
        if (!selectedNodes.has(blockId)) {
            clearNodeSelection();
            node.classList.add('selected');
            selectedNodes.add(blockId);
        }
        showContextMenu(e.clientX, e.clientY, [
            {
                label: 'Копировать',
                icon: CONTEXT_ICONS.copy,
                action: () => copyBlocksToClipboard([blockId])
            },
            { separator: true },
            {
                label: 'Удалить',
                icon: CONTEXT_ICONS.delete,
                action: () => deleteScraperBlock(blockId)
            }
        ]);
        return;
    }
    
    // Если несколько блоков выделено
    if (selectedNodes.size > 1 && selectedNodes.has(blockId)) {
        const ids = [...selectedNodes];
        showContextMenu(e.clientX, e.clientY, [
            {
                label: `Копировать (${selectedNodes.size})`,
                icon: CONTEXT_ICONS.copy,
                action: () => copyBlocksToClipboard(ids)
            },
            { separator: true },
            buildColorRow(ids)
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
                label: 'Инструкция',
                icon: CONTEXT_ICONS.instruction,
                checked: (() => {
                    const blocks = getTabBlocks(currentTab);
                    const block = blocks.find(b => b.id === blockId);
                    return !!block?.instruction;
                })(),
                action: () => {
                    const blocks = getTabBlocks(currentTab);
                    const block = blocks.find(b => b.id === blockId);
                    if (!block) return;
                    UndoManager.snapshot(true);
                    if (block.instruction) {
                        removeBlockInstruction(block.number);
                    } else {
                        addBlockInstruction(block.number, 'info');
                    }
                    renderWorkflow(true);
                }
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
            },
            { separator: true },
            buildColorRow([blockId])
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
    
    const containerRect = container.getBoundingClientRect();
    const canvasPos = screenToCanvas(e.clientX - containerRect.left, e.clientY - containerRect.top);
    
    const gridSize = 40;
    const newX = Math.round(canvasPos.x / gridSize) * gridSize;
    const newY = Math.round(canvasPos.y / gridSize) * gridSize;
    
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
    saveWorkflowState();
}

/**
 * Создать заметку в позиции клика
 */
function createNoteAtPosition(e) {
    const container = getWorkflowContainer();
    
    const containerRect = container.getBoundingClientRect();
    const canvasPos = screenToCanvas(e.clientX - containerRect.left, e.clientY - containerRect.top);
    
    const gridSize = 40;
    const newX = Math.round(canvasPos.x / gridSize) * gridSize;
    const newY = Math.round(canvasPos.y / gridSize) * gridSize;
    
    workflowNotes.push({
        id: 'note_' + Date.now(),
        text: '',
        x: newX,
        y: newY,
        width: 280,
        height: 160
    });
    
    saveWorkflowState();
    renderWorkflow(true);
}

/**
 * Создать заметку рядом с существующими блоками (для кнопки тулбара)
 */
function addWorkflowNote() {
    const blocks = getTabBlocks(currentTab);
    let newX = 40, newY = 40;
    
    // Ищем свободное место справа от блоков
    if (blocks.length > 0) {
        const pos = findNewBlockPosition(blocks);
        newX = pos.x;
        newY = pos.y;
    }
    
    workflowNotes.push({
        id: 'note_' + Date.now(),
        text: '',
        x: newX,
        y: newY,
        width: 280,
        height: 160
    });
    
    saveWorkflowState();
    renderWorkflow(true);
}

/**
 * Вставить блоки в позицию клика
 */
function pasteBlocksAtPosition(e) {
    if (clipboard.length === 0 && (!window.clipboardNotes || window.clipboardNotes.length === 0)) return;
    
    const container = getWorkflowContainer();
    
    const containerRect = container.getBoundingClientRect();
    const canvasPos = screenToCanvas(e.clientX - containerRect.left, e.clientY - containerRect.top);
    const baseX = Math.round(canvasPos.x / 40) * 40;
    const baseY = Math.round(canvasPos.y / 40) * 40;
    
    pasteBlocksAtCoords(baseX, baseY);
}

/**
 * Вставить блоки по координатам
 */
function pasteBlocksAtCoords(baseX, baseY) {
    // Snapshot ДО вставки
    UndoManager.snapshot(true);
    
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
            const itemType = item.type || 'block';
            const newItem = {
                id: newId,
                type: itemType,
                title: item.title,
            };
            if (itemType === 'block') {
                newItem.content = item.content;
                newItem.instruction = item.instruction;
                if (item.hasAttachments) newItem.hasAttachments = true;
            } else if (itemType === 'scraper') {
                newItem.keyword = item.keyword || '';
                if (item.queries) newItem.queries = structuredClone(item.queries);
            }
            tabs[currentTab].items.push(newItem);
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
        
        if (item.color) {
            workflowColors[newId] = item.color;
        }
        
        newBlockIds.push(newId);
    });
    
    // Сохраняем хранилища
    saveCollapsedBlocks();
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
    
    // Вставляем заметки
    const newNoteIds = [];
    if (window.clipboardNotes && window.clipboardNotes.length > 0) {
        window.clipboardNotes.forEach(noteData => {
            const newNote = {
                id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                text: noteData.text,
                x: baseX + noteData.relX,
                y: baseY + noteData.relY,
                width: noteData.width,
                height: noteData.height
            };
            workflowNotes.push(newNote);
            newNoteIds.push(newNote.id);
        });
    }
    
    saveWorkflowState();
    saveAllTabs(tabs);
    renderWorkflow(true);
    
    newBlockIds.forEach(id => {
        selectedNodes.add(id);
        const node = document.querySelector(`.workflow-node[data-block-id="${id}"]`);
        node?.classList.add('selected');
    });
    newNoteIds.forEach(id => {
        selectedNodes.add(id);
        const noteEl = document.querySelector(`.workflow-note[data-note-id="${id}"]`);
        noteEl?.classList.add('selected');
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
                UndoManager.undo();
                return;
            }
            if (e.code === 'KeyY') {
                e.preventDefault();
                UndoManager.redo();
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
    if (e.ctrlKey && e.code === 'KeyV' && (clipboard.length > 0 || (window.clipboardNotes && window.clipboardNotes.length > 0))) {
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
    // Snapshot ДО удаления (force — деструктивная операция)
    UndoManager.snapshot(true);
    
    selectedNodes.forEach(id => {
        if (id.startsWith('note_')) {
            // Удаляем заметку
            const idx = workflowNotes.findIndex(n => n.id === id);
            if (idx !== -1) workflowNotes.splice(idx, 1);
        } else {
            // Удаляем блок
            workflowConnections = workflowConnections.filter(
                c => c.from !== id && c.to !== id
            );
            delete workflowPositions[id];
            delete workflowSizes[id];
            delete workflowColors[id];
            removeItemFromTab(currentTab, id);
        }
    });
    
    selectedNodes.clear();
    renderWorkflow(true);
    saveWorkflowState();
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
    document.querySelectorAll('.workflow-note').forEach(noteEl => {
        noteEl.classList.add('selected');
        const noteId = noteEl.dataset.noteId;
        if (noteId) selectedNodes.add(noteId);
    });
}

/**
 * Вставить блоки со смещением
 */
function pasteBlocksWithOffset() {
    // Находим базовую точку группы (блоки + заметки)
    let minOrigX = Infinity, minOrigY = Infinity;
    clipboard.forEach(item => {
        if (item.origX !== undefined) minOrigX = Math.min(minOrigX, item.origX);
        if (item.origY !== undefined) minOrigY = Math.min(minOrigY, item.origY);
    });
    if (window.clipboardNotes) {
        window.clipboardNotes.forEach(item => {
            if (item.origX !== undefined) minOrigX = Math.min(minOrigX, item.origX);
            if (item.origY !== undefined) minOrigY = Math.min(minOrigY, item.origY);
        });
    }
    
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
    // Snapshot ДО перемещения
    UndoManager.snapshot();
    
    const gridSize = 40;
    
    selectedNodes.forEach(id => {
        const pos = getItemPosition(id);
        if (pos) {
            switch (key) {
                case 'ArrowUp': pos.y = Math.max(gridSize, pos.y - gridSize); break;
                case 'ArrowDown': pos.y += gridSize; break;
                case 'ArrowLeft': pos.x = Math.max(0, pos.x - gridSize); break;
                case 'ArrowRight': pos.x += gridSize; break;
            }
            setItemPosition(id, pos.x, pos.y);
            const el = getItemElement(id);
            if (el) {
                el.style.left = pos.x + 'px';
                el.style.top = pos.y + 'px';
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
        
        // Snapshot ДО создания блока
        UndoManager.snapshot(true);
        
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
        saveWorkflowState();
    });
}

/**
 * Обработчик кнопки добавления заметки
 */
function initAddNoteButton() {
    const addNoteBtn = document.getElementById('add-note-btn');
    if (!addNoteBtn) return;
    
    addNoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addWorkflowNote();
    });
}

/**
 * Обработчик кнопки добавления скрапера
 */
function initAddScraperButton() {
    const btn = document.getElementById('add-scraper-btn');
    if (!btn) return;
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Максимум 1 скрапер на вкладку
        if ((getTabScrapers(currentTab) || []).length > 0) {
            showToast('⚠️ Только один скрапер на пайплайн');
            return;
        }
        
        UndoManager.snapshot(true);
        
        const newId = 'scraper-' + generateItemId();
        const blocks = getTabBlocks(currentTab);
        
        let newX = 40, newY = 40;
        if (blocks.length > 0) {
            const position = findNewBlockPosition(blocks);
            newX = position.x;
            newY = position.y;
        }
        
        const tabs = getAllTabs();
        if (tabs[currentTab]) {
            tabs[currentTab].items.push({
                id: newId,
                type: 'scraper',
                title: 'SERP SCRAPER',
                keyword: ''
            });
            saveAllTabs(tabs);
        }
        
        workflowPositions[newId] = { x: newX, y: newY };
        renderWorkflow(true);
        saveWorkflowState();
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
    
    // Оффлайн-режим
    document.getElementById('offline-mode-off')?.addEventListener('click', () => {
        setOfflineMode(false);
        updateOfflineModeButtons(getSettings().offlineMode);
    });
    document.getElementById('offline-mode-on')?.addEventListener('click', () => {
        setOfflineMode(true);
        updateOfflineModeButtons(getSettings().offlineMode);
    });
    
    // Auto-continue
    document.getElementById('auto-continue-off')?.addEventListener('click', () => {
        setAutoContinue(false);
        updateAutoContinueButtons(false);
    });
    document.getElementById('auto-continue-on')?.addEventListener('click', () => {
        setAutoContinue(true);
        updateAutoContinueButtons(true);
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
    
    document.getElementById('manual-skills-check-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('manual-skills-check-btn');
        const originalHtml = btn.innerHTML;
        btn.classList.add('checking');
        btn.disabled = true;
        
        try {
            const result = await refreshAndBindSkills((status) => {
                btn.textContent = status;
            });
            
            showToast(result.message, result.success ? 2000 : 3000);
        } catch (e) {
            showToast(`✗ Ошибка: ${String(e).slice(0, 50)}`, 3000);
        } finally {
            btn.innerHTML = originalHtml;
            btn.classList.remove('checking');
            btn.disabled = false;
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
    updateEditModeToggle();
    
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
            const expanded = !content.classList.contains('hidden');
            arrow.style.transform = expanded ? 'rotate(180deg)' : '';
            content.closest('.modal-content')?.classList.toggle('has-scroll', expanded);
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
    
    // Экспорт диагностики
    document.getElementById('export-diagnostics-btn')?.addEventListener('click', async () => {
        try {
            if (window.__TAURI__) {
                const path = await window.__TAURI__.core.invoke('export_diagnostics');
                showToast('Экспортировано: ' + path.split(/[/\\]/).pop());
            }
        } catch (e) {
            const msg = e?.toString() || '';
            if (msg.includes('пуст')) {
                showToast('Лог диагностики пуст');
            } else {
                showToast('Ошибка экспорта');
            }
        }
    });
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
    
    document.getElementById('export-diagnostics-btn')?.addEventListener('click', async () => {
        try {
            if (window.__TAURI__) {
                const path = await window.__TAURI__.core.invoke('export_diagnostics');
                showToast(`Экспортировано: ${path.split(/[/\\]/).pop()}`);
            }
        } catch (e) {
            const msg = e?.toString() || '';
            if (msg.includes('пуст')) {
                showToast('Лог диагностики пуст');
            } else {
                showToast('Не удалось экспортировать');
            }
        }
    });
    
    document.getElementById('clear-archive-log-btn')?.addEventListener('click', async function() {
        const btn = this;
        
        // Второй клик — подтверждение
        if (btn.dataset.confirming === 'true') {
            btn.dataset.confirming = '';
            btn.textContent = 'Очистить лог';
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
            try {
                await window.__TAURI__.core.invoke('clear_archive_log');
                await showArchiveLogModal();
                showToast('Лог очищен');
            } catch (e) {
                // Ignore
            }
            return;
        }
        
        // Первый клик — запрос подтверждения
        btn.dataset.confirming = 'true';
        btn.textContent = 'Точно очистить?';
        btn.style.background = 'var(--color-danger)';
        btn.style.borderColor = 'var(--color-danger)';
        btn.style.color = '#fff';
        
        // Автосброс через 3 сек
        setTimeout(() => {
            if (btn.dataset.confirming === 'true') {
                btn.dataset.confirming = '';
                btn.textContent = 'Очистить лог';
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.style.color = '';
            }
        }, 3000);
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
    
    // SERP переменная — вставка {{SERP:id}} в активный textarea
    const serpBtn = document.getElementById('insert-serp-btn');
    if (serpBtn) {
        serpBtn.addEventListener('mousedown', (e) => e.preventDefault());
        serpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            insertTextAtCursor('{{SERP}}');
        });
    }
    
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
    getUndoBtn()?.addEventListener('click', () => UndoManager.undo());
    getRedoBtn()?.addEventListener('click', () => UndoManager.redo());
    
    // Кнопки навигации
    document.getElementById('scroll-top-btn')?.addEventListener('click', () => {
        if (workflowMode) {
            if (isEditMode && typeof centerOnContent === 'function') {
                centerOnContent();
            } else {
                getWorkflowContainer().scrollTo({top: 0, behavior: 'smooth'});
            }
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
    
    // 0.5. Применяем оффлайн-режим (CSS-класс на body)
    applyOfflineMode();
    
    // 1. Загружаем состояние блоков
    loadBlockScripts();
    loadCollapsedBlocks();
    loadBlockAutomation();
    
    // 2. Настраиваем download listeners
    setupDownloadListeners();
    
    // 2.1. Auto-continue toast listener
    if (window.__TAURI__?.event?.listen) {
        window.__TAURI__.event.listen('auto-continue-toast', (event) => {
            if (event.payload) showToast(event.payload, 3000);
        });
    }
    
    // 2.5. Инициализируем гибридное хранение (file + localStorage)
    if (typeof initHybridStorage === 'function') {
        initHybridStorage().catch(e => console.warn('[Storage] Hybrid init failed:', e));
    }
    
    // 3. Восстанавливаем режим редактирования из настроек
    if (typeof initAdminMode === 'function') {
        initAdminMode();
    }
    
    // 4. Инициализация workflow
    initWorkflow();
    
    // 4. Восстанавливаем состояние проекта
    if (typeof restoreProjectState === 'function') {
        restoreProjectState();
    }
    if (typeof initProjectUrlTracking === 'function') {
        initProjectUrlTracking();
    }
    
    // 5. Инициализация undo системы
    UndoManager.init();
    
    // 6. Автосохранение
    setInterval(() => {
        if (workflowMode && !isResetting) {
            document.querySelectorAll('.workflow-node-textarea').forEach(textarea => {
                const blockId = textarea.dataset.blockId;
                if (blockId) saveBlockContent(blockId, textarea.value);
            });
            saveWorkflowState();
        }
    }, TIMEOUTS.AUTOSAVE);
    
    // 7. Инициализация обработчиков
    initContextMenuHandlers();
    initKeyboardShortcuts();
    initAddBlockButton();
    initAddNoteButton();
    initAddScraperButton();
    initToolbarHandlers();
    initSettingsHandlers();
    initModalHandlers();
    
    // 8. Глобальные слушатели
    
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
        initCustomization();
        
        await initializePersistence();
        await initializeDefaultTabs();
        
        // Перезагружаем состояние блоков из localStorage (страховка после reset + remote load)
        loadBlockScripts();
        loadCollapsedBlocks();
        loadBlockAutomation();
        
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
        
        // Восстанавливаем adminMode после возможного сброса
        if (typeof initAdminMode === 'function') {
            initAdminMode();
            if (typeof updateEditModeToggle === 'function') updateEditModeToggle();
        }
        
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
    
    // 10.5. Инициализация Claude WebView (только если не оффлайн)
    if (!isOfflineMode() && window.__TAURI__) {
        window.__TAURI__.core.invoke('init_claude_webviews').catch(e => {
            console.warn('[Init] Claude webviews init failed:', e);
        });
        
        // Авто-ретрай: если через 10 сек таб 1 не загрузился — перенавигировать
        setTimeout(async () => {
            try {
                const url = await window.__TAURI__.core.invoke('get_tab_url', { tab: 1 });
                if (!url || url === 'about:blank' || !url.startsWith('https://claude.ai')) {
                    console.warn('[Init] Tab 1 not loaded, retrying navigation...');
                    await window.__TAURI__.core.invoke('navigate_claude_tab', { 
                        tab: 1, url: 'https://claude.ai/new' 
                    });
                }
            } catch (e) {
                // Ignore — webview may not exist in offline mode
            }
        }, 10000);
    }
    
    // 11. (Скроллбар — нативный webkit, стили в CSS)
    
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
