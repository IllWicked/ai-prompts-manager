/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONNECTIONS MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции для работы со связями между блоками workflow.
 * 
 * Зависимости:
 *   - window.AppState (shared state)
 *   - workflowConnections, isEditMode, isCreatingConnection, connectionStart, tempLineEl (алиасы)
 *   - getWorkflowSvg(), getWorkflowCanvas(), getWorkflowContainer() (DOM getters из utils.js)
 *   - getCanvasScale() из utils.js
 *   - saveWorkflowState() из workflow-state.js
 *   - showToast() из toast.js
 * 
 * Экспортирует (глобально):
 *   - getPortPosition(blockId, side)
 *   - buildBezierPath(startX, startY, startSide, endX, endY, endSide)
 *   - findNearestPort(x, y, excludeBlockId)
 *   - addConnection(fromBlockId, fromSide, toBlockId, toSide)
 *   - removeConnection(fromBlockId, fromSide, toBlockId, toSide)
 *   - wouldCreateCycle(fromBlockId, toBlockId)
 *   - renderConnections()
 *   - onConnectionDrag(e)
 *   - onConnectionEnd(e)
 *   - setupPortEvents(port)
 */

/**
 * Получить позицию порта (относительно canvas/SVG)
 * @param {string} blockId - ID блока
 * @param {string} side - Сторона порта: 'top', 'right', 'bottom', 'left'
 * @returns {{x: number, y: number}}
 */
function getPortPosition(blockId, side) {
    const node = document.querySelector(`.workflow-node[data-block-id="${blockId}"]`);
    if (!node) return {x: 0, y: 0};
    
    const nodeLeft = parseFloat(node.style.left) || 0;
    const nodeTop = parseFloat(node.style.top) || 0;
    const nodeWidth = node.offsetWidth;
    const nodeHeight = node.offsetHeight;
    
    switch (side) {
        case 'top':
            return {
                x: nodeLeft + nodeWidth / 2,
                y: nodeTop
            };
        case 'right':
            return {
                x: nodeLeft + nodeWidth,
                y: nodeTop + nodeHeight / 2
            };
        case 'bottom':
            return {
                x: nodeLeft + nodeWidth / 2,
                y: nodeTop + nodeHeight
            };
        case 'left':
        default:
            return {
                x: nodeLeft,
                y: nodeTop + nodeHeight / 2
            };
    }
}

/**
 * Построить SVG path для Bezier S-кривой между двумя точками
 * @param {number} startX - Начальная X координата
 * @param {number} startY - Начальная Y координата
 * @param {string} startSide - Сторона начального порта: 'top', 'right', 'bottom', 'left'
 * @param {number} endX - Конечная X координата
 * @param {number} endY - Конечная Y координата
 * @param {string|null} endSide - Сторона конечного порта (или null для свободного конца)
 * @returns {string} SVG path string
 */
function buildBezierPath(startX, startY, startSide, endX, endY, endSide) {
    const dx = endX - startX;
    const dy = endY - startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    let cp1x, cp1y, cp2x, cp2y;
    
    // Определяем тип соединения
    const isStartHorizontal = (startSide === 'right' || startSide === 'left');
    const isStartVertical = (startSide === 'bottom' || startSide === 'top');
    const isEndHorizontal = endSide && (endSide === 'right' || endSide === 'left');
    const isEndVertical = endSide && (endSide === 'bottom' || endSide === 'top');
    
    if (isStartHorizontal && (!endSide || isEndHorizontal)) {
        // Горизонтальное соединение: S-кривая по X
        const midX = startX + dx / 2;
        cp1x = midX;
        cp1y = startY;
        cp2x = midX;
        cp2y = endY;
    } else if (isStartVertical && (!endSide || isEndVertical)) {
        // Вертикальное соединение: S-кривая по Y
        const midY = startY + dy / 2;
        cp1x = startX;
        cp1y = midY;
        cp2x = endX;
        cp2y = midY;
    } else {
        // Смешанное соединение (например, right → top)
        const tension = Math.min(absDx, absDy) * 0.5 + 30;
        
        cp1x = startX;
        cp1y = startY;
        cp2x = endX;
        cp2y = endY;
        
        // Смещаем первую контрольную точку от начального порта
        if (startSide === 'right') cp1x += tension;
        else if (startSide === 'left') cp1x -= tension;
        else if (startSide === 'bottom') cp1y += tension;
        else if (startSide === 'top') cp1y -= tension;
        
        // Смещаем вторую контрольную точку от конечного порта
        if (endSide === 'right') cp2x += tension;
        else if (endSide === 'left') cp2x -= tension;
        else if (endSide === 'bottom') cp2y += tension;
        else if (endSide === 'top') cp2y -= tension;
    }
    
    return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
}

/**
 * Найти ближайший порт для магнита
 * @param {number} x - Координата X
 * @param {number} y - Координата Y
 * @param {string} excludeBlockId - ID блока для исключения
 * @returns {{x: number, y: number, side: string, blockId: string}|null}
 */
function findNearestPort(x, y, excludeBlockId) {
    const magnetDistance = WORKFLOW_CONFIG.MAGNET_DISTANCE; // Радиус притягивания
    let nearest = null;
    let minDist = magnetDistance;
    
    document.querySelectorAll('.workflow-port').forEach(port => {
        const portBlockId = port.dataset.blockId;
        if (portBlockId === excludeBlockId) return;
        
        const portSide = port.dataset.side;
        const pos = getPortPosition(portBlockId, portSide);
        const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
        
        if (dist < minDist) {
            minDist = dist;
            nearest = { x: pos.x, y: pos.y, side: portSide, blockId: portBlockId };
        }
    });
    
    return nearest;
}

/**
 * Проверка на цикл
 * @param {string} fromBlockId - ID начального блока
 * @param {string} toBlockId - ID конечного блока
 * @returns {boolean}
 */
function wouldCreateCycle(fromBlockId, toBlockId) {
    const visited = new Set();
    const stack = [toBlockId];
    
    while (stack.length > 0) {
        const current = stack.pop();
        if (current === fromBlockId) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        
        workflowConnections
            .filter(c => c.from === current)
            .forEach(c => stack.push(c.to));
    }
    return false;
}

/**
 * Добавить связь между блоками
 * @param {string} fromBlockId - ID начального блока
 * @param {string} fromSide - Сторона начального порта
 * @param {string} toBlockId - ID конечного блока
 * @param {string} toSide - Сторона конечного порта
 */
function addConnection(fromBlockId, fromSide, toBlockId, toSide) {
    // Проверяем что связь между этими блоками не существует (независимо от сторон)
    const exists = workflowConnections.some(c => 
        c.from === fromBlockId && c.to === toBlockId
    );
    if (exists) return;
    
    // Проверяем на циклы (простая проверка)
    if (wouldCreateCycle(fromBlockId, toBlockId)) {
        showToast('Нельзя создать циклическую связь', 2000);
        return;
    }
    
    workflowConnections.push({
        from: fromBlockId, 
        fromSide: fromSide,
        to: toBlockId,
        toSide: toSide
    });
    renderConnections();
    saveWorkflowState();
}

/**
 * Удалить связь между блоками
 * @param {string} fromBlockId - ID начального блока
 * @param {string} fromSide - Сторона начального порта
 * @param {string} toBlockId - ID конечного блока
 * @param {string} toSide - Сторона конечного порта
 */
function removeConnection(fromBlockId, fromSide, toBlockId, toSide) {
    workflowConnections = workflowConnections.filter(
        c => !(c.from === fromBlockId && c.fromSide === fromSide && c.to === toBlockId && c.toSide === toSide)
    );
    renderConnections();
    saveWorkflowState();
}

/**
 * Рендер связей (SVG линии)
 */
function renderConnections() {
    const svg = getWorkflowSvg();
    if (!svg) return;
    
    
    // Удаляем старые линии и треугольники
    svg.querySelectorAll('path, line, polygon').forEach(p => p.remove());
    
    workflowConnections.forEach(conn => {
        const fromSide = conn.fromSide || 'right';
        const toSide = conn.toSide || 'left';
        
        const startPos = getPortPosition(conn.from, fromSide);
        const endPos = getPortPosition(conn.to, toSide);
        
        // Используем общую функцию для построения S-кривой
        const d = buildBezierPath(startPos.x, startPos.y, fromSide, endPos.x, endPos.y, toSide);
        
        // Все соединения теперь анимированные пунктирные
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#ec7441');
        path.setAttribute('stroke-width', isEditMode ? '3' : '4');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-dasharray', '8 6');
        path.classList.add('workflow-connection-animated');
        path.classList.add('workflow-connection-path');
        path.setAttribute('data-from', conn.from);
        path.setAttribute('data-to', conn.to);
        path.style.transition = 'opacity 0.3s ease';
        
        svg.appendChild(path);
        
        // Невидимая линия для кликов (только в режиме редактирования)
        const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitArea.setAttribute('d', d);
        hitArea.setAttribute('stroke', 'rgba(0,0,0,0.001)');
        hitArea.setAttribute('stroke-width', '20');
        hitArea.setAttribute('fill', 'none');
        hitArea.setAttribute('stroke-linecap', 'round');
        hitArea.style.cursor = isEditMode ? 'pointer' : 'default';
        
        hitArea.addEventListener('click', () => {
            if (!isEditMode) return;
            // Удаляем линию с анимацией
            path.style.opacity = '0';
            hitArea.style.pointerEvents = 'none';
            setTimeout(() => {
                removeConnection(conn.from, fromSide, conn.to, toSide);
            }, 300);
        });
        
        // Hover эффект только в edit mode
        if (isEditMode) {
            hitArea.addEventListener('mouseenter', () => {
                path.setAttribute('stroke-width', '4');
            });
            
            hitArea.addEventListener('mouseleave', () => {
                path.setAttribute('stroke-width', '3');
            });
        }
        
        svg.appendChild(hitArea);
    });
}

/**
 * Обработчик перетаскивания при создании связи
 * @param {MouseEvent} e
 */
function onConnectionDrag(e) {
    if (!isCreatingConnection || !tempLineEl) return;
    
    const canvas = getWorkflowCanvas();
    const container = getWorkflowContainer();
    const containerRect = container.getBoundingClientRect();
    
    // Получаем текущий scale canvas
    const scale = getCanvasScale(canvas);
    
    // Координаты курсора в координатах canvas (с учётом scale)
    let x = (e.clientX - containerRect.left + container.scrollLeft) / scale;
    let y = (e.clientY - containerRect.top + container.scrollTop) / scale;
    
    // Убираем подсветку со всех портов
    document.querySelectorAll('.workflow-port.magnet-target').forEach(p => {
        p.classList.remove('magnet-target');
    });
    
    // Магнит к ближайшему порту
    const nearest = findNearestPort(x, y, connectionStart?.blockId);
    if (nearest) {
        x = nearest.x;
        y = nearest.y;
        // Подсвечиваем целевой порт
        const targetPort = document.querySelector(`.workflow-node[data-block-id="${nearest.blockId}"] .workflow-port-${nearest.side}`);
        targetPort?.classList.add('magnet-target');
    }
    
    // Строим умную S-кривую
    const startX = parseFloat(tempLineEl.dataset.startX);
    const startY = parseFloat(tempLineEl.dataset.startY);
    const startSide = tempLineEl.dataset.startSide;
    const endSide = nearest?.side || null;
    
    const d = buildBezierPath(startX, startY, startSide, x, y, endSide);
    tempLineEl.setAttribute('d', d);
}

/**
 * Обработчик завершения создания связи
 * @param {MouseEvent} e
 */
function onConnectionEnd(e) {
    if (isCreatingConnection && connectionStart) {
        // Проверяем магнит - может быть связь нужно создать
        const canvas = getWorkflowCanvas();
        const container = getWorkflowContainer();
        const containerRect = container.getBoundingClientRect();
        
        // Получаем текущий scale canvas
        const scale = getCanvasScale(canvas);
        
        const x = (e.clientX - containerRect.left + container.scrollLeft) / scale;
        const y = (e.clientY - containerRect.top + container.scrollTop) / scale;
        
        const nearest = findNearestPort(x, y, connectionStart.blockId);
        if (nearest && nearest.blockId !== connectionStart.blockId) {
            addConnection(connectionStart.blockId, connectionStart.side, nearest.blockId, nearest.side);
        }
    }
    
    isCreatingConnection = false;
    connectionStart = null;
    
    // Скрываем порты и убираем подсветку магнита
    getWorkflowContainer()?.classList.remove('connecting');
    document.querySelectorAll('.workflow-port.magnet-target').forEach(p => {
        p.classList.remove('magnet-target');
    });
    
    // Показываем кнопки у всех collapsed блоков
    document.querySelectorAll('.workflow-node.collapsed.hide-buttons').forEach(n => {
        n.classList.remove('hide-buttons');
    });
    
    if (tempLineEl) {
        tempLineEl.remove();
        tempLineEl = null;
    }
    
    document.removeEventListener('mousemove', onConnectionDrag);
    document.removeEventListener('mouseup', onConnectionEnd);
}

/**
 * Настроить обработчики событий для порта
 * Вызывается из renderWorkflow при создании нод
 * @param {HTMLElement} port - DOM элемент порта
 */
function setupPortEvents(port) {
    const node = port.closest('.workflow-node');
    
    // Скрываем кнопки при наведении на боковой порт collapsed блока
    if (port.dataset.side === 'left' || port.dataset.side === 'right') {
        port.addEventListener('mouseenter', () => {
            if (node && node.classList.contains('collapsed')) {
                node.classList.add('hide-buttons');
            }
        });
        
        port.addEventListener('mouseleave', () => {
            // Не показываем кнопки если идёт создание соединения
            if (!isCreatingConnection && node && node.classList.contains('collapsed')) {
                node.classList.remove('hide-buttons');
            }
        });
    }
    
    port.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        // Только в режиме редактирования
        if (!isEditMode) return;
        
        const side = port.dataset.side;
        const blockId = port.dataset.blockId;
        
        // Начинаем создание связи с любого порта
        isCreatingConnection = true;
        connectionStart = {blockId: blockId, side: side};
        
        // Скрываем кнопки у всех collapsed блоков при начале соединения
        document.querySelectorAll('.workflow-node.collapsed').forEach(n => {
            n.classList.add('hide-buttons');
        });
        
        // Показываем все порты
        getWorkflowContainer()?.classList.add('connecting');
        
        // Создаём временную линию (path для Bezier)
        const svg = getWorkflowSvg();
        if (!svg) {
            return;
        }
        tempLineEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempLineEl.setAttribute('stroke', '#ec7441');
        tempLineEl.setAttribute('stroke-width', '4');
        tempLineEl.setAttribute('stroke-dasharray', '8,8');
        tempLineEl.setAttribute('fill', 'none');
        const startPos = getPortPosition(blockId, side);
        tempLineEl.dataset.startX = startPos.x;
        tempLineEl.dataset.startY = startPos.y;
        tempLineEl.dataset.startSide = side;
        tempLineEl.setAttribute('d', `M ${startPos.x} ${startPos.y} L ${startPos.x} ${startPos.y}`);
        svg.appendChild(tempLineEl);
        
        document.addEventListener('mousemove', onConnectionDrag);
        document.addEventListener('mouseup', onConnectionEnd);
    });
    
    port.addEventListener('mouseup', (e) => {
        if (!isCreatingConnection || !connectionStart) return;
        if (!isEditMode) return;
        
        const side = port.dataset.side;
        const blockId = port.dataset.blockId;
        
        // Завершаем связь если это другой блок
        if (connectionStart.blockId !== blockId) {
            addConnection(connectionStart.blockId, connectionStart.side, blockId, side);
            // Сбрасываем чтобы onConnectionEnd не создал дубликат
            connectionStart = null;
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════
window.getPortPosition = getPortPosition;
window.buildBezierPath = buildBezierPath;
window.findNearestPort = findNearestPort;
window.addConnection = addConnection;
window.removeConnection = removeConnection;
window.wouldCreateCycle = wouldCreateCycle;
window.renderConnections = renderConnections;
window.onConnectionDrag = onConnectionDrag;
window.onConnectionEnd = onConnectionEnd;
window.setupPortEvents = setupPortEvents;
