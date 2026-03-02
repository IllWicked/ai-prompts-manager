/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKFLOW INTERACTIONS MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции взаимодействия с workflow: drag & drop, resize, selection.
 * 
 * Зависимости:
 *   - window.AppState.interaction (shared state)
 *   - Алиасы: isDraggingNode, isResizingNode, selectedNodes, dragOffsets,
 *             resizeNode, resizeDirection, resizeStartX, resizeStartY,
 *             resizeStartWidth, resizeStartHeight, resizeStartLeft, resizeStartTop
 *   - workflowPositions, workflowSizes (из workflow-state.js)
 *   - getWorkflowCanvas(), getWorkflowContainer() из utils.js
 *   - getCanvasScale() из utils.js
 *   - updateGridOverlay(), clearGridOverlay() из workflow-grid.js
 *   - saveWorkflowState() из workflow-state.js
 *   - renderConnections() из connections.js
 * 
 * Экспортирует (глобально):
 *   - clearNodeSelection()
 *   - onNodeDrag(e)
 *   - onNodeDragEnd()
 *   - onNodeResize(e)
 *   - onNodeResizeEnd(e)
 *   - resetDragResizeState()
 */

// ═══════════════════════════════════════════════════════════════════════════
// NODE SELECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Очистить выделение нод
 */
function clearNodeSelection() {
    document.querySelectorAll('.workflow-node.selected, .workflow-note.selected').forEach(n => n.classList.remove('selected'));
    selectedNodes.clear();
}

/**
 * Получить позицию элемента (блока или заметки) по ID
 */
function getItemPosition(id) {
    if (id.startsWith('note_')) {
        const note = workflowNotes.find(n => n.id === id);
        return note ? { x: note.x || 0, y: note.y || 0 } : null;
    }
    return workflowPositions[id] || null;
}

/**
 * Установить позицию элемента (блока или заметки) по ID
 */
function setItemPosition(id, x, y) {
    if (id.startsWith('note_')) {
        const note = workflowNotes.find(n => n.id === id);
        if (note) { note.x = x; note.y = y; }
    } else {
        workflowPositions[id] = { x, y };
    }
}

/**
 * Найти DOM-элемент по ID (блок или заметка)
 */
function getItemElement(id) {
    if (id.startsWith('note_')) {
        return document.querySelector(`.workflow-note[data-note-id="${id}"]`);
    }
    return document.querySelector(`.workflow-node[data-block-id="${id}"]`);
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAG HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Обработчик перетаскивания ноды
 */
function onNodeDrag(e) {
    if (!isDraggingNode || selectedNodes.size === 0) return;
    
    const canvas = getWorkflowCanvas();
    const container = getWorkflowContainer();
    const containerRect = container.getBoundingClientRect();
    const gridSize = WORKFLOW_CONFIG.GRID_SIZE;
    
    // Получаем текущий scale canvas
    const scale = getCanvasScale(canvas);
    
    // Позиция курсора в координатах canvas (с учётом scale)
    const cursorX = (e.clientX - containerRect.left + container.scrollLeft) / scale;
    const cursorY = (e.clientY - containerRect.top + container.scrollTop) / scale;
    
    // Двигаем все выделенные элементы (блоки и заметки)
    let firstNode = null;
    selectedNodes.forEach(id => {
        const offset = dragOffsets[id];
        if (!offset) return;
        
        let x = cursorX - offset.x;
        let y = cursorY - offset.y;
        
        // Snap to grid
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
        // Лимит только сверху - минимум один шаг сетки
        y = Math.max(gridSize, y);
        
        setItemPosition(id, x, y);
        const el = getItemElement(id);
        if (el) {
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            
            // Для первого элемента обновляем grid overlay
            if (!firstNode) {
                firstNode = el;
                updateGridOverlay(x, y, el.offsetWidth, el.offsetHeight);
            }
        }
    });
    
    renderConnections();
}

/**
 * Обработчик окончания перетаскивания
 */
function onNodeDragEnd() {
    if (isDraggingNode && selectedNodes.size > 0) {
        // Убираем класс dragging со всех выделенных элементов
        document.querySelectorAll('.workflow-node.dragging, .workflow-note.dragging').forEach(el => {
            el.classList.remove('dragging');
        });
        
        // Убираем класс dragging с контейнера
        const container = getWorkflowContainer();
        container?.classList.remove('dragging');
        
        // Очищаем точки оверлея
        clearGridOverlay();
        
        saveWorkflowState();
    }
    isDraggingNode = false;
    dragOffsets = {};
    
    // Показываем кнопки у всех collapsed блоков
    document.querySelectorAll('.workflow-node.collapsed.hide-buttons').forEach(n => {
        n.classList.remove('hide-buttons');
    });
    
    document.removeEventListener('mousemove', onNodeDrag);
    document.removeEventListener('mouseup', onNodeDragEnd);
}

// ═══════════════════════════════════════════════════════════════════════════
// RESIZE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Обработчик изменения размера ноды
 */
function onNodeResize(e) {
    if (!isResizingNode || !resizeNode || !resizeDirection) return;
    
    const gridSize = WORKFLOW_CONFIG.GRID_SIZE;
    const minWidth = WORKFLOW_CONFIG.NODE_MIN_WIDTH;
    const minHeight = WORKFLOW_CONFIG.NODE_MIN_HEIGHT;
    
    // Учитываем масштаб canvas
    const canvas = getWorkflowCanvas();
    const scale = getCanvasScale(canvas);
    
    const deltaX = (e.clientX - resizeStartX) / scale;
    const deltaY = (e.clientY - resizeStartY) / scale;
    
    let newWidth = resizeStartWidth;
    let newHeight = resizeStartHeight;
    let newLeft = resizeStartLeft;
    let newTop = resizeStartTop;
    
    // Обработка горизонтального ресайза
    if (resizeDirection.includes('e')) {
        newWidth = resizeStartWidth + deltaX;
    }
    if (resizeDirection.includes('w')) {
        newWidth = resizeStartWidth - deltaX;
        newLeft = resizeStartLeft + deltaX;
    }
    
    // Обработка вертикального ресайза
    if (resizeDirection.includes('s')) {
        newHeight = resizeStartHeight + deltaY;
    }
    if (resizeDirection.includes('n')) {
        newHeight = resizeStartHeight - deltaY;
        newTop = resizeStartTop + deltaY;
    }
    
    // Применяем минимальные размеры ДО snap to grid
    newWidth = Math.max(minWidth, newWidth);
    newHeight = Math.max(minHeight, newHeight);
    
    // Snap to grid
    newWidth = Math.round(newWidth / gridSize) * gridSize;
    newHeight = Math.round(newHeight / gridSize) * gridSize;
    newLeft = Math.round(newLeft / gridSize) * gridSize;
    newTop = Math.round(newTop / gridSize) * gridSize;
    
    // Проверяем минимумы после snap
    if (newWidth < minWidth) newWidth = minWidth;
    if (newHeight < minHeight) newHeight = minHeight;
    
    // Корректируем позицию при ресайзе слева/сверху
    if (resizeDirection.includes('w') && newWidth === minWidth) {
        newLeft = resizeStartLeft + resizeStartWidth - minWidth;
    }
    if (resizeDirection.includes('n') && newHeight === minHeight) {
        newTop = resizeStartTop + resizeStartHeight - minHeight;
    }
    
    // Лимит только сверху - минимум один шаг сетки
    newTop = Math.max(gridSize, newTop);
    
    resizeNode.style.width = newWidth + 'px';
    resizeNode.style.height = newHeight + 'px';
    resizeNode.style.left = newLeft + 'px';
    resizeNode.style.top = newTop + 'px';
    
    // Обновляем позицию в workflowPositions
    const blockId = resizeNode.dataset.blockId;
    if (blockId) {
        workflowPositions[blockId] = { x: newLeft, y: newTop };
    }
    
    // Обновляем связи
    renderConnections();
}

/**
 * Обработчик окончания изменения размера
 */
function onNodeResizeEnd(e) {
    if (isResizingNode && resizeNode) {
        const blockId = resizeNode.dataset.blockId;
        const width = resizeNode.offsetWidth;
        const height = resizeNode.offsetHeight;
        
        workflowSizes[blockId] = { width, height };
        
        resizeNode.classList.remove('resizing');
        resizeNode.style.cursor = 'default';
        saveWorkflowState();
    }
    // Всегда сбрасываем состояние и удаляем обработчики
    isResizingNode = false;
    resizeNode = null;
    resizeDirection = null;
    document.removeEventListener('mousemove', onNodeResize);
    document.removeEventListener('mouseup', onNodeResizeEnd);
}

// ═══════════════════════════════════════════════════════════════════════════
// RESET STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Сброс всех drag/resize состояний (при потере фокуса окна и т.д.)
 */
function resetDragResizeState() {
    if (isResizingNode && resizeNode) {
        resizeNode.classList.remove('resizing');
    }
    isResizingNode = false;
    resizeNode = null;
    resizeDirection = null;
    document.removeEventListener('mousemove', onNodeResize);
    document.removeEventListener('mouseup', onNodeResizeEnd);
    
    if (isDraggingNode) {
        document.querySelectorAll('.workflow-node.dragging').forEach(n => n.classList.remove('dragging'));
    }
    isDraggingNode = false;
    dragOffsets = {};
    document.removeEventListener('mousemove', onNodeDrag);
    document.removeEventListener('mouseup', onNodeDragEnd);
    
    clearGridOverlay();
    
    // Сброс marquee если активен
    _marqueeActive = false;
    const rect = document.getElementById('marquee-selection-rect');
    if (rect) rect.remove();
}

// ═══════════════════════════════════════════════════════════════════════════
// MARQUEE SELECTION
// ═══════════════════════════════════════════════════════════════════════════

let _marqueeActive = false;
let _marqueeStartX = 0;
let _marqueeStartY = 0;
let _marqueeCtrl = false;
let _marqueePreSelection = new Set(); // ноды выделенные до marquee (для Ctrl)

/**
 * Начать marquee selection
 * @param {HTMLElement} container - workflow-container
 * @param {MouseEvent} e
 */
function startMarqueeSelection(container, e) {
    _marqueeActive = true;
    _marqueeCtrl = e.ctrlKey;
    
    // Запоминаем что было выделено до marquee (для Ctrl+drag)
    _marqueePreSelection = new Set(selectedNodes);
    
    // Стартовая точка в координатах контейнера (с учётом скролла)
    _marqueeStartX = e.clientX - container.getBoundingClientRect().left + container.scrollLeft;
    _marqueeStartY = e.clientY - container.getBoundingClientRect().top + container.scrollTop;
    
    // Создаём элемент прямоугольника
    let rect = document.getElementById('marquee-selection-rect');
    if (!rect) {
        rect = document.createElement('div');
        rect.id = 'marquee-selection-rect';
        container.appendChild(rect);
    }
    rect.style.left = _marqueeStartX + 'px';
    rect.style.top = _marqueeStartY + 'px';
    rect.style.width = '0';
    rect.style.height = '0';
    rect.style.display = 'block';
}

/**
 * Обновить marquee selection при движении мыши
 * @param {HTMLElement} container - workflow-container
 * @param {MouseEvent} e
 */
function updateMarqueeSelection(container, e) {
    if (!_marqueeActive) return;
    
    const currentX = e.clientX - container.getBoundingClientRect().left + container.scrollLeft;
    const currentY = e.clientY - container.getBoundingClientRect().top + container.scrollTop;
    
    // Вычисляем прямоугольник (может быть в любом направлении)
    const left = Math.min(_marqueeStartX, currentX);
    const top = Math.min(_marqueeStartY, currentY);
    const width = Math.abs(currentX - _marqueeStartX);
    const height = Math.abs(currentY - _marqueeStartY);
    
    const rect = document.getElementById('marquee-selection-rect');
    if (rect) {
        rect.style.left = left + 'px';
        rect.style.top = top + 'px';
        rect.style.width = width + 'px';
        rect.style.height = height + 'px';
    }
    
    // Порог: не считаем за marquee если движение < 5px
    if (width < 5 && height < 5) return;
    
    // Конвертируем marquee rect из container-scroll координат в canvas координат
    const scale = workflowZoom;
    const mLeft = left / scale;
    const mTop = top / scale;
    const mRight = (left + width) / scale;
    const mBottom = (top + height) / scale;
    
    // Проверяем пересечение с каждой нодой
    document.querySelectorAll('.workflow-node').forEach(node => {
        const blockId = node.dataset.blockId;
        if (!blockId) return;
        
        const nx = parseFloat(node.style.left) || 0;
        const ny = parseFloat(node.style.top) || 0;
        const nw = node.offsetWidth || 0;
        const nh = node.offsetHeight || 0;
        
        const intersects = !(nx + nw < mLeft || nx > mRight || ny + nh < mTop || ny > mBottom);
        
        if (intersects) {
            selectedNodes.add(blockId);
            node.classList.add('selected');
        } else if (_marqueeCtrl) {
            // Ctrl+marquee: восстанавливаем pre-selection состояние
            if (_marqueePreSelection.has(blockId)) {
                selectedNodes.add(blockId);
                node.classList.add('selected');
            } else {
                selectedNodes.delete(blockId);
                node.classList.remove('selected');
            }
        } else {
            selectedNodes.delete(blockId);
            node.classList.remove('selected');
        }
    });
    
    // Проверяем пересечение с каждой заметкой
    document.querySelectorAll('.workflow-note').forEach(noteEl => {
        const noteId = noteEl.dataset.noteId;
        if (!noteId) return;
        
        const nx = parseFloat(noteEl.style.left) || 0;
        const ny = parseFloat(noteEl.style.top) || 0;
        const nw = noteEl.offsetWidth || 0;
        const nh = noteEl.offsetHeight || 0;
        
        const intersects = !(nx + nw < mLeft || nx > mRight || ny + nh < mTop || ny > mBottom);
        
        if (intersects) {
            selectedNodes.add(noteId);
            noteEl.classList.add('selected');
        } else if (_marqueeCtrl) {
            if (_marqueePreSelection.has(noteId)) {
                selectedNodes.add(noteId);
                noteEl.classList.add('selected');
            } else {
                selectedNodes.delete(noteId);
                noteEl.classList.remove('selected');
            }
        } else {
            selectedNodes.delete(noteId);
            noteEl.classList.remove('selected');
        }
    });
}

/**
 * Завершить marquee selection
 * @param {HTMLElement} container - workflow-container
 */
function endMarqueeSelection(container) {
    if (!_marqueeActive) return;
    _marqueeActive = false;
    
    const rect = document.getElementById('marquee-selection-rect');
    if (rect) rect.style.display = 'none';
    
    _marqueePreSelection.clear();
}

// Экспорт
window.startMarqueeSelection = startMarqueeSelection;
window.updateMarqueeSelection = updateMarqueeSelection;
window.endMarqueeSelection = endMarqueeSelection;
window.getItemPosition = getItemPosition;
window.setItemPosition = setItemPosition;
window.getItemElement = getItemElement;
