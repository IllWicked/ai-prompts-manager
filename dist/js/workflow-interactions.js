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
    document.querySelectorAll('.workflow-node.selected').forEach(n => n.classList.remove('selected'));
    selectedNodes.clear();
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
    
    // Двигаем все выделенные ноды
    let firstNode = null;
    selectedNodes.forEach(blockId => {
        const offset = dragOffsets[blockId];
        if (!offset) return;
        
        let x = cursorX - offset.x;
        let y = cursorY - offset.y;
        
        // Snap to grid
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
        // Лимит только сверху - минимум один шаг сетки
        y = Math.max(gridSize, y);
        
        const node = document.querySelector(`.workflow-node[data-block-id="${blockId}"]`);
        if (node) {
            node.style.left = x + 'px';
            node.style.top = y + 'px';
            workflowPositions[blockId] = {x, y};
            
            // Для первой ноды обновляем grid overlay
            if (!firstNode) {
                firstNode = node;
                updateGridOverlay(x, y, node.offsetWidth, node.offsetHeight);
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
        // Убираем класс dragging со всех выделенных нод
        document.querySelectorAll('.workflow-node.dragging').forEach(node => {
            node.classList.remove('dragging');
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
}
