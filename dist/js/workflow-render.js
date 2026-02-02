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
 *             existingTabs, activeClaudeTab, collapsedBlocks, blockScripts, blockAttachments,
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
    const center = WORKFLOW_CONFIG.CANVAS_CENTER;
    const scaledCenter = center * workflowZoom;
    container.scrollLeft = Math.max(0, scaledCenter - container.clientWidth / 2);
    container.scrollTop = Math.max(0, scaledCenter - container.clientHeight / 2);
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
    
    const canvas = getWorkflowCanvas();
    const svg = getWorkflowSvg();
    const container = getWorkflowContainer();
    if (!canvas || !svg || !container) return;
    
    // По умолчанию в edit mode сохраняем скролл, если явно не указано иначе
    const shouldPreserveScroll = preserveScroll !== null ? preserveScroll : isEditMode;
    
    // Сохраняем позицию скролла если нужно
    const savedScrollLeft = shouldPreserveScroll ? container.scrollLeft : null;
    const savedScrollTop = shouldPreserveScroll ? container.scrollTop : null;
    
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
    
    // Очищаем только ноды
    canvas.querySelectorAll('.workflow-node').forEach(n => n.remove());
    
    // Получаем текущие блоки
    const blocks = getTabBlocks(currentTab);
    
    if (!blocks || blocks.length === 0) {
        // Очищаем SVG от старых соединений даже на пустой вкладке
        renderConnections();
        // Применяем масштабирование даже для пустой вкладки
        adjustWorkflowScale(false);
        
        // Центрируем камеру на пустом холсте
        if (isEditMode) {
            scrollToCanvasCenter(container);
        }
        
        skipScrollOnRender = false;
        return;
    }
    
    // Автоматическое позиционирование если нет сохранённых позиций
    autoPositionNodes(blocks);
    
    // Создаём ноды
    blocks.forEach((block, index) => {
        const node = createWorkflowNode(block, index);
        canvas.appendChild(node);
    });
    
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
        // Это важно для view mode, где нужны корректные размеры нод
        adjustWorkflowScale(!shouldPreserveScroll);
        
        // Восстанавливаем позицию скролла если сохраняли
        if (shouldPreserveScroll && savedScrollLeft !== null) {
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
    const maxCols = Math.floor((WORKFLOW_CONFIG.CANVAS_SIZE + gapX) / (nodeWidth + gapX));
    
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
    
    // Кнопка редактирования
    let html = `<button class="workflow-node-btn" onclick="editWorkflowNode(${index})" title="Редактировать"><span>Редактировать</span></button>`;
    
    // Кнопки отправки в чаты (если разрешено)
    if (showChatButtons) {
        if (chatTabs.length === 1) {
            html += `<button class="workflow-node-btn primary" onclick="sendNodeToClaude(${index}, ${chatTabs[0]})" title="Отправить в чат">${arrowSvg}<span>Чат</span></button>`;
        } else {
            chatTabs.forEach(tab => {
                html += `<button class="workflow-node-btn primary" onclick="sendNodeToClaude(${index}, ${tab})" title="Отправить в Чат ${tab}">${arrowSvg}<span>Чат ${tab}</span></button>`;
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
    
    // Получаем метки скриптов и автоматизации для этого блока
    const scripts = getBlockScripts(block.id);
    const automation = getBlockAutomationFlags(block.id);
    
    let badgesHtml = scripts.map(s => 
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
    
    // В edit mode добавляем кнопку удаления и метки скриптов
    if (isEditMode) {
        header.innerHTML = `
            <button class="workflow-collapse-btn" data-block-id="${blockId}" title="${isCollapsed ? 'Развернуть' : 'Свернуть'}">${collapseIcon}</button>
            ${collapsedFilesBtn}
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
            <div class="workflow-node-title">${escapeHtml(block.title || 'Без названия')}</div>
            <div class="script-badges">${badgesHtml}</div>
        `;
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
        
        // Сохраняем при потере фокуса
        body.addEventListener('blur', () => {
            saveBlockContent(block.id, body.value);
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
        body.textContent = block.content || '';
        node.appendChild(body);
    }
    
    // Футер с кнопками
    const footer = document.createElement('div');
    footer.className = 'workflow-node-footer';
    
    // Кнопки отправки в чаты
    const chatTabs = typeof existingTabs !== 'undefined' && existingTabs.length > 0 ? existingTabs : [1];
    
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
// INSTRUCTION CREATION
// ═══════════════════════════════════════════════════════════════════════════

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
                           maxlength="60">
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
        
        // Получаем текущий scale canvas
        const canvas = getWorkflowCanvas();
        const scale = getCanvasScale(canvas);
        
        // Вычисляем offset для всех выделенных нод
        const containerRect = container.getBoundingClientRect();
        const cursorCanvasX = (e.clientX - containerRect.left + container.scrollLeft) / scale;
        const cursorCanvasY = (e.clientY - containerRect.top + container.scrollTop) / scale;
        
        dragOffsets = {};
        selectedNodes.forEach(id => {
            const pos = workflowPositions[id] || {x: 0, y: 0};
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
    
    // Клик по collapsed блоку во view mode - отправить промпт в текущий выбранный чат
    // Только если блок не заблокирован проектом (не имеет класс project-restricted)
    if (!isEditMode && node.classList.contains('collapsed') && !node.classList.contains('project-restricted')) {
        node.addEventListener('click', (e) => {
            // Отправляем в текущий активный чат Claude (не в привязанный к блоку)
            sendNodeToClaude(index, activeClaudeTab);
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
                <div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
                    <div id="modal-content-header" class="flex items-center justify-between mb-1">
                        <label id="modal-content-label" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Содержимое</label>
                        <div id="modal-toolbar-btns" class="flex items-center gap-2">
                            <button id="modal-lang-btn" class="edit-toolbar-btn" title="Вставить форму языка">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                </svg>
                                <span>Язык</span>
                            </button>
                        </div>
                    </div>
                    <textarea id="workflow-edit-content"
                              class="workflow-edit-textarea w-full px-4 py-2 border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none"></textarea>
                </div>
                <div id="modal-footer-btns" class="flex justify-end gap-3 mt-4">
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
        
        // Обработчик кнопки языка в модальном окне
        const modalLangBtn = modal.querySelector('#modal-lang-btn');
        const modalTextarea = modal.querySelector('#workflow-edit-content');
        
        if (modalLangBtn && modalTextarea) {
            modalLangBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                insertLanguageFormAtCursor(modalTextarea);
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
    
    if (isEditMode) {
        // Режим редактирования - полный функционал
        header.textContent = 'Редактировать блок';
        toolbarBtns.style.display = 'flex';
        contentHeader.style.display = 'flex';
        titleContainer.style.display = 'block';
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
        toolbarBtns.style.display = 'none';
        contentHeader.style.display = 'none';
        titleContainer.style.display = 'none';
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
        // В edit mode обновляем и title, в view mode - только content
        if (isEditMode) {
            blocks[index].title = title;
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
        
        saveWorkflowState(true); // skipUndo - saveAllTabs уже записала
        renderWorkflow();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE BLOCK CONTENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Сохранить содержимое блока (при редактировании в textarea)
 */
function saveBlockContent(blockId, content) {
    const items = getTabItems(currentTab);
    const block = items.find(item => item.id === blockId);
    
    if (block) {
        block.content = content;
        
        // Сохраняем
        const allTabs = getAllTabs();
        allTabs[currentTab].items = items;
        saveAllTabs(allTabs);
    }
}

// Экспорт
window.initWorkflow = initWorkflow;
window.renderWorkflow = renderWorkflow;
window.saveBlockContent = saveBlockContent;
window.editWorkflowNode = editWorkflowNode;
window.deleteWorkflowBlock = deleteWorkflowBlock;
