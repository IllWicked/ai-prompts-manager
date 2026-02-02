/**
 * Mock для DOM-элементов workflow
 * Создаёт фейковые DOM-элементы для тестирования функций workflow
 */

/**
 * Создаёт mock workflow node (блок на canvas)
 * @param {string} blockId - ID блока
 * @param {Object} options - Опции позиционирования и размера
 * @returns {HTMLElement}
 */
function createMockNode(blockId, { left = 0, top = 0, width = 680, height = 500 } = {}) {
    const node = document.createElement('div');
    node.className = 'workflow-node';
    node.dataset.blockId = blockId;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    
    // Mock offsetWidth/offsetHeight (read-only в реальном DOM)
    Object.defineProperty(node, 'offsetWidth', { 
        value: width, 
        writable: false,
        configurable: true 
    });
    Object.defineProperty(node, 'offsetHeight', { 
        value: height, 
        writable: false,
        configurable: true 
    });
    
    return node;
}

/**
 * Создаёт mock port (точка соединения на блоке)
 * @param {string} blockId - ID блока
 * @param {string} side - Сторона порта: 'top', 'right', 'bottom', 'left'
 * @returns {HTMLElement}
 */
function createMockPort(blockId, side) {
    const port = document.createElement('div');
    port.className = `workflow-port workflow-port-${side}`;
    port.dataset.blockId = blockId;
    port.dataset.side = side;
    return port;
}

/**
 * Создаёт mock SVG контейнер для connections
 * @returns {SVGElement}
 */
function createMockSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'workflow-svg';
    svg.setAttribute('width', '5000');
    svg.setAttribute('height', '5000');
    return svg;
}

/**
 * Создаёт mock workflow canvas
 * @returns {HTMLElement}
 */
function createMockCanvas() {
    const canvas = document.createElement('div');
    canvas.id = 'workflow-canvas';
    canvas.style.transform = 'scale(1)';
    return canvas;
}

/**
 * Создаёт mock workflow container
 * @returns {HTMLElement}
 */
function createMockContainer() {
    const container = document.createElement('div');
    container.id = 'workflow-container';
    container.scrollLeft = 0;
    container.scrollTop = 0;
    
    // Mock getBoundingClientRect
    container.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        width: 1000,
        height: 800,
        x: 0,
        y: 0
    });
    
    return container;
}

/**
 * Создаёт полное mock workflow окружение
 * @param {Array<Object>} nodes - Массив конфигураций нод [{id, left, top, width, height}]
 * @returns {Object} - { container, canvas, svg, nodes }
 */
function createMockWorkflowEnvironment(nodes = []) {
    const container = createMockContainer();
    const canvas = createMockCanvas();
    const svg = createMockSvg();
    
    container.appendChild(canvas);
    container.appendChild(svg);
    
    const createdNodes = nodes.map(nodeConfig => {
        const node = createMockNode(nodeConfig.id, nodeConfig);
        
        // Добавляем порты
        ['top', 'right', 'bottom', 'left'].forEach(side => {
            const port = createMockPort(nodeConfig.id, side);
            node.appendChild(port);
        });
        
        canvas.appendChild(node);
        return node;
    });
    
    document.body.appendChild(container);
    
    return {
        container,
        canvas,
        svg,
        nodes: createdNodes,
        cleanup: () => {
            document.body.removeChild(container);
        }
    };
}

/**
 * Создаёт mock для edit modal
 * @returns {HTMLElement}
 */
function createMockEditModal() {
    const modal = document.createElement('div');
    modal.id = 'workflow-edit-modal';
    modal.className = 'hidden';
    
    const title = document.createElement('input');
    title.id = 'workflow-edit-title';
    
    const content = document.createElement('textarea');
    content.id = 'workflow-edit-content';
    
    modal.appendChild(title);
    modal.appendChild(content);
    
    return modal;
}

/**
 * Создаёт mock для zoom indicator
 * @returns {HTMLElement}
 */
function createMockZoomIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'zoom-indicator';
    indicator.textContent = '100%';
    return indicator;
}

/**
 * Создаёт mock для undo/redo кнопок
 * @returns {Object} - { undoBtn, redoBtn }
 */
function createMockUndoRedoButtons() {
    const undoBtn = document.createElement('button');
    undoBtn.id = 'undo-btn';
    undoBtn.disabled = true;
    
    const redoBtn = document.createElement('button');
    redoBtn.id = 'redo-btn';
    redoBtn.disabled = true;
    
    return { undoBtn, redoBtn };
}

module.exports = {
    createMockNode,
    createMockPort,
    createMockSvg,
    createMockCanvas,
    createMockContainer,
    createMockWorkflowEnvironment,
    createMockEditModal,
    createMockZoomIndicator,
    createMockUndoRedoButtons
};
