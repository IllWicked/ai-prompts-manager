/**
 * Unit Tests: connections.js
 * Тестирование функций работы со связями между блоками workflow
 */

// ============================================================================
// Моки и глобальные переменные
// ============================================================================

let workflowConnections = [];
let isEditMode = false;

// Mock функции
function saveWorkflowState() {
    // Mock
}

function renderConnections() {
    // Mock
}

// Mock WORKFLOW_CONFIG
const WORKFLOW_CONFIG = {
    MAGNET_DISTANCE: 30
};

// ============================================================================
// Функции из connections.js (копируем для тестирования)
// ============================================================================

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

function buildBezierPath(startX, startY, startSide, endX, endY, endSide) {
    const dx = endX - startX;
    const dy = endY - startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    let cp1x, cp1y, cp2x, cp2y;
    
    const isStartHorizontal = (startSide === 'right' || startSide === 'left');
    const isStartVertical = (startSide === 'bottom' || startSide === 'top');
    const isEndHorizontal = endSide && (endSide === 'right' || endSide === 'left');
    const isEndVertical = endSide && (endSide === 'bottom' || endSide === 'top');
    
    if (isStartHorizontal && (!endSide || isEndHorizontal)) {
        const midX = startX + dx / 2;
        cp1x = midX;
        cp1y = startY;
        cp2x = midX;
        cp2y = endY;
    } else if (isStartVertical && (!endSide || isEndVertical)) {
        const midY = startY + dy / 2;
        cp1x = startX;
        cp1y = midY;
        cp2x = endX;
        cp2y = midY;
    } else {
        const tension = Math.min(absDx, absDy) * 0.5 + 30;
        
        cp1x = startX;
        cp1y = startY;
        cp2x = endX;
        cp2y = endY;
        
        if (startSide === 'right') cp1x += tension;
        else if (startSide === 'left') cp1x -= tension;
        else if (startSide === 'bottom') cp1y += tension;
        else if (startSide === 'top') cp1y -= tension;
        
        if (endSide === 'right') cp2x += tension;
        else if (endSide === 'left') cp2x -= tension;
        else if (endSide === 'bottom') cp2y += tension;
        else if (endSide === 'top') cp2y -= tension;
    }
    
    return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
}

function findNearestPort(x, y, excludeBlockId) {
    const magnetDistance = WORKFLOW_CONFIG.MAGNET_DISTANCE;
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

function addConnection(fromBlockId, fromSide, toBlockId, toSide) {
    const exists = workflowConnections.some(c => 
        c.from === fromBlockId && c.to === toBlockId
    );
    if (exists) return false;
    
    if (wouldCreateCycle(fromBlockId, toBlockId)) {
        showToast('Нельзя создать циклическую связь', 2000);
        return false;
    }
    
    workflowConnections.push({
        from: fromBlockId, 
        fromSide: fromSide,
        to: toBlockId,
        toSide: toSide
    });
    renderConnections();
    saveWorkflowState();
    return true;
}

function removeConnection(fromBlockId, fromSide, toBlockId, toSide) {
    const initialLength = workflowConnections.length;
    workflowConnections = workflowConnections.filter(
        c => !(c.from === fromBlockId && c.fromSide === fromSide && 
               c.to === toBlockId && c.toSide === toSide)
    );
    if (workflowConnections.length < initialLength) {
        renderConnections();
        saveWorkflowState();
        return true;
    }
    return false;
}

// ============================================================================
// Вспомогательные функции для тестов
// ============================================================================

function createMockNode(blockId, { left = 0, top = 0, width = 200, height = 150 } = {}) {
    const node = document.createElement('div');
    node.className = 'workflow-node';
    node.dataset.blockId = blockId;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    
    Object.defineProperty(node, 'offsetWidth', { value: width, configurable: true });
    Object.defineProperty(node, 'offsetHeight', { value: height, configurable: true });
    
    // Добавляем порты
    ['top', 'right', 'bottom', 'left'].forEach(side => {
        const port = document.createElement('div');
        port.className = `workflow-port workflow-port-${side}`;
        port.dataset.blockId = blockId;
        port.dataset.side = side;
        node.appendChild(port);
    });
    
    document.body.appendChild(node);
    return node;
}

function cleanupNodes() {
    document.querySelectorAll('.workflow-node').forEach(n => n.remove());
}

function resetConnections() {
    workflowConnections = [];
}

// ============================================================================
// ТЕСТЫ
// ============================================================================

describe('connections.js', () => {
    
    beforeEach(() => {
        resetConnections();
        cleanupNodes();
        isEditMode = true;
        jest.clearAllMocks();
    });

    afterEach(() => {
        cleanupNodes();
    });

    // ========================================================================
    // getPortPosition()
    // ========================================================================
    describe('getPortPosition()', () => {
        
        it('должен вернуть позицию верхнего порта (top)', () => {
            createMockNode('block1', { left: 100, top: 50, width: 200, height: 150 });
            
            const pos = getPortPosition('block1', 'top');
            
            expect(pos.x).toBe(200); // left + width/2 = 100 + 100
            expect(pos.y).toBe(50);  // top
        });

        it('должен вернуть позицию правого порта (right)', () => {
            createMockNode('block1', { left: 100, top: 50, width: 200, height: 150 });
            
            const pos = getPortPosition('block1', 'right');
            
            expect(pos.x).toBe(300); // left + width = 100 + 200
            expect(pos.y).toBe(125); // top + height/2 = 50 + 75
        });

        it('должен вернуть позицию нижнего порта (bottom)', () => {
            createMockNode('block1', { left: 100, top: 50, width: 200, height: 150 });
            
            const pos = getPortPosition('block1', 'bottom');
            
            expect(pos.x).toBe(200); // left + width/2
            expect(pos.y).toBe(200); // top + height = 50 + 150
        });

        it('должен вернуть позицию левого порта (left)', () => {
            createMockNode('block1', { left: 100, top: 50, width: 200, height: 150 });
            
            const pos = getPortPosition('block1', 'left');
            
            expect(pos.x).toBe(100); // left
            expect(pos.y).toBe(125); // top + height/2
        });

        it('должен вернуть {0,0} для несуществующего блока', () => {
            const pos = getPortPosition('non-existent', 'right');
            
            expect(pos.x).toBe(0);
            expect(pos.y).toBe(0);
        });

        it('должен использовать left как дефолт для неизвестной стороны', () => {
            createMockNode('block1', { left: 100, top: 50, width: 200, height: 150 });
            
            const pos = getPortPosition('block1', 'unknown');
            
            expect(pos.x).toBe(100); // left
            expect(pos.y).toBe(125); // top + height/2
        });
    });

    // ========================================================================
    // buildBezierPath()
    // ========================================================================
    describe('buildBezierPath()', () => {
        
        it('должен создать горизонтальную S-кривую (right → left)', () => {
            const path = buildBezierPath(0, 100, 'right', 200, 150, 'left');
            
            expect(path).toMatch(/^M 0 100 C/);
            expect(path).toMatch(/200 150$/);
        });

        it('должен создать вертикальную S-кривую (bottom → top)', () => {
            const path = buildBezierPath(100, 0, 'bottom', 150, 200, 'top');
            
            expect(path).toMatch(/^M 100 0 C/);
            expect(path).toMatch(/150 200$/);
        });

        it('должен создать смешанную кривую (right → top)', () => {
            const path = buildBezierPath(0, 100, 'right', 200, 0, 'top');
            
            expect(path).toMatch(/^M 0 100 C/);
            expect(path).toMatch(/200 0$/);
        });

        it('должен работать без конечной стороны (свободный конец)', () => {
            const path = buildBezierPath(0, 100, 'right', 200, 150, null);
            
            expect(path).toMatch(/^M 0 100 C/);
            expect(path).toMatch(/200 150$/);
        });

        it('должен корректно обработать left → right', () => {
            const path = buildBezierPath(100, 50, 'left', 0, 100, 'right');
            
            expect(path).toContain('M 100 50 C');
            expect(path).toContain('0 100');
        });

        it('должен корректно обработать top → bottom', () => {
            const path = buildBezierPath(100, 50, 'top', 100, 200, 'bottom');
            
            expect(path).toContain('M 100 50 C');
            expect(path).toContain('100 200');
        });
    });

    // ========================================================================
    // findNearestPort()
    // ========================================================================
    describe('findNearestPort()', () => {
        
        it('должен найти ближайший порт в пределах магнита', () => {
            createMockNode('block1', { left: 100, top: 50, width: 200, height: 150 });
            // right порт находится на (300, 125)
            
            const nearest = findNearestPort(295, 120, 'other-block');
            
            expect(nearest).not.toBeNull();
            expect(nearest.blockId).toBe('block1');
            expect(nearest.side).toBe('right');
        });

        it('должен вернуть null если нет портов в пределах магнита', () => {
            createMockNode('block1', { left: 100, top: 50, width: 200, height: 150 });
            
            const nearest = findNearestPort(1000, 1000, 'other-block');
            
            expect(nearest).toBeNull();
        });

        it('должен исключить порты указанного блока', () => {
            createMockNode('block1', { left: 100, top: 50, width: 200, height: 150 });
            
            const nearest = findNearestPort(300, 125, 'block1'); // Прямо на порте block1
            
            expect(nearest).toBeNull();
        });

        it('должен выбрать ближайший из нескольких портов', () => {
            createMockNode('block1', { left: 0, top: 0, width: 100, height: 100 });
            createMockNode('block2', { left: 200, top: 0, width: 100, height: 100 });
            // block1 right порт на (100, 50)
            // block2 left порт на (200, 50)
            
            const nearest = findNearestPort(105, 50, 'other-block');
            
            expect(nearest.blockId).toBe('block1');
            expect(nearest.side).toBe('right');
        });

        it('должен вернуть координаты найденного порта', () => {
            createMockNode('block1', { left: 100, top: 50, width: 200, height: 150 });
            
            const nearest = findNearestPort(295, 120, 'other-block');
            
            expect(nearest.x).toBe(300); // right port x
            expect(nearest.y).toBe(125); // right port y
        });
    });

    // ========================================================================
    // wouldCreateCycle()
    // ========================================================================
    describe('wouldCreateCycle()', () => {
        
        it('должен вернуть false если нет соединений', () => {
            workflowConnections = [];
            
            const result = wouldCreateCycle('A', 'B');
            
            expect(result).toBe(false);
        });

        it('должен вернуть true для прямого цикла (A→B, B→A)', () => {
            workflowConnections = [
                { from: 'A', to: 'B' }
            ];
            
            const result = wouldCreateCycle('B', 'A');
            
            expect(result).toBe(true);
        });

        it('должен вернуть true для цепочки (A→B→C, C→A)', () => {
            workflowConnections = [
                { from: 'A', to: 'B' },
                { from: 'B', to: 'C' }
            ];
            
            const result = wouldCreateCycle('C', 'A');
            
            expect(result).toBe(true);
        });

        it('должен вернуть false для допустимого соединения', () => {
            workflowConnections = [
                { from: 'A', to: 'B' },
                { from: 'B', to: 'C' }
            ];
            
            const result = wouldCreateCycle('A', 'C');
            
            expect(result).toBe(false);
        });

        it('должен обрабатывать сложный граф с множеством веток', () => {
            workflowConnections = [
                { from: 'A', to: 'B' },
                { from: 'A', to: 'C' },
                { from: 'B', to: 'D' },
                { from: 'C', to: 'D' },
                { from: 'D', to: 'E' }
            ];
            
            // E→A создаст цикл
            expect(wouldCreateCycle('E', 'A')).toBe(true);
            
            // A→E не создаст цикл (уже есть путь A→...→E)
            expect(wouldCreateCycle('A', 'E')).toBe(false);
        });

        it('должен вернуть false для отсоединённых подграфов', () => {
            workflowConnections = [
                { from: 'A', to: 'B' },
                { from: 'C', to: 'D' }
            ];
            
            const result = wouldCreateCycle('B', 'C');
            
            expect(result).toBe(false);
        });

        it('должен обрабатывать глубокую цепочку', () => {
            // A → B → C → D → E → F → G
            workflowConnections = [
                { from: 'A', to: 'B' },
                { from: 'B', to: 'C' },
                { from: 'C', to: 'D' },
                { from: 'D', to: 'E' },
                { from: 'E', to: 'F' },
                { from: 'F', to: 'G' }
            ];
            
            // G → A создаст цикл
            expect(wouldCreateCycle('G', 'A')).toBe(true);
            
            // G → B тоже создаст цикл
            expect(wouldCreateCycle('G', 'B')).toBe(true);
        });
    });

    // ========================================================================
    // addConnection()
    // ========================================================================
    describe('addConnection()', () => {
        
        it('должен добавить новое соединение', () => {
            const result = addConnection('A', 'right', 'B', 'left');
            
            expect(result).toBe(true);
            expect(workflowConnections).toHaveLength(1);
            expect(workflowConnections[0]).toEqual({
                from: 'A',
                fromSide: 'right',
                to: 'B',
                toSide: 'left'
            });
        });

        it('не должен добавлять дубликат соединения', () => {
            addConnection('A', 'right', 'B', 'left');
            const result = addConnection('A', 'bottom', 'B', 'top'); // Те же блоки, другие стороны
            
            expect(result).toBe(false);
            expect(workflowConnections).toHaveLength(1);
        });

        it('не должен добавлять циклическое соединение', () => {
            addConnection('A', 'right', 'B', 'left');
            const result = addConnection('B', 'right', 'A', 'left');
            
            expect(result).toBe(false);
            expect(workflowConnections).toHaveLength(1);
            expect(showToast).toHaveBeenCalledWith('Нельзя создать циклическую связь', 2000);
        });

        it('должен позволять несколько соединений от одного блока', () => {
            addConnection('A', 'right', 'B', 'left');
            addConnection('A', 'bottom', 'C', 'top');
            
            expect(workflowConnections).toHaveLength(2);
        });

        it('должен позволять несколько соединений к одному блоку', () => {
            addConnection('A', 'right', 'C', 'left');
            addConnection('B', 'right', 'C', 'top');
            
            expect(workflowConnections).toHaveLength(2);
        });
    });

    // ========================================================================
    // removeConnection()
    // ========================================================================
    describe('removeConnection()', () => {
        
        it('должен удалить существующее соединение', () => {
            workflowConnections = [
                { from: 'A', fromSide: 'right', to: 'B', toSide: 'left' }
            ];
            
            const result = removeConnection('A', 'right', 'B', 'left');
            
            expect(result).toBe(true);
            expect(workflowConnections).toHaveLength(0);
        });

        it('не должен удалять если соединение не найдено', () => {
            workflowConnections = [
                { from: 'A', fromSide: 'right', to: 'B', toSide: 'left' }
            ];
            
            const result = removeConnection('A', 'right', 'C', 'left');
            
            expect(result).toBe(false);
            expect(workflowConnections).toHaveLength(1);
        });

        it('должен удалить только указанное соединение', () => {
            workflowConnections = [
                { from: 'A', fromSide: 'right', to: 'B', toSide: 'left' },
                { from: 'A', fromSide: 'bottom', to: 'C', toSide: 'top' },
                { from: 'B', fromSide: 'right', to: 'C', toSide: 'left' }
            ];
            
            removeConnection('A', 'bottom', 'C', 'top');
            
            expect(workflowConnections).toHaveLength(2);
            expect(workflowConnections.some(c => c.to === 'C' && c.from === 'A')).toBe(false);
        });

        it('должен учитывать стороны при удалении', () => {
            workflowConnections = [
                { from: 'A', fromSide: 'right', to: 'B', toSide: 'left' }
            ];
            
            // Попытка удалить с неправильными сторонами
            const result = removeConnection('A', 'bottom', 'B', 'top');
            
            expect(result).toBe(false);
            expect(workflowConnections).toHaveLength(1);
        });
    });

    // ========================================================================
    // Интеграционные тесты
    // ========================================================================
    describe('Integration', () => {
        
        it('должен корректно работать сценарий создания графа', () => {
            // Создаём простой граф: A → B → C
            addConnection('A', 'right', 'B', 'left');
            addConnection('B', 'right', 'C', 'left');
            
            expect(workflowConnections).toHaveLength(2);
            
            // Попытка создать цикл C → A
            addConnection('C', 'right', 'A', 'left');
            
            expect(workflowConnections).toHaveLength(2); // Не добавилось
            
            // Удаляем одно соединение
            removeConnection('A', 'right', 'B', 'left');
            
            expect(workflowConnections).toHaveLength(1);
            expect(workflowConnections[0].from).toBe('B');
        });

        it('должен позволить создание ветвящегося графа', () => {
            //     B
            //    /
            // A <
            //    \
            //     C
            addConnection('A', 'right', 'B', 'left');
            addConnection('A', 'bottom', 'C', 'top');
            
            // B и C сходятся в D
            addConnection('B', 'right', 'D', 'left');
            addConnection('C', 'right', 'D', 'bottom');
            
            expect(workflowConnections).toHaveLength(4);
            
            // D → A создаст цикл
            expect(wouldCreateCycle('D', 'A')).toBe(true);
        });
    });
});
