/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKFLOW RENDER MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции рендеринга workflow: создание нод, отображение canvas.
 * 
 * Зависимости:
 *   - window.AppState (shared state)
 *   - Алиасы: workflowMode, workflowPositions, workflowSizes, workflowConnections,
 *             isEditMode, currentTab, selectedNodes, isDraggingNode, dragOffsets,
 *             isResizingNode, resizeNode, resizeDirection, resizeStartX/Y/Width/Height/Left/Top,
 *             activeClaudeTab, collapsedBlocks, blockScripts, blockAttachments,
 *             activeTextarea, skipScrollOnRender, activeProject
 *   - DOM getters: getWorkflowContainer(), getWorkflowCanvas(), getWorkflowSvg(), 
 *                  getZoomIndicator(), getEditModal(), getEditTitle(), getEditContent()
 *   - Из utils.js: getCanvasScale()
 *   - Из других модулей:
 *     - setupWorkflowZoom(), adjustWorkflowScale() из workflow-zoom.js
 *     - clearGridOverlay() из workflow-grid.js
 *     - renderConnections() из connections.js
 *     - saveWorkflowState() из workflow-state.js
 *     - clearNodeSelection(), onNodeDrag, onNodeDragEnd, onNodeResize, onNodeResizeEnd из workflow-interactions.js
 *     - sendNodeToClaude() из claude-api.js
 *   - Из blocks.js: getBlockScripts(), getBlockAutomationFlags(), isBlockCollapsed(), 
 *                   toggleBlockCollapsed(), saveCollapsedBlocks(), saveBlockScripts()
 *   - Из index.html: getTabBlocks(), getTabItems(), getAllTabs(), saveAllTabs(), 
 *                    escapeHtml(), showToast() из toast.js, hideContextMenu(), setupPortEvents(),
 *                    toggleBlockScript(), toggleBlockAutomation(), toggleAttachmentsPanel(),
 *                    attachFilesToBlock(), removeAttachmentFromBlock(), alignCollapsedToOddGrid(),
 *                    showInputConstructorModal(), showDynamicInputModal(), addBlockInstruction(),
 *                    removeBlockInstruction(), updateBlockInstruction(), insertLanguageFormAtCursor(),
 *                    selectChatForNode(), saveBlockContent()
 *   - SVG_ICONS, EMBEDDED_SCRIPTS, TIMEOUTS из config.js
 * 
 * Экспортирует (глобально):
 *   - initWorkflow()
 *   - renderWorkflow(preserveScroll)
 *   - autoPositionNodes(promptsData)
 *   - createWorkflowNode(block, index)
 *   - createWorkflowInstruction(block, index)
 *   - setupNodeEvents(node, index)
 *   - editWorkflowNode(index)
 *   - showBlockEditModal(block, index)
 *   - hideWorkflowEditModal()
 *   - saveWorkflowEdit()
 *   - deleteWorkflowBlock(index)
 *   - generateExpandedFooterHtml(index, chatTabs, options)
 */

// ═══════════════════════════════════════════════════════════════════════════
// MODULE STATE (modal undo/redo)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Состояние undo/redo для модального окна редактирования
 * @type {{undoStack: Array, redoStack: Array, lastSaveTime: number}}
 */
const modalState = {
    undoStack: [],
    redoStack: [],
    lastSaveTime: 0
};

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Инициализация workflow режима
 */
function initWorkflow() {
    const container = getWorkflowContainer();
    const app = document.getElementById('app');
    const indicator = getZoomIndicator();
    
    if (workflowMode) {
        container?.classList.remove('hidden');
        app?.classList.add('hidden');
        // Настраиваем zoom
        setupWorkflowZoom();
        // Скроллим к центру холста
        scrollToCanvasCenter(container);
    } else {
        container?.classList.add('hidden');
        app?.classList.remove('hidden');
        // Скрываем индикатор зума
        indicator?.classList.remove('visible');
    }
}

/**
 * Скролл к центру холста
 */
function scrollToCanvasCenter(container) {
    if (!container) return;
    if (isEditMode && typeof centerOnContent === 'function') {
        centerOnContent();
    } else {
        const center = WORKFLOW_CONFIG.CANVAS_CENTER;
        const scaledCenter = center * workflowZoom;
        container.scrollLeft = Math.max(0, scaledCenter - container.clientWidth / 2);
        container.scrollTop = Math.max(0, scaledCenter - container.clientHeight / 2);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE FOOTER BUTTONS
// ═══════════════════════════════════════════════════════════════════════════

/** @type {ResizeObserver|null} */
let _footerResizeObserver = null;

/**
 * Подстраивает кнопку «Редактировать» под ширину контейнера.
 * Использует стандартную проверку overflow: scrollWidth > clientWidth.
 * 
 * Логика:
 *   1. Сбросить в полный режим
 *   2. Если edit-кнопка overflow → переключить на compact (иконка + «Ред.»)
 *   3. Если всё ещё overflow → переключить на icon (только иконка)
 */
function adaptFooterButtons(container) {
    if (!container) return;
    
    const editBtn = container.querySelector('.edit-btn');
    const chatBtns = container.querySelectorAll('.chat-btn');
    
    // 1. Сбросить все адаптации
    container.classList.remove('compact-edit', 'icon-edit', 'compact-chat');
    
    // 2. Адаптация edit-кнопки
    if (editBtn && editBtn.scrollWidth > editBtn.clientWidth) {
        container.classList.add('compact-edit');
        if (editBtn.scrollWidth > editBtn.clientWidth) {
            container.classList.remove('compact-edit');
            container.classList.add('icon-edit');
        }
    }
    
    // 3. Адаптация chat-кнопок: если хоть одна overflow — скрыть «Чат» у всех
    for (const btn of chatBtns) {
        if (btn.scrollWidth > btn.clientWidth) {
            container.classList.add('compact-chat');
            break;
        }
    }
}

/**
 * Устанавливает ResizeObserver на ноды для адаптации кнопок футера.
 * Observer реагирует на любое изменение ширины ноды (drag resize, zoom, etc).
 */
function observeFooterButtons(canvas) {
    if (_footerResizeObserver) {
        _footerResizeObserver.disconnect();
        _footerResizeObserver = null;
    }
    
    const nodes = canvas.querySelectorAll('.workflow-node:not(.collapsed)');
    if (!nodes.length) return;
    
    _footerResizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            const bc = entry.target.querySelector('.workflow-node-footer-buttons');
            if (bc) adaptFooterButtons(bc);
        }
    });
    
    nodes.forEach(node => _footerResizeObserver.observe(node));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Рендерит все блоки как workflow ноды на canvas
 * 
 * @param {boolean|null} preserveScroll - сохранять позицию скролла?
 *   - null: автоопределение (сохранять в edit mode)
 *   - true: всегда сохранять
 *   - false: не сохранять (сбросить к началу)
 */
function renderWorkflow(preserveScroll = null) {
    if (!workflowMode) return;
    
    // Синхронизируем CSS-класс offline-mode с настройками (защита от десинхронизации)
    if (typeof applyOfflineMode === 'function') applyOfflineMode();
    
    // Синхронизируем ProjectFSM с localStorage (защита от десинхронизации после performReset)
    if (typeof ProjectFSM !== 'undefined' && ProjectFSM._state !== 'idle') {
        if (!localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT)) {
            ProjectFSM._state = 'idle';
            ProjectFSM._data = null;
            activeProject = null;
            const finishBtn = document.getElementById('finish-project-btn');
            if (finishBtn) finishBtn.classList.remove('visible', 'hiding');
        }
    }
    
    const canvas = getWorkflowCanvas();
    const svg = getWorkflowSvg();
    const container = getWorkflowContainer();
    if (!canvas || !svg || !container) return;
    
    // Сбрасываем кэш размера холста (блоки могли измениться)
    if (typeof invalidateCanvasSize === 'function') invalidateCanvasSize();
    
    // По умолчанию в edit mode сохраняем камеру, в view mode — скролл
    const shouldPreserveScroll = preserveScroll !== null ? preserveScroll : isEditMode;
    
    // В view mode сохраняем позицию скролла
    const savedScrollLeft = (!isEditMode && shouldPreserveScroll) ? container.scrollLeft : null;
    const savedScrollTop = (!isEditMode && shouldPreserveScroll) ? container.scrollTop : null;
    
    // Устанавливаем флаг для подавления автоскролла
    if (shouldPreserveScroll) {
        skipScrollOnRender = true;
    }
    
    // Обновляем класс edit-mode и scrollbar
    if (isEditMode) {
        container.classList.add('edit-mode', 'scrollbar-hidden');
    } else {
        container.classList.remove('edit-mode', 'scrollbar-hidden');
        // Очищаем оверлей
        clearGridOverlay();
    }
    
    // Очищаем ноды и заметки
    canvas.querySelectorAll('.workflow-node, .workflow-note').forEach(n => n.remove());
    
    // Получаем текущие блоки и скраперы
    const blocks = getTabBlocks(currentTab);
    const scrapers = getTabScrapers(currentTab);
    const allNodes = [...blocks, ...scrapers];
    
    if (allNodes.length === 0) {
        renderConnections();
        adjustWorkflowScale(false);
        
        if (isEditMode) {
            scrollToCanvasCenter(container);
        }
        
        skipScrollOnRender = false;
        return;
    }
    
    // Автоматическое позиционирование если нет сохранённых позиций
    autoPositionNodes(allNodes);
    
    // Создаём ноды блоков
    blocks.forEach((block, index) => {
        const node = createWorkflowNode(block, index);
        canvas.appendChild(node);
    });
    
    // Пересчитываем минимальную высоту и минимизацию для нод с сохранённым размером
    canvas.querySelectorAll('.workflow-node:not(.collapsed)').forEach(node => {
        const savedHeight = parseFloat(node.style.height);
        if (!savedHeight) return;
        const header = node.querySelector('.workflow-node-header');
        const footer = node.querySelector('.workflow-node-footer');
        if (header && footer) {
            const hf = header.offsetHeight + footer.offsetHeight;
            const activeInstruction = node.querySelector('.workflow-instruction-strip');
            const activeAttach = node.querySelector('.workflow-node-attachments');
            const activeH = (activeInstruction ? 52 : 0) + (activeAttach ? 60 : 0);
            
            // Кэмп минимальной высоты (edit mode)
            if (isEditMode) {
                const minH = hf + activeH + 4;
                if (savedHeight < minH) {
                    const gridSize = WORKFLOW_CONFIG.GRID_SIZE;
                    const clamped = Math.ceil(minH / gridSize) * gridSize;
                    node.style.height = clamped + 'px';
                    const blockId = node.dataset.blockId;
                    if (blockId && workflowSizes[blockId]) {
                        workflowSizes[blockId].height = clamped;
                    }
                }
            }
            
            // Compact: скрываем пустые add-кнопки
            const hasAddInstruction = !!node.querySelector('.workflow-instruction-add');
            const hasAddAttach = !!node.querySelector('.workflow-attachments-add');
            const addH = (hasAddInstruction ? 52 : 0) + (hasAddAttach ? 52 : 0);
            node.classList.toggle('compact', addH > 0 && savedHeight < hf + activeH + addH + 80);
            
            // Minimized: скрываем textarea/body
            node.classList.toggle('minimized', savedHeight <= hf + activeH + 80);
        }
    });
    
    // Создаём ноды скраперов
    scrapers.forEach((scraper) => {
        const node = createScraperNode(scraper);
        canvas.appendChild(node);
    });
    
    // Создаём заметки
    workflowNotes.forEach((note, index) => {
        const noteEl = createWorkflowNote(note, index);
        canvas.appendChild(noteEl);
    });
    
    // Адаптивные кнопки футера: ResizeObserver подстраивает
    // состояние кнопки "Редактировать" под ширину футера
    observeFooterButtons(canvas);
    
    // Выравниваем collapsed блоки по нечётной сетке
    requestAnimationFrame(() => {
        blocks.forEach(block => {
            if (isBlockCollapsed(block.id)) {
                const node = document.querySelector(`.workflow-node[data-block-id="${block.id}"]`);
                if (node) {
                    alignCollapsedToOddGrid(node, block.id);
                }
            }
        });
        renderConnections();
        
        // Применяем масштабирование ПОСЛЕ того как DOM обновился
        adjustWorkflowScale(!shouldPreserveScroll);
        
        // В view mode восстанавливаем скролл, в edit mode камера уже применена
        if (!isEditMode && shouldPreserveScroll && savedScrollLeft !== null) {
            container.scrollLeft = savedScrollLeft;
            container.scrollTop = savedScrollTop;
        }
        
        // Сбрасываем флаг
        skipScrollOnRender = false;
    });
    
    // Рендерим связи (только в edit mode они видны)
    renderConnections();
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO POSITIONING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Автопозиционирование нод относительно центра холста
 */
function autoPositionNodes(promptsData) {
    const gridSize = WORKFLOW_CONFIG.GRID_SIZE;
    const nodeWidth = WORKFLOW_CONFIG.NODE_DEFAULT_WIDTH;
    const nodeHeight = WORKFLOW_CONFIG.NODE_MIN_HEIGHT;
    const gapX = WORKFLOW_CONFIG.NODE_GAP_X;
    const gapY = WORKFLOW_CONFIG.NODE_GAP_Y;
    const canvasCenter = WORKFLOW_CONFIG.CANVAS_CENTER;
    
    const numBlocks = promptsData.length;
    if (numBlocks === 0) return;
    
    // Вычисляем оптимальное количество колонок
    const maxCols = 10; // Разумный лимит колонок (холст бесконечный)
    
    // Выбираем количество колонок
    let cols = Math.max(1, Math.min(maxCols, numBlocks));
    
    if (numBlocks <= 3) {
        cols = Math.min(numBlocks, cols);
    } else {
        cols = Math.min(cols, Math.ceil(Math.sqrt(numBlocks)));
    }
    
    const rows = Math.ceil(numBlocks / cols);
    const totalWidth = cols * nodeWidth + (cols - 1) * gapX;
    const totalHeight = rows * nodeHeight + (rows - 1) * gapY;
    
    // Центрируем относительно центра холста
    const startX = Math.round((canvasCenter - totalWidth / 2) / gridSize) * gridSize;
    const startY = Math.round((canvasCenter - totalHeight / 2) / gridSize) * gridSize;
    
    promptsData.forEach((prompt, index) => {
        const blockId = prompt.id;
        if (!workflowPositions[blockId]) {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = Math.round((startX + col * (nodeWidth + gapX)) / gridSize) * gridSize;
            const y = Math.round((startY + row * (nodeHeight + gapY)) / gridSize) * gridSize;
            workflowPositions[blockId] = { x, y };
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Генерирует HTML кнопок футера для развёрнутой ноды
 * @param {number} index - Индекс блока
 * @param {number[]} chatTabs - Массив доступных табов [1], [1,2], [1,2,3]
 * @param {Object} options
 * @param {boolean} options.showChatButtons - Показывать кнопки чата (default: true)
 * @returns {string} HTML
 */
function generateExpandedFooterHtml(index, chatTabs, options = {}) {
    const { showChatButtons = true } = options;
    const arrowSvg = SVG_ICONS.arrow;
    const copySvg = SVG_ICONS.copy;
    const editSvg = SVG_ICONS.edit;
    
    // Кнопка редактирования: полный текст → иконка + "Ред." → только иконка
    let html = `<button class="workflow-node-btn edit-btn" onclick="editWorkflowNode(${index})">${editSvg}<span class="btn-label-full">Редактировать</span><span class="btn-label-short">Ред.</span></button>`;
    
    // Оффлайн-режим: одна кнопка «Скопировать» вместо кнопок чатов
    if (isOfflineMode()) {
        html += `<button class="workflow-node-btn primary copy-btn" onclick="copyNodeContent(${index})">${copySvg}<span class="btn-label-chat">Скопировать</span></button>`;
    } else if (showChatButtons) {
        // Кнопки отправки в чаты (если разрешено)
        if (chatTabs.length === 1) {
            const isGen = (typeof isTabBusy === 'function' ? isTabBusy(chatTabs[0]) : generatingTabs[chatTabs[0]]) || false;
            html += `<button class="workflow-node-btn primary chat-btn" onclick="sendNodeToClaude(${index}, ${chatTabs[0]})"${isGen ? ' disabled' : ''}>${arrowSvg}<span class="btn-label-chat">Чат</span></button>`;
        } else {
            chatTabs.forEach(tab => {
                const isGen = (typeof isTabBusy === 'function' ? isTabBusy(tab) : generatingTabs[tab]) || false;
                html += `<button class="workflow-node-btn primary chat-btn" onclick="sendNodeToClaude(${index}, ${tab})"${isGen ? ' disabled' : ''}>${arrowSvg}<span class="btn-label-chat">Чат\u00A0</span><span class="btn-label-num">${tab}</span></button>`;
            });
        }
    }
    
    return html;
}

/**
 * Создание DOM элемента ноды
 */
function createWorkflowNode(block, index) {
    const blockId = block.id;
    const pos = workflowPositions[blockId] || {x: 120, y: 120};
    const size = workflowSizes[blockId] || {width: 680, height: null};
    const isCollapsed = isBlockCollapsed(blockId);
    
    // Проверка доступности отправки в чат (для Project Binding)
    const canSendToChat = !isProjectActive() || isCurrentTabProjectOwner();
    
    const node = document.createElement('div');
    // Добавляем project-restricted для collapsed блоков если проект активен и вкладка не владелец
    let nodeClass = 'workflow-node' + (isCollapsed ? ' collapsed' : '');
    if (isCollapsed && !canSendToChat) {
        nodeClass += ' project-restricted';
    }
    node.className = nodeClass;
    node.dataset.index = index;
    node.dataset.blockId = blockId;
    
    // Позиции применяются в обоих режимах
    node.style.left = pos.x + 'px';
    node.style.top = pos.y + 'px';
    
    // Для collapsed блоков ширина вычисляется автоматически в alignCollapsedToOddGrid
    if (!isCollapsed) {
        if (size.width) {
            node.style.width = size.width + 'px';
        }
        if (size.height) {
            node.style.height = size.height + 'px';
        }
    }
    
    // 4 порта - со всех сторон
    const sides = ['top', 'right', 'bottom', 'left'];
    sides.forEach(side => {
        const port = document.createElement('div');
        port.className = `workflow-port workflow-port-${side}`;
        port.dataset.side = side;
        port.dataset.blockId = blockId;
        node.appendChild(port);
        setupPortEvents(port);
    });
    
    // Невидимые зоны ресайза (8 штук)
    const resizeDirections = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
    resizeDirections.forEach(dir => {
        const zone = document.createElement('div');
        zone.className = `resize-zone resize-zone-${dir}`;
        zone.dataset.resizeDir = dir;
        node.appendChild(zone);
    });
    
    // Заголовок
    const header = document.createElement('div');
    header.className = 'workflow-node-header';
    
    // Кастомный цвет блока
    const blockColor = workflowColors[blockId];
    if (blockColor) {
        header.style.background = blockColor;
    }
    
    // Получаем метки скриптов и автоматизации для этого блока
    const scripts = getBlockScripts(block.id);
    const automation = getBlockAutomationFlags(block.id);
    
    let badgesHtml = scripts.filter(s => EMBEDDED_SCRIPTS[s]).map(s => 
        `<span class="script-badge" data-script="${s}" title="${EMBEDDED_SCRIPTS[s]?.label || s}">${EMBEDDED_SCRIPTS[s]?.badge || s[0].toUpperCase()}</span>`
    ).join('');
    
    // Добавляем automation badges
    if (automation.newProject) {
        badgesHtml += `<span class="automation-badge" data-automation="newProject" title="Новый проект">P</span>`;
    }
    if (automation.newChat) {
        badgesHtml += `<span class="automation-badge" data-automation="newChat" title="Новый чат">N</span>`;
    }
    
    // Иконка для кнопки collapse (chevron up/down)
    const collapseIcon = isCollapsed ? SVG_ICONS.chevronDown : SVG_ICONS.chevronUp;
    
    // Кнопка файлов для collapsed блоков (в хедере) - только если hasAttachments
    const filesCount = blockAttachments[blockId]?.length || 0;
    const collapsedFilesBtn = (isCollapsed && block.hasAttachments) ? `
        <button class="collapsed-files-btn" data-block-id="${blockId}" title="${filesCount > 0 ? 'Очистить файлы' : 'Прикрепить файлы'}">
            ${filesCount > 0 
                ? `<span class="files-count">${filesCount}</span>` 
                : SVG_ICONS.plus18
            }
        </button>
    ` : '';
    
    // Иконка ⓘ с tooltip для collapsed блоков с инструкцией
    const hasClickableInstruction = block.instruction?.type === 'input' && 
        block.instruction?.fields?.length > 0;
    const collapsedInstructionHint = (isCollapsed && block.instruction) ? `
        <div class="collapsed-instruction-hint" data-block-number="${block.number}">
            ${SVG_ICONS.footnote}
            <div class="collapsed-instruction-tooltip${hasClickableInstruction ? ' clickable' : ''}">
                <span class="collapsed-instruction-text">${escapeHtml(block.instruction.text || '')}</span>
            </div>
        </div>
    ` : '';
    
    // В edit mode добавляем кнопку удаления и метки скриптов
    if (isEditMode) {
        header.innerHTML = `
            <button class="workflow-collapse-btn" data-block-id="${blockId}" title="${isCollapsed ? 'Развернуть' : 'Свернуть'}">${collapseIcon}</button>
            ${collapsedFilesBtn}
            ${collapsedInstructionHint}
            <div class="workflow-node-title">${escapeHtml(block.title || 'Без названия')}</div>
            <div class="script-badges">${badgesHtml}</div>
            <button class="workflow-node-delete-btn" data-index="${index}" title="Удалить блок">
                <svg class="delete-icon-cross" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <svg class="delete-icon-check" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </button>
        `;
        
        // Клик по кнопке collapse
        header.querySelector('.workflow-collapse-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBlockCollapsed(blockId);
        });
        header.querySelector('.workflow-collapse-btn').addEventListener('mousedown', (e) => e.stopPropagation());
        
        // Клик по меткам убирает скрипт
        header.querySelectorAll('.script-badge').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                const scriptKey = badge.dataset.script;
                toggleBlockScript(block.id, scriptKey);
            });
        });
        
        // Клик по automation меткам
        header.querySelectorAll('.automation-badge').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleBlockAutomation(block.id, badge.dataset.automation);
            });
        });
    } else {
        // View mode - без кнопки collapse, но с badges и кнопкой файлов
        header.innerHTML = `
            ${collapsedFilesBtn}
            ${collapsedInstructionHint}
            <div class="workflow-node-title">${escapeHtml(block.title || 'Без названия')}</div>
            <div class="script-badges">${badgesHtml}</div>
        `;
    }
    
    // Обработчик клика по тексту инструкции в tooltip (если кликабельная)
    const hintEl = header.querySelector('.collapsed-instruction-hint');
    if (hintEl && hasClickableInstruction) {
        const tooltipText = hintEl.querySelector('.collapsed-instruction-text');
        if (tooltipText) {
            tooltipText.addEventListener('click', (e) => {
                e.stopPropagation();
                showDynamicInputModal(block.number);
            });
        }
    }
    // Предотвращаем drag при взаимодействии с hint
    if (hintEl) {
        hintEl.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    
    // Обработчик клика по кнопке файлов (в обоих режимах)
    const collapsedFilesBtnEl = header.querySelector('.collapsed-files-btn');
    if (collapsedFilesBtnEl) {
        collapsedFilesBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            // Если есть файлы - удаляем, иначе - добавляем
            if (blockAttachments[blockId] && blockAttachments[blockId].length > 0) {
                clearBlockAttachments(blockId);
            } else {
                attachFilesToBlock(blockId);
            }
        });
        collapsedFilesBtnEl.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    
    node.appendChild(header);
    
    // === ИНСТРУКЦИЯ ===
    const instructionEl = createWorkflowInstruction(block, index);
    if (instructionEl) {
        node.appendChild(instructionEl);
    }
    
    // Тело - textarea в edit mode, div в view mode
    if (isEditMode) {
        // Textarea для редактирования
        const body = document.createElement('textarea');
        body.className = 'workflow-node-textarea';
        body.dataset.blockId = block.id;
        body.dataset.index = index;
        body.value = block.content || '';
        body.placeholder = 'Введите содержимое блока...';
        
        // Устанавливаем activeTextarea при фокусе для работы кнопок Язык/UTF
        body.addEventListener('focus', () => {
            activeTextarea = body;
        });
        
        // Сохраняем при потере фокуса (force snapshot — граница редактирования)
        body.addEventListener('blur', () => {
            saveBlockContent(block.id, body.value, true);
        });
        
        // Debounced автосохранение при вводе (через 2 сек после последнего символа)
        let saveTimeout = null;
        body.addEventListener('input', () => {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                saveBlockContent(block.id, body.value);
            }, TIMEOUTS.DEBOUNCE_SAVE);
        });
        
        // Предотвращаем drag при редактировании
        body.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            // Выделяем блок при клике на textarea (без Ctrl - только этот блок)
            if (!e.ctrlKey && !selectedNodes.has(blockId)) {
                clearNodeSelection();
            }
            if (!selectedNodes.has(blockId)) {
                node.classList.add('selected');
                selectedNodes.add(blockId);
            }
        });
        
        node.appendChild(body);
    } else {
        const body = document.createElement('div');
        body.className = 'workflow-node-body';
        // Рендерим маркеры как оранжевые span-ы в режиме просмотра
        const content = block.content || '';
        if (hasLanguageMarkers(content)) {
            body.innerHTML = renderMarkedContent(content, currentLanguage, currentCountry);
        } else {
            body.textContent = stripFieldMarkers(content);
        }
        node.appendChild(body);
    }
    
    // Футер с кнопками
    const footer = document.createElement('div');
    footer.className = 'workflow-node-footer';
    
    // Кнопки отправки в чаты (всегда 3 чата)
    const chatTabs = [1, 2, 3];
    
    // Проверка доступности кнопок чата (для Project Binding)
    const showChatButtons = !isProjectActive() || isCurrentTabProjectOwner();
    const footerHtml = generateExpandedFooterHtml(index, chatTabs, { showChatButtons });
    
    // Оборачиваем кнопки в контейнер
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'workflow-node-footer-buttons';
    buttonsContainer.innerHTML = footerHtml;
    
    // === ПАНЕЛЬ ФАЙЛОВ (опционально) ===
    const hasFiles = blockAttachments[blockId] && blockAttachments[blockId].length > 0;
    
    if (block.hasAttachments) {
        // Секция прикреплённых файлов
        const attachmentsSection = document.createElement('div');
        attachmentsSection.className = 'workflow-node-attachments';
        attachmentsSection.dataset.blockId = blockId;
        
        // Кнопка прикрепления
        const attachBtn = document.createElement('button');
        attachBtn.className = 'workflow-attach-btn';
        attachBtn.title = 'Прикрепить файлы';
        attachBtn.innerHTML = SVG_ICONS.plus18;
        attachBtn.onclick = (e) => {
            e.stopPropagation();
            attachFilesToBlock(blockId);
        };
        attachmentsSection.appendChild(attachBtn);
        
        // Список прикреплённых файлов
        const filesList = document.createElement('div');
        filesList.className = 'workflow-attached-files';
        filesList.dataset.blockId = blockId;
        
        // Отображаем текущие прикреплённые файлы
        if (hasFiles) {
            blockAttachments[blockId].forEach((file, fileIndex) => {
                const fileChip = document.createElement('div');
                fileChip.className = 'workflow-file-chip';
                fileChip.innerHTML = `
                    <span class="file-name">${escapeHtml(file.name)}</span>
                    <button class="file-remove" data-block-id="${blockId}" data-file-index="${fileIndex}" title="Удалить файл">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                `;
                filesList.appendChild(fileChip);
            });
        }
        
        attachmentsSection.appendChild(filesList);
        
        // Кнопка удаления панели (только в edit mode)
        if (isEditMode) {
            const removePanel = document.createElement('button');
            removePanel.className = 'workflow-attachments-remove';
            removePanel.dataset.blockId = blockId;
            removePanel.title = 'Убрать панель файлов';
            removePanel.innerHTML = `
                <svg class="delete-icon-cross" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <svg class="delete-icon-check" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            `;
            removePanel.addEventListener('click', (e) => {
                e.stopPropagation();
                
                if (removePanel.classList.contains('confirm-mode')) {
                    // Второй клик - удаляем
                    toggleAttachmentsPanel(blockId, false);
                } else {
                    // Первый клик - режим подтверждения
                    document.querySelectorAll('.workflow-attachments-remove.confirm-mode').forEach(btn => {
                        btn.classList.remove('confirm-mode');
                    });
                    removePanel.classList.add('confirm-mode');
                    
                    const resetConfirm = (evt) => {
                        if (!removePanel.contains(evt.target)) {
                            removePanel.classList.remove('confirm-mode');
                            document.removeEventListener('click', resetConfirm, true);
                        }
                    };
                    setTimeout(() => {
                        document.addEventListener('click', resetConfirm, true);
                    }, 0);
                }
            });
            removePanel.addEventListener('mousedown', (e) => e.stopPropagation());
            attachmentsSection.appendChild(removePanel);
        }
        
        // Обработчик удаления файлов
        attachmentsSection.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.file-remove');
            if (removeBtn) {
                e.stopPropagation();
                const bid = removeBtn.dataset.blockId;
                const fileIdx = parseInt(removeBtn.dataset.fileIndex);
                removeAttachmentFromBlock(bid, fileIdx);
            }
        });
        
        // Добавляем attachments перед footer
        node.appendChild(attachmentsSection);
        
    } else if (isEditMode) {
        // Кнопка добавления панели файлов (только в edit mode)
        const addAttachBtn = document.createElement('div');
        addAttachBtn.className = 'workflow-attachments-add';
        addAttachBtn.innerHTML = `
            <div class="flex items-center gap-2 flex-1">
                ${SVG_ICONS.plus18}
                <span>Добавить файлы</span>
            </div>
        `;
        addAttachBtn.onclick = (e) => {
            e.stopPropagation();
            toggleAttachmentsPanel(blockId, true);
        };
        addAttachBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        node.appendChild(addAttachBtn);
    }
    
    // Добавляем кнопки в footer
    footer.appendChild(buttonsContainer);
    
    // Бейдж привязки к чату
    if (block.chatTab) {
        const badge = document.createElement('div');
        badge.className = 'workflow-node-chat-badge';
        badge.textContent = block.chatTab;
        badge.title = `Привязан к Чату ${block.chatTab}`;
        badge.onclick = (e) => {
            e.stopPropagation();
            selectChatForNode(index);
        };
        node.appendChild(badge);
    }
    
    node.appendChild(footer);
    
    // События
    setupNodeEvents(node, index);
    
    return node;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER NODE CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Создание DOM элемента scraper-ноды
 */
function createScraperNode(scraper) {
    const scraperId = scraper.id;
    const pos = workflowPositions[scraperId] || {x: 120, y: 120};
    const size = workflowSizes[scraperId] || {};
    
    const node = document.createElement('div');
    node.className = 'workflow-node scraper-node';
    node.dataset.blockId = scraperId;
    node.style.left = pos.x + 'px';
    node.style.top = pos.y + 'px';
    if (size.width) node.style.width = size.width + 'px';
    
    // 4 порта — как у обычных блоков
    const sides = ['top', 'right', 'bottom', 'left'];
    sides.forEach(side => {
        const port = document.createElement('div');
        port.className = `workflow-port workflow-port-${side}`;
        port.dataset.side = side;
        port.dataset.blockId = scraperId;
        node.appendChild(port);
        setupPortEvents(port);
    });
    
    // Resize zones — как у обычных блоков
    const resizeDirections = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
    resizeDirections.forEach(dir => {
        const zone = document.createElement('div');
        zone.className = `resize-zone resize-zone-${dir}`;
        zone.dataset.resizeDir = dir;
        node.appendChild(zone);
    });
    
    const geoLabel = (typeof currentCountry === 'string' && currentCountry)
        ? currentCountry.toUpperCase()
        : (typeof currentLanguage === 'string' && currentLanguage) ? currentLanguage.toUpperCase() : '—';
    
    // Header — скрыт через CSS, но нужен для стандартного поведения
    const header = document.createElement('div');
    header.className = 'workflow-node-header';
    node.appendChild(header);
    
    // Delete button — абсолютное позиционирование, edit mode only
    if (isEditMode) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'scraper-delete-btn';
        deleteBtn.title = 'Удалить скрапер';
        deleteBtn.innerHTML = `
            <svg class="delete-icon-cross" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <svg class="delete-icon-check" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
        `;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (deleteBtn.classList.contains('confirm-mode')) {
                deleteScraperBlock(scraperId);
            } else {
                document.querySelectorAll('.scraper-delete-btn.confirm-mode').forEach(btn => btn.classList.remove('confirm-mode'));
                deleteBtn.classList.add('confirm-mode');
                const resetConfirm = (evt) => {
                    if (!deleteBtn.contains(evt.target)) {
                        deleteBtn.classList.remove('confirm-mode');
                        document.removeEventListener('click', resetConfirm, true);
                    }
                };
                setTimeout(() => document.addEventListener('click', resetConfirm, true), 0);
            }
        });
        deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        node.appendChild(deleteBtn);
        
        // Drag — на всей ноде кроме inputs/buttons/ports
        node.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('input, button, .workflow-port')) return;
            if (!isEditMode) return;
            
            e.preventDefault();
            
            if (isDraggingNode) {
                document.removeEventListener('mousemove', onNodeDrag);
                document.removeEventListener('mouseup', onNodeDragEnd);
                document.querySelectorAll('.workflow-node.dragging').forEach(n => n.classList.remove('dragging'));
                clearGridOverlay();
            }
            
            isDraggingNode = true;
            UndoManager.snapshot(true);
            node.classList.add('dragging');
            
            document.querySelectorAll('.workflow-node.collapsed').forEach(n => n.classList.add('hide-buttons'));
            
            if (e.ctrlKey) {
                if (selectedNodes.has(scraperId)) { selectedNodes.delete(scraperId); node.classList.remove('selected'); }
                else { selectedNodes.add(scraperId); node.classList.add('selected'); }
            } else {
                if (!selectedNodes.has(scraperId)) { clearNodeSelection(); node.classList.add('selected'); selectedNodes.add(scraperId); }
            }
            
            const container = getWorkflowContainer();
            container?.classList.add('dragging');
            
            const containerRect = container.getBoundingClientRect();
            const canvasPos = screenToCanvas(e.clientX - containerRect.left, e.clientY - containerRect.top);
            
            dragOffsets = {};
            selectedNodes.forEach(id => {
                const p = getItemPosition(id) || {x: 0, y: 0};
                dragOffsets[id] = { x: canvasPos.x - p.x, y: canvasPos.y - p.y };
            });
            
            document.addEventListener('mousemove', onNodeDrag);
            document.addEventListener('mouseup', onNodeDragEnd);
        });
    }
    
    // === BODY — workflow-node-body ===
    const body = document.createElement('div');
    body.className = 'workflow-node-body';
    
    const kwLabel = document.createElement('label');
    kwLabel.textContent = 'Ключевое слово';
    body.appendChild(kwLabel);
    
    const kwInput = document.createElement('input');
    kwInput.type = 'text';
    kwInput.placeholder = 'Введите ключевое слово или фразу...';
    kwInput.value = scraper.keyword || '';
    kwInput.addEventListener('change', () => {
        const tabs = getAllTabs();
        const item = tabs[currentTab]?.items?.find(i => i.id === scraperId);
        if (item) {
            item.keyword = kwInput.value;
            saveAllTabs(tabs);
            renderWorkflow(true); // Обновить {{SERP:id}} в блоках
        }
    });
    body.appendChild(kwInput);
    
    const geoLabelEl = document.createElement('label');
    geoLabelEl.textContent = 'GEO';
    body.appendChild(geoLabelEl);
    
    const geoInput = document.createElement('input');
    geoInput.type = 'text';
    geoInput.className = 'scraper-geo-input';
    geoInput.value = geoLabel;
    geoInput.readOnly = true;
    geoInput.tabIndex = -1;
    body.appendChild(geoInput);
    
    node.appendChild(body);
    
    // Result
    if (scraper.result) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'scraper-result';
        resultDiv.textContent = `✓ ${scraper.result.serpCount || 0} pages · GEO: ${(scraper.result.geo || '').toUpperCase()}`;
        node.appendChild(resultDiv);
    }
    
    // Progress bar
    const progressWrap = document.createElement('div');
    progressWrap.className = 'scraper-progress';
    progressWrap.id = `scraper-progress-${scraperId}`;
    const progressBar = document.createElement('div');
    progressBar.className = 'scraper-progress-bar';
    progressWrap.appendChild(progressBar);
    node.appendChild(progressWrap);
    
    // === FOOTER — workflow-node-footer ===
    const footer = document.createElement('div');
    footer.className = 'workflow-node-footer';
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'workflow-node-footer-buttons';
    
    const startBtn = document.createElement('button');
    startBtn.className = 'workflow-node-btn primary scraper-start-btn';
    startBtn.dataset.scraperId = scraperId;
    startBtn.innerHTML = '<span>Start</span>';
    if (!scraper.keyword) startBtn.disabled = true;
    
    kwInput.addEventListener('input', () => { startBtn.disabled = !kwInput.value.trim(); });
    startBtn.addEventListener('click', (e) => { e.stopPropagation(); runScraper(scraperId); });
    
    buttonsContainer.appendChild(startBtn);
    
    // Gear button — в footer, только edit mode
    if (isEditMode) {
        const gearBtn = document.createElement('button');
        gearBtn.className = 'scraper-gear-btn';
        gearBtn.title = 'Настроить запросы';
        gearBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>`;
        gearBtn.addEventListener('click', (e) => { e.stopPropagation(); showScraperQueriesModal(scraperId); });
        buttonsContainer.appendChild(gearBtn);
    }
    
    footer.appendChild(buttonsContainer);
    node.appendChild(footer);
    
    return node;
}

/**
 * Удалить scraper-блок
 */
function deleteScraperBlock(scraperId) {
    UndoManager.snapshot(true);
    const tabs = getAllTabs();
    if (tabs[currentTab]) {
        tabs[currentTab].items = tabs[currentTab].items.filter(i => i.id !== scraperId);
        saveAllTabs(tabs);
    }
    delete workflowPositions[scraperId];
    delete workflowSizes[scraperId];
    delete workflowColors[scraperId];
    // Remove connections
    if (typeof workflowConnections !== 'undefined') {
        const before = workflowConnections.length;
        workflowConnections = workflowConnections.filter(c => c.from !== scraperId && c.to !== scraperId);
        if (workflowConnections.length !== before) saveWorkflowState();
    }
    renderWorkflow(true);
    saveWorkflowState();
}
window.deleteScraperBlock = deleteScraperBlock;

/**
 * Запуск скрапинга
 */
// Таймер для уничтожения scraper WebView после завершения
let _scraperDestroyTimer = null;

function scheduleScraperDestroy() {
    clearTimeout(_scraperDestroyTimer);
    _scraperDestroyTimer = setTimeout(async () => {
        try {
            await window.__TAURI__.core.invoke('destroy_scraper_webview');
        } catch (_) {}
    }, 30000); // 30 сек
}

async function runScraper(scraperId) {
    const tabs = getAllTabs();
    const items = tabs[currentTab]?.items;
    if (!items) return;
    const scraper = items.find(i => i.id === scraperId);
    if (!scraper || !scraper.keyword) {
        showToast('⚠️ Введите ключевое слово');
        return;
    }
    
    // Confirm при повторном скрапе
    if (scraper.result) {
        const btn = document.querySelector(`.scraper-start-btn[data-scraper-id="${scraperId}"]`);
        if (btn && !btn.classList.contains('confirm-rescrape')) {
            btn.classList.add('confirm-rescrape');
            btn.innerHTML = '<span>Повторить?</span>';
            setTimeout(() => {
                btn.classList.remove('confirm-rescrape');
                btn.innerHTML = '<span>Start</span>';
            }, 3000);
            return;
        }
        if (btn) btn.classList.remove('confirm-rescrape');
    }
    
    // Отменить destroy timer если был запланирован
    clearTimeout(_scraperDestroyTimer);
    
    // Resolve markers in keyword
    const keyword = resolveMarkersToText(scraper.keyword, currentLanguage, currentCountry);
    const geo = currentCountry || currentLanguage || 'us';
    const lang = currentLanguage || 'en';
    
    // Если запросы не настроены — скрапим просто по ключу
    const queries = (scraper.queries && scraper.queries.length > 0)
        ? scraper.queries
        : [{ suffix: '', prefix: 'serp', num: 10 }];
    
    // Update button UI
    const btn = document.querySelector(`.scraper-start-btn[data-scraper-id="${scraperId}"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<span>Scraping...</span>'; }
    
    const progressEl = document.getElementById(`scraper-progress-${scraperId}`);
    
    // Listen for progress
    let unlisten;
    try {
        unlisten = await window.__TAURI__.event.listen('scraper-progress', (event) => {
            const p = event.payload;
            if (progressEl) {
                progressEl.classList.add('active');
                const bar = progressEl.querySelector('.scraper-progress-bar');
                if (bar && p.total > 0) {
                    const pct = Math.max(2, Math.round((p.current / p.total) * 100));
                    bar.style.width = Math.min(100, pct) + '%';
                }
            }
        });
    } catch (_) {}
    
    try {
        const resultStr = await window.__TAURI__.core.invoke('scrape_google_serp', {
            keyword, geo, numResults: 10, lang,
            queries: JSON.stringify(queries)
        });
        
        const result = JSON.parse(resultStr);
        
        // Save result to scraper item
        scraper.result = {
            serpCount: result.page_files?.length || 0,
            pageFiles: result.page_files || [],
            geo: result.geo,
            lang,
            keyword
        };
        saveAllTabs(tabs);
        
        showToast(`✅ SERP: ${scraper.result.serpCount} pages saved`);
        
        renderWorkflow(true);
        
        // Auto-chain: trigger next block if connected
        if (typeof onScrapeComplete === 'function') {
            await onScrapeComplete(scraper);
        }
        
    } catch (e) {
        const errorMsg = String(e);
        if (errorMsg.includes('0 organic results') || errorMsg.includes('captcha')) {
            showToast(`⚠️ SERP: ${errorMsg}`);
        } else {
            showToast(`❌ SERP: ${errorMsg.slice(0, 80)}`);
        }
    } finally {
        if (unlisten) unlisten();
        if (progressEl) {
            progressEl.classList.remove('active');
            const bar = progressEl.querySelector('.scraper-progress-bar');
            if (bar) bar.style.width = '0%';
        }
        if (btn) { btn.disabled = false; btn.innerHTML = '<span>Start</span>'; }
        scheduleScraperDestroy();
    }
}
window.runScraper = runScraper;

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER QUERY CONSTRUCTOR
// ═══════════════════════════════════════════════════════════════════════════

let _scraperQueriesTarget = null;

let _scraperModalInitialized = false;

function showScraperQueriesModal(scraperId) {
    _scraperQueriesTarget = scraperId;
    
    // Lazy init listeners при первом вызове
    if (!_scraperModalInitialized) {
        _scraperModalInitialized = true;
        const addBtn = document.getElementById('add-scraper-query-btn');
        const saveBtn = document.getElementById('save-scraper-queries-btn');
        const cancelBtn = document.getElementById('cancel-scraper-queries-btn');
        const modal = document.getElementById('scraper-queries-modal');
        if (addBtn) addBtn.addEventListener('click', () => addScraperQueryField());
        if (saveBtn) saveBtn.addEventListener('click', saveScraperQueries);
        if (cancelBtn) cancelBtn.addEventListener('click', hideScraperQueriesModal);
        if (modal) modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) hideScraperQueriesModal();
        });
    }
    
    const tabs = getAllTabs();
    const scraper = tabs[currentTab]?.items?.find(i => i.id === scraperId);
    const queries = scraper?.queries || [];
    
    const container = document.getElementById('scraper-query-fields');
    container.innerHTML = '';
    
    if (queries.length > 0) {
        queries.forEach((q, i) => addScraperQueryField(q, i));
    } else {
        addScraperQueryField({}, 0);
    }
    updateScraperAddBtn();
    
    document.getElementById('scraper-queries-modal').classList.add('open');
}

function hideScraperQueriesModal() {
    document.getElementById('scraper-queries-modal').classList.remove('open');
    _scraperQueriesTarget = null;
}

function addScraperQueryField(data = {}, index = null) {
    const container = document.getElementById('scraper-query-fields');
    if (index === null) index = container.children.length;
    if (index >= 10) return;
    
    const div = document.createElement('div');
    div.className = 'constructor-field bg-gray-50 rounded-lg p-3 border border-gray-200';
    div.dataset.queryIndex = index;
    
    div.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="text-xs font-medium text-gray-500">Запрос ${index + 1}</span>
            <button type="button" class="remove-query-btn text-gray-400 hover:text-red-500 transition-colors" title="Удалить">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
        <div class="space-y-2">
            <input type="text" class="query-suffix w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none" 
                   placeholder="Введите запрос" value="${escapeHtml(data.suffix || '')}">
            <div class="flex gap-2">
                <input type="text" class="query-prefix flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none" 
                       placeholder="Префикс файла" value="${escapeHtml(data.prefix || '')}" maxlength="10">
                <input type="number" class="query-num w-16 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none text-center" 
                       placeholder="N" value="${data.num || 5}" min="1" max="10">
            </div>
        </div>
    `;
    
    const removeBtn = div.querySelector('.remove-query-btn');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            div.remove();
            reindexScraperQueryFields();
            updateScraperAddBtn();
        });
    }
    
    container.appendChild(div);
    updateScraperAddBtn();
}

function reindexScraperQueryFields() {
    const container = document.getElementById('scraper-query-fields');
    container.querySelectorAll('[data-query-index]').forEach((div, i) => {
        div.dataset.queryIndex = i;
        div.querySelector('.text-xs.font-medium').textContent = `Запрос ${i + 1}`;
    });
}

function updateScraperAddBtn() {
    const container = document.getElementById('scraper-query-fields');
    const btn = document.getElementById('add-scraper-query-btn');
    if (btn) btn.classList.toggle('hidden', container.children.length >= 10);
}

function saveScraperQueries() {
    const container = document.getElementById('scraper-query-fields');
    const queries = [];
    
    container.querySelectorAll('[data-query-index]').forEach(div => {
        queries.push({
            suffix: div.querySelector('.query-suffix')?.value || '',
            prefix: div.querySelector('.query-prefix')?.value || 'page',
            num: parseInt(div.querySelector('.query-num')?.value) || 5,
        });
    });
    
    if (_scraperQueriesTarget) {
        const tabs = getAllTabs();
        const scraper = tabs[currentTab]?.items?.find(i => i.id === _scraperQueriesTarget);
        if (scraper) {
            scraper.queries = queries;
            saveAllTabs(tabs);
        }
    }
    
    hideScraperQueriesModal();
}

window.showScraperQueriesModal = showScraperQueriesModal;

/**
 * Создание элемента инструкции для workflow блока
 */
function createWorkflowInstruction(block, index) {
    const blockNumber = block.number;
    
    if (block.instruction) {
        const strip = document.createElement('div');
        const safeText = escapeHtml(block.instruction.text || '');
        const iconType = block.instruction.icon || 'info';
        const iconSvg = getInstructionIconSvg(iconType);
        
        if (isEditMode) {
            // Режим редактирования - поле ввода и кнопки
            strip.className = 'workflow-instruction-strip edit-mode';
            strip.innerHTML = `
                <div class="flex items-center gap-2 flex-1">
                    ${iconSvg}
                    <input type="text" 
                           class="workflow-instruction-input" 
                           value="${safeText}" 
                           data-block-number="${blockNumber}"
                           data-block-id="${block.id}"
                           placeholder="Текст инструкции"
                           maxlength="100">
                </div>
                <button class="workflow-instruction-config" data-block-number="${blockNumber}" title="Настроить поля">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
                <button class="workflow-instruction-remove" data-block-number="${blockNumber}" title="Удалить инструкцию">
                    <svg class="delete-icon-cross" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <svg class="delete-icon-check" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </button>
            `;
            
            // Обработчики
            const input = strip.querySelector('.workflow-instruction-input');
            input?.addEventListener('change', (e) => {
                const newText = e.target.value.trim();
                if (newText) {
                    updateBlockInstruction(currentTab, blockNumber, { 
                        ...block.instruction,
                        text: newText 
                    });
                }
            });
            input?.addEventListener('click', (e) => e.stopPropagation());
            input?.addEventListener('mousedown', (e) => e.stopPropagation());
            
            const configBtn = strip.querySelector('.workflow-instruction-config');
            configBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                showInputConstructorModal(blockNumber);
            });
            configBtn?.addEventListener('mousedown', (e) => e.stopPropagation());
            
            const removeBtn = strip.querySelector('.workflow-instruction-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    if (removeBtn.classList.contains('confirm-mode')) {
                        // Второй клик - удаляем
                        removeBlockInstruction(blockNumber);
                        renderWorkflow(true);
                    } else {
                        // Первый клик - режим подтверждения
                        document.querySelectorAll('.workflow-instruction-remove.confirm-mode').forEach(btn => {
                            btn.classList.remove('confirm-mode');
                        });
                        removeBtn.classList.add('confirm-mode');
                        
                        const resetConfirm = (evt) => {
                            if (!removeBtn.contains(evt.target)) {
                                removeBtn.classList.remove('confirm-mode');
                                document.removeEventListener('click', resetConfirm, true);
                            }
                        };
                        setTimeout(() => {
                            document.addEventListener('click', resetConfirm, true);
                        }, 0);
                    }
                });
                removeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            }
            
        } else {
            // View mode
            strip.className = 'workflow-instruction-strip view-mode';
            
            if (block.instruction.type === 'input' && block.instruction.fields && block.instruction.fields.length > 0) {
                // Кликабельная инструкция с полями
                strip.innerHTML = `
                    ${iconSvg}
                    <button class="workflow-instruction-btn">
                        ${safeText}
                    </button>
                `;
                strip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showDynamicInputModal(blockNumber);
                });
            } else {
                // Обычная информационная инструкция
                strip.innerHTML = `
                    ${iconSvg}
                    <span>${safeText}</span>
                `;
            }
        }
        
        return strip;
        
    } else if (isEditMode) {
        // Кнопка добавления инструкции (только в edit mode)
        const addBtn = document.createElement('div');
        addBtn.className = 'workflow-instruction-add';
        addBtn.innerHTML = `
            <div class="flex items-center gap-2 flex-1">
                ${SVG_ICONS.plus18}
                <span>Добавить инструкцию</span>
            </div>
        `;
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addBlockInstruction(blockNumber, 'info');
            renderWorkflow(true);
        });
        addBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        return addBtn;
    }
    
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW NOTE CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Создание элемента заметки для workflow canvas
 * @param {Object} note - {id, text, x, y, width, height}
 * @param {number} index - индекс в массиве workflowNotes
 * @returns {HTMLElement}
 */
function createWorkflowNote(note, index) {
    const el = document.createElement('div');
    el.className = 'workflow-note';
    el.dataset.noteId = note.id;
    el.dataset.noteIndex = index;
    el.style.left = (note.x || 0) + 'px';
    el.style.top = (note.y || 0) + 'px';
    el.style.width = (note.width || 280) + 'px';
    el.style.height = (note.height || 160) + 'px';
    
    if (isEditMode) {
        // Drag handle — полоска сверху
        const handle = document.createElement('div');
        handle.className = 'workflow-note-handle';
        el.appendChild(handle);
        
        // Textarea
        const textarea = document.createElement('textarea');
        textarea.className = 'workflow-note-text';
        textarea.value = note.text || '';
        textarea.placeholder = 'Заметка...';
        textarea.addEventListener('input', () => {
            note.text = textarea.value;
            saveWorkflowState();
        });
        textarea.addEventListener('mousedown', (e) => e.stopPropagation());
        el.appendChild(textarea);
        
        // Resize zones — 8 направлений (как у блоков)
        ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].forEach(dir => {
            const zone = document.createElement('div');
            zone.className = `resize-zone resize-zone-${dir}`;
            zone.dataset.resizeDir = dir;
            el.appendChild(zone);
            setupNoteResize(zone, dir, el, note);
        });
        
        // Drag по handle
        setupNoteDrag(handle, el, note);
    } else {
        // View mode — просто текст
        const textDiv = document.createElement('div');
        textDiv.className = 'workflow-note-text view';
        textDiv.textContent = note.text || '';
        el.appendChild(textDiv);
    }
    
    return el;
}

/**
 * Drag handler для заметки — интегрирован с глобальной системой выделения и multi-drag
 */
function setupNoteDrag(handle, el, note) {
    handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !isEditMode) return;
        
        e.preventDefault();
        
        const noteId = note.id;
        
        // Сбрасываем предыдущее состояние drag
        if (isDraggingNode) {
            document.removeEventListener('mousemove', onNodeDrag);
            document.removeEventListener('mouseup', onNodeDragEnd);
            document.querySelectorAll('.workflow-node.dragging, .workflow-note.dragging').forEach(n => n.classList.remove('dragging'));
            clearGridOverlay();
        }
        
        isDraggingNode = true;
        UndoManager.snapshot(true);
        el.classList.add('dragging');
        
        // Логика выделения (как для блоков)
        if (e.ctrlKey) {
            if (selectedNodes.has(noteId)) {
                selectedNodes.delete(noteId);
                el.classList.remove('selected');
            } else {
                selectedNodes.add(noteId);
                el.classList.add('selected');
            }
        } else {
            if (!selectedNodes.has(noteId)) {
                clearNodeSelection();
                el.classList.add('selected');
                selectedNodes.add(noteId);
            }
        }
        
        // Контейнер dragging
        const container = getWorkflowContainer();
        container?.classList.add('dragging');
        
        const containerRect = container.getBoundingClientRect();
        const canvasPos = screenToCanvas(e.clientX - containerRect.left, e.clientY - containerRect.top);
        const cursorCanvasX = canvasPos.x;
        const cursorCanvasY = canvasPos.y;
        
        // dragOffsets для всех выделенных
        dragOffsets = {};
        selectedNodes.forEach(id => {
            const pos = getItemPosition(id) || {x: 0, y: 0};
            dragOffsets[id] = {
                x: cursorCanvasX - pos.x,
                y: cursorCanvasY - pos.y
            };
        });
        
        document.addEventListener('mousemove', onNodeDrag);
        document.addEventListener('mouseup', onNodeDragEnd);
    });
}

/**
 * Resize handler для заметки (нижний правый угол)
 */
function setupNoteResize(zone, dir, el, note) {
    zone.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        
        const container = getWorkflowContainer();
        const containerRect = container.getBoundingClientRect();
        const gridSize = WORKFLOW_CONFIG.GRID_SIZE;
        
        const startW = note.width || 280;
        const startH = note.height || 160;
        const startX = note.x || 0;
        const startY = note.y || 0;
        const startPos = screenToCanvas(e.clientX - containerRect.left, e.clientY - containerRect.top);
        
        const onMove = (ev) => {
            const curPos = screenToCanvas(ev.clientX - containerRect.left, ev.clientY - containerRect.top);
            const dx = curPos.x - startPos.x;
            const dy = curPos.y - startPos.y;
            
            let newW = startW, newH = startH, newX = startX, newY = startY;
            
            if (dir.includes('e')) newW = startW + dx;
            if (dir.includes('w')) { newW = startW - dx; newX = startX + dx; }
            if (dir.includes('s')) newH = startH + dy;
            if (dir.includes('n')) { newH = startH - dy; newY = startY + dy; }
            
            // Snap to grid
            newW = Math.round(newW / gridSize) * gridSize;
            newH = Math.round(newH / gridSize) * gridSize;
            newX = Math.round(newX / gridSize) * gridSize;
            newY = Math.round(newY / gridSize) * gridSize;
            
            // Минимальные размеры — не двигать позицию если упёрлись
            if (newW < 160) { newW = 160; if (dir.includes('w')) newX = startX + startW - 160; }
            if (newH < 80) { newH = 80; if (dir.includes('n')) newY = startY + startH - 80; }
            
            note.width = newW;
            note.height = newH;
            note.x = newX;
            note.y = newY;
            el.style.width = newW + 'px';
            el.style.height = newH + 'px';
            el.style.left = newX + 'px';
            el.style.top = newY + 'px';
        };
        
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            saveWorkflowState();
        };
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * События для ноды (drag, click, resize)
 */
function setupNodeEvents(node, index) {
    const header = node.querySelector('.workflow-node-header');
    const blockId = node.dataset.blockId;
    
    // Кнопка удаления блока с двухступенчатым подтверждением
    const deleteBtn = header.querySelector('.workflow-node-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            if (deleteBtn.classList.contains('confirm-mode')) {
                // Второй клик - удаляем
                deleteWorkflowBlock(index);
            } else {
                // Первый клик - переходим в режим подтверждения
                // Сначала сбрасываем все другие кнопки
                document.querySelectorAll('.workflow-node-delete-btn.confirm-mode').forEach(btn => {
                    btn.classList.remove('confirm-mode');
                });
                deleteBtn.classList.add('confirm-mode');
                
                // При клике в любое другое место - сбрасываем
                const resetConfirm = (evt) => {
                    if (!deleteBtn.contains(evt.target)) {
                        deleteBtn.classList.remove('confirm-mode');
                        document.removeEventListener('click', resetConfirm, true);
                    }
                };
                // Добавляем с задержкой чтобы не сработало сразу
                setTimeout(() => {
                    document.addEventListener('click', resetConfirm, true);
                }, 0);
            }
        });
        deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    
    header.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        // Не начинаем drag если кликнули на кнопку удаления или collapse
        if (e.target.closest('.workflow-node-delete-btn')) return;
        if (e.target.closest('.workflow-collapse-btn')) return;
        // Проверяем режим редактирования
        if (!isEditMode) return;
        
        e.preventDefault();
        
        // Сбрасываем предыдущее состояние drag если осталось
        if (isDraggingNode) {
            document.removeEventListener('mousemove', onNodeDrag);
            document.removeEventListener('mouseup', onNodeDragEnd);
            document.querySelectorAll('.workflow-node.dragging').forEach(n => n.classList.remove('dragging'));
            clearGridOverlay();
        }
        
        isDraggingNode = true;
        
        // Snapshot позиций ДО начала перемещения
        UndoManager.snapshot(true);
        
        node.classList.add('dragging');
        
        // Скрываем кнопки у всех collapsed блоков при перемещении
        document.querySelectorAll('.workflow-node.collapsed').forEach(n => {
            n.classList.add('hide-buttons');
        });
        
        // Логика выделения
        if (e.ctrlKey) {
            // Ctrl+click - toggle выделения
            if (selectedNodes.has(blockId)) {
                selectedNodes.delete(blockId);
                node.classList.remove('selected');
            } else {
                selectedNodes.add(blockId);
                node.classList.add('selected');
            }
        } else {
            // Обычный клик
            if (!selectedNodes.has(blockId)) {
                // Снимаем выделение с других и выделяем только эту
                clearNodeSelection();
                node.classList.add('selected');
                selectedNodes.add(blockId);
            }
            // Если уже выделена - оставляем как есть (для multi-drag)
        }
        
        // Добавляем класс dragging к контейнеру для подсветки сетки
        const container = getWorkflowContainer();
        container?.classList.add('dragging');
        
        // Вычисляем offset для всех выделенных нод
        const containerRect = container.getBoundingClientRect();
        const canvasPos = screenToCanvas(e.clientX - containerRect.left, e.clientY - containerRect.top);
        const cursorCanvasX = canvasPos.x;
        const cursorCanvasY = canvasPos.y;
        
        dragOffsets = {};
        selectedNodes.forEach(id => {
            const pos = getItemPosition(id) || {x: 0, y: 0};
            dragOffsets[id] = {
                x: cursorCanvasX - pos.x,
                y: cursorCanvasY - pos.y
            };
        });
        
        document.addEventListener('mousemove', onNodeDrag);
        document.addEventListener('mouseup', onNodeDragEnd);
    });
    
    node.addEventListener('click', (e) => {
        if (isDraggingNode) return;
        if (!isEditMode) return; // Выделение только в режиме редактирования
        
        // Не обрабатываем клик если он был на интерактивных элементах
        if (e.target.closest('.workflow-node-header')) return;
        if (e.target.closest('textarea')) return;
        if (e.target.closest('button')) return;
        if (e.target.closest('.workflow-node-footer')) return;
        
        if (e.ctrlKey) {
            // Ctrl+click - добавить/удалить из выделения
            if (selectedNodes.has(blockId)) {
                selectedNodes.delete(blockId);
                node.classList.remove('selected');
            } else {
                selectedNodes.add(blockId);
                node.classList.add('selected');
            }
        } else {
            // Обычный click - выделить только эту ноду
            clearNodeSelection();
            node.classList.add('selected');
            selectedNodes.add(blockId);
        }
    });
    
    // Двойной клик на заголовке - открыть модалку редактирования
    header.addEventListener('dblclick', (e) => {
        // Не открываем если кликнули на кнопку удаления
        if (e.target.closest('.workflow-node-delete-btn')) return;
        
        editWorkflowNode(index);
    });
    
    // Обработка ресайза через невидимые зоны
    node.querySelectorAll('.resize-zone').forEach(zone => {
        zone.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (!isEditMode) return;
            
            // Не ресайзим collapsed блоки
            if (node.classList.contains('collapsed')) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            // Сбрасываем предыдущее состояние если осталось
            if (isResizingNode) {
                document.removeEventListener('mousemove', onNodeResize);
                document.removeEventListener('mouseup', onNodeResizeEnd);
                if (resizeNode) resizeNode.classList.remove('resizing');
            }
            
            const dir = zone.dataset.resizeDir;
            
            isResizingNode = true;
            
            // Snapshot размеров ДО начала ресайза
            UndoManager.snapshot(true);
            
            resizeNode = node;
            resizeDirection = dir;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            resizeStartWidth = node.offsetWidth;
            resizeStartHeight = node.offsetHeight;
            resizeStartLeft = parseFloat(node.style.left) || 0;
            resizeStartTop = parseFloat(node.style.top) || 0;
            
            node.classList.add('resizing');
            
            document.addEventListener('mousemove', onNodeResize);
            document.addEventListener('mouseup', onNodeResizeEnd);
        });
    });
    
    // Клик по collapsed блоку во view mode
    // Оффлайн: копировать промпт (всегда). Онлайн: отправить в текущий чат Claude
    // Только если блок не заблокирован проектом (не имеет класс project-restricted) — кроме оффлайн
    const canClickCollapsed = !isEditMode && node.classList.contains('collapsed') && 
        (isOfflineMode() || !node.classList.contains('project-restricted'));
    if (canClickCollapsed) {
        node.addEventListener('click', (e) => {
            if (isOfflineMode()) {
                copyNodeContent(index);
            } else {
                sendNodeToClaude(index, activeClaudeTab);
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT MODAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Открыть модалку редактирования ноды
 */
function editWorkflowNode(index) {
    // Получаем блоки текущей вкладки
    const blocks = getTabBlocks(currentTab);
    
    if (blocks[index]) {
        // Переключаемся в режим редактирования промпта
        const block = blocks[index];
        // Используем существующий механизм - открываем модальное окно редактирования
        showBlockEditModal(block, index);
    }
}

/**
 * Показать модальное окно редактирования блока
 */
function showBlockEditModal(block, index) {
    // Создаём модальное окно для редактирования если его нет
    let modal = getEditModal();
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'workflow-edit-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content workflow-edit-modal-content" onclick="event.stopPropagation(); hideContextMenu()">
                <h3 id="workflow-edit-header" class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Редактировать блок</h3>
                <div class="mb-3">
                    <div class="flex items-center justify-between mb-1">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Название</label>
                        <span id="workflow-edit-title-counter" class="text-xs text-gray-400">0/30</span>
                    </div>
                    <input type="text" id="workflow-edit-title" maxlength="30"
                           class="w-full px-4 py-2 border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none">
                </div>
                <div id="modal-instruction-section" class="mb-3" style="display: none;">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Инструкция</label>
                        <div id="modal-instruction-empty">
                            <button id="modal-instruction-add-btn" class="modal-instruction-add-compact">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
                                </svg>
                                <span>Добавить</span>
                            </button>
                        </div>
                        <div id="modal-instruction-filled" style="display: none;">
                            <div class="modal-instruction-field">
                                <input type="text" id="modal-instruction-text" maxlength="100"
                                       class="w-full px-4 py-2 border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none"
                                       placeholder="Текст инструкции">
                                <div class="modal-instruction-actions">
                                    <button id="modal-instruction-config-btn" class="modal-instruction-action-btn" title="Настроить поля">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </button>
                                    <button id="modal-instruction-remove-btn" class="modal-instruction-action-btn" title="Удалить инструкцию">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="modal-content-header" class="flex items-center justify-between mb-1">
                        <label id="modal-content-label" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Содержимое</label>
                        <div id="modal-toolbar-btns" class="flex items-center gap-2">
                            <button id="modal-lang-btn" class="edit-toolbar-btn" title="Вставить форму языка">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                </svg>
                                <span>Язык</span>
                            </button>
                            <button id="modal-serp-btn" class="edit-toolbar-btn" title="Вставить ключ скрапера">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                                <span>Ключ</span>
                            </button>
                        </div>
                    </div>
                    <textarea id="workflow-edit-content"
                              class="workflow-edit-textarea w-full px-4 py-2 border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none mb-4"></textarea>
                <div id="modal-footer-btns">
                    <button id="workflow-modal-cancel-btn" class="btn btn-secondary">
                        Отмена
                    </button>
                    <button id="workflow-modal-save-btn" class="btn btn-primary">
                        Готово
                    </button>
                </div>
            </div>
        `;
        modal.addEventListener('mousedown', (e) => {
            if (e.target === modal) hideWorkflowEditModal();
        });
        document.body.appendChild(modal);
        
        // Обработчики кнопок модального окна
        modal.querySelector('#workflow-modal-cancel-btn')?.addEventListener('click', hideWorkflowEditModal);
        modal.querySelector('#workflow-modal-save-btn')?.addEventListener('click', saveWorkflowEdit);
        
        // Обработчик счётчика символов в названии
        const titleInput = modal.querySelector('#workflow-edit-title');
        const titleCounter = modal.querySelector('#workflow-edit-title-counter');
        if (titleInput && titleCounter) {
            titleInput.addEventListener('input', () => {
                const len = titleInput.value.length;
                titleCounter.textContent = `${len}/30`;
                titleCounter.style.color = len >= 30 ? '#ef4444' : '';
            });
        }
        
        // Обработчики инструкции в модальном окне
        const instrAddBtn = modal.querySelector('#modal-instruction-add-btn');
        const instrConfigBtn = modal.querySelector('#modal-instruction-config-btn');
        const instrRemoveBtn = modal.querySelector('#modal-instruction-remove-btn');
        
        instrAddBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(modal.dataset.editIndex);
            const items = getTabItems(currentTab);
            const blocks = items.filter(item => item.type === 'block');
            if (blocks[idx]) {
                // Создаём инструкцию напрямую без loadPrompts()
                blocks[idx].instruction = { type: 'info', icon: 'info', text: '' };
                const allTabs = getAllTabs();
                allTabs[currentTab].items = items;
                saveAllTabs(allTabs);
                updateModalInstructionUI(blocks[idx]);
            }
        });
        
        instrConfigBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(modal.dataset.editIndex);
            const items = getTabItems(currentTab);
            const blocks = items.filter(item => item.type === 'block');
            if (blocks[idx]) {
                // Сохраняем текст инструкции перед открытием конструктора
                const instrInput = modal.querySelector('#modal-instruction-text');
                if (instrInput && blocks[idx].instruction) {
                    blocks[idx].instruction.text = instrInput.value.trim();
                }
                showInputConstructorModal(blocks[idx].number, true);
            }
        });
        
        instrRemoveBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(modal.dataset.editIndex);
            const items = getTabItems(currentTab);
            const blocks = items.filter(item => item.type === 'block');
            if (blocks[idx]) {
                // Удаляем инструкцию напрямую без loadPrompts()
                delete blocks[idx].instruction;
                const allTabs = getAllTabs();
                allTabs[currentTab].items = items;
                saveAllTabs(allTabs);
                updateModalInstructionUI(blocks[idx]);
            }
        });
        
        const instrInput = modal.querySelector('#modal-instruction-text');
        instrInput?.addEventListener('change', (e) => {
            const idx = parseInt(modal.dataset.editIndex);
            const items = getTabItems(currentTab);
            const blocks = items.filter(item => item.type === 'block');
            if (blocks[idx]?.instruction) {
                updateBlockInstruction(currentTab, blocks[idx].number, {
                    ...blocks[idx].instruction,
                    text: e.target.value.trim()
                });
            }
        });
        
        // Обработчик кнопки языка в модальном окне
        const modalLangBtn = modal.querySelector('#modal-lang-btn');
        const modalTextarea = modal.querySelector('#workflow-edit-content');
        
        if (modalLangBtn && modalTextarea) {
            modalLangBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                insertLanguageFormAtCursor(modalTextarea);
            });
        }
        
        // Обработчик кнопки SERP в модальном окне
        const modalSerpBtn = modal.querySelector('#modal-serp-btn');
        if (modalSerpBtn && modalTextarea) {
            modalSerpBtn.addEventListener('mousedown', (e) => e.preventDefault());
            modalSerpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                insertTextIntoTextarea(modalTextarea, '{{SERP}}');
            });
        }
        
        // Обработчик Ctrl+Z/Y для textarea модалки - собственный undo стек
        if (modalTextarea) {
            // Сохранение состояния при вводе
            modalTextarea.addEventListener('input', () => {
                const now = Date.now();
                if (now - modalState.lastSaveTime > 300) {
                    modalState.undoStack.push({
                        value: modalTextarea.value,
                        selStart: modalTextarea.selectionStart,
                        selEnd: modalTextarea.selectionEnd
                    });
                    modalState.redoStack = [];
                    modalState.lastSaveTime = now;
                    
                    // Ограничиваем размер стека
                    if (modalState.undoStack.length > 50) {
                        modalState.undoStack.shift();
                    }
                }
            });
            
            // Обработчик Ctrl+Z/Y
            modalTextarea.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.code === 'KeyZ') {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (modalState.undoStack.length > 1) {
                        const current = modalState.undoStack.pop();
                        modalState.redoStack.push(current);
                        const prev = modalState.undoStack[modalState.undoStack.length - 1];
                        modalTextarea.value = prev.value;
                        modalTextarea.selectionStart = prev.selStart;
                        modalTextarea.selectionEnd = prev.selEnd;
                    }
                } else if (e.ctrlKey && e.code === 'KeyY') {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (modalState.redoStack.length > 0) {
                        const next = modalState.redoStack.pop();
                        modalState.undoStack.push(next);
                        modalTextarea.value = next.value;
                        modalTextarea.selectionStart = next.selStart;
                        modalTextarea.selectionEnd = next.selEnd;
                    }
                }
            });
        }
    }
    
    // Настраиваем модальное окно в зависимости от режима
    const header = modal.querySelector('#workflow-edit-header');
    const toolbarBtns = modal.querySelector('#modal-toolbar-btns');
    const contentHeader = modal.querySelector('#modal-content-header');
    const footerBtns = modal.querySelector('#modal-footer-btns');
    const titleInput = modal.querySelector('#workflow-edit-title');
    const titleContainer = titleInput.closest('.mb-3');
    const contentTextarea = modal.querySelector('#workflow-edit-content');
    const modalContent = modal.querySelector('.workflow-edit-modal-content');
    
    const instructionSection = modal.querySelector('#modal-instruction-section');
    
    if (isEditMode) {
        // Режим редактирования - полный функционал
        header.textContent = 'Редактировать блок';
        modalContent.classList.remove('view-mode');
        toolbarBtns.style.display = 'flex';
        contentHeader.style.display = 'flex';
        titleContainer.style.display = 'block';
        instructionSection.style.display = 'block';
        footerBtns.innerHTML = `
            <button id="workflow-modal-cancel-btn" class="btn btn-secondary">Отмена</button>
            <button id="workflow-modal-save-btn" class="btn btn-primary">Готово</button>
        `;
        footerBtns.querySelector('#workflow-modal-cancel-btn')?.addEventListener('click', hideWorkflowEditModal);
        footerBtns.querySelector('#workflow-modal-save-btn')?.addEventListener('click', saveWorkflowEdit);
        titleInput.readOnly = false;
        contentTextarea.readOnly = false;
    } else {
        // View mode - только редактирование текста промпта
        header.textContent = 'Редактировать промпт';
        modalContent.classList.add('view-mode');
        toolbarBtns.style.display = 'none';
        contentHeader.style.display = 'none';
        titleContainer.style.display = 'none';
        instructionSection.style.display = 'none';
        footerBtns.innerHTML = `
            <button id="workflow-modal-cancel-btn" class="btn btn-secondary">Отмена</button>
            <button id="workflow-modal-save-btn" class="btn btn-primary">Сохранить</button>
        `;
        footerBtns.querySelector('#workflow-modal-cancel-btn')?.addEventListener('click', hideWorkflowEditModal);
        footerBtns.querySelector('#workflow-modal-save-btn')?.addEventListener('click', saveWorkflowEdit);
        titleInput.readOnly = true;
        contentTextarea.readOnly = false;
    }
    
    // Заполняем данными
    const titleValue = block.title || '';
    getEditTitle().value = titleValue;
    getEditContent().value = block.content || '';
    modal.dataset.editIndex = index;
    
    // Обновляем UI инструкции
    if (isEditMode) {
        updateModalInstructionUI(block);
    }
    
    // Обновляем счётчик символов названия
    const titleCounter = modal.querySelector('#workflow-edit-title-counter');
    if (titleCounter) {
        titleCounter.textContent = `${titleValue.length}/30`;
        titleCounter.style.color = titleValue.length >= 30 ? '#ef4444' : '';
    }
    
    // Инициализируем undo стек для textarea модалки
    modalState.undoStack = [{
        value: block.content || '',
        selStart: 0,
        selEnd: 0
    }];
    modalState.redoStack = [];
    modalState.lastSaveTime = 0;
    
    modal.classList.add('open');
    
    // Автофокус на textarea после открытия модалки
    setTimeout(() => {
        const textarea = getEditContent();
        if (textarea) {
            textarea.focus();
            // Ставим курсор в конец текста
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
    }, 50);
}

/**
 * Обновить UI секции инструкции в модалке
 */
function updateModalInstructionUI(block) {
    const modal = getEditModal();
    if (!modal) return;
    
    const emptyState = modal.querySelector('#modal-instruction-empty');
    const filledState = modal.querySelector('#modal-instruction-filled');
    const instrInput = modal.querySelector('#modal-instruction-text');
    
    if (block.instruction) {
        emptyState.style.display = 'none';
        filledState.style.display = 'block';
        instrInput.value = block.instruction.text || '';
    } else {
        emptyState.style.display = 'block';
        filledState.style.display = 'none';
        instrInput.value = '';
    }
}

/**
 * Скрыть модальное окно редактирования
 */
function hideWorkflowEditModal() {
    hideContextMenu();
    const modal = getEditModal();
    modal?.classList.remove('open');
}

/**
 * Сохранить изменения из модалки
 */
function saveWorkflowEdit() {
    const modal = getEditModal();
    const index = parseInt(modal.dataset.editIndex);
    const title = getEditTitle().value;
    const content = getEditContent().value;
    
    // Обновляем блок
    const items = getTabItems(currentTab);
    const blocks = items.filter(item => item.type === 'block');
    
    if (blocks[index]) {
        // Snapshot ДО изменения
        UndoManager.snapshot(true);
        
        // В edit mode обновляем и title, в view mode - только content
        if (isEditMode) {
            blocks[index].title = title;
            
            // Сохраняем текст инструкции из модалки
            const instrInput = modal.querySelector('#modal-instruction-text');
            if (blocks[index].instruction && instrInput) {
                const instrText = instrInput.value.trim();
                if (instrText) {
                    blocks[index].instruction.text = instrText;
                }
            }
        }
        blocks[index].content = content;
        
        // Сохраняем
        const allTabs = getAllTabs();
        allTabs[currentTab].items = items;
        saveAllTabs(allTabs);
        
        // Перерендериваем с сохранением позиции скролла
        renderWorkflow(true);
        showToast('Сохранено');
    }
    
    hideWorkflowEditModal();
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE BLOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Удалить блок workflow
 */
function deleteWorkflowBlock(index) {
    
    const items = getTabItems(currentTab);
    const blocks = items.filter(item => item.type === 'block');
    
    if (blocks[index]) {
        const blockId = blocks[index].id;
        
        // Snapshot ДО удаления
        UndoManager.snapshot(true);
        
        // Удаляем блок из items
        const blockIndex = items.findIndex(item => item.id === blockId);
        if (blockIndex !== -1) {
            items.splice(blockIndex, 1);
        }
        
        // Удаляем связанные соединения
        workflowConnections = workflowConnections.filter(conn => 
            conn.from !== blockId && conn.to !== blockId
        );
        
        // Удаляем позицию и размер
        delete workflowPositions[blockId];
        delete workflowSizes[blockId];
        delete workflowColors[blockId];
        
        // Удаляем из collapsedBlocks и blockScripts
        if (collapsedBlocks[blockId]) {
            delete collapsedBlocks[blockId];
            saveCollapsedBlocks();
        }
        if (blockScripts[blockId]) {
            delete blockScripts[blockId];
            saveBlockScripts();
        }
        
        // Удаляем из blockAutomation
        if (blockAutomation[blockId]) {
            delete blockAutomation[blockId];
            saveBlockAutomation();
        }
        
        // Удаляем из blockAttachments (runtime only)
        if (blockAttachments[blockId]) {
            delete blockAttachments[blockId];
        }
        
        // Сохраняем
        const allTabs = getAllTabs();
        allTabs[currentTab].items = items;
        saveAllTabs(allTabs);
        
        saveWorkflowState();
        renderWorkflow();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE BLOCK CONTENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Сохранить содержимое блока (при редактировании в textarea)
 * @param {string} blockId - ID блока
 * @param {string} content - Новое содержимое
 * @param {boolean} [isBlur=false] - Вызвано из blur (принудительный snapshot)
 */
function saveBlockContent(blockId, content, isBlur = false) {
    if (UndoManager.isRestoring) return;
    
    const items = getTabItems(currentTab);
    const block = items.find(item => item.id === blockId);
    
    if (block) {
        // Пропускаем если контент не изменился (autosave)
        if (block.content === content) return;
        
        // Snapshot ДО изменения
        // blur = force (граница редактирования), иначе debounce (набор текста)
        UndoManager.snapshot(isBlur);
        
        block.content = content;
        
        // Сохраняем
        const allTabs = getAllTabs();
        allTabs[currentTab].items = items;
        saveAllTabs(allTabs);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// COPY NODE CONTENT (Оффлайн-режим)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Копировать содержимое блока в буфер обмена
 * @param {number} index - индекс блока
 */
async function copyNodeContent(index) {
    const blocks = getTabBlocks(currentTab);
    if (!blocks[index]) return;
    
    const block = blocks[index];
    // Раскрываем маркеры языка — копируем чистый текст
    const text = resolveMarkersToText(block.content || '', currentLanguage, currentCountry);
    
    try {
        await navigator.clipboard.writeText(text);
        showToast('Скопировано');
    } catch (e) {
        console.error('[Copy] Failed:', e);
        showToast('Ошибка копирования');
    }
}

// Экспорт
window.initWorkflow = initWorkflow;
window.renderWorkflow = renderWorkflow;
window.saveBlockContent = saveBlockContent;
window.editWorkflowNode = editWorkflowNode;
window.copyNodeContent = copyNodeContent;
window.deleteWorkflowBlock = deleteWorkflowBlock;
window.createWorkflowNote = createWorkflowNote;
