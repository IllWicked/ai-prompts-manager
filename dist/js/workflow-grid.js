/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKFLOW GRID MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции для отображения сетки при перетаскивании блоков.
 * 
 * Зависимости:
 *   - DOM: #grid-overlay элемент
 * 
 * Экспортирует (глобально):
 *   - updateGridOverlay(blockX, blockY, blockWidth, blockHeight)
 *   - clearGridOverlay()
 */

/**
 * Обновление точек вокруг перетаскиваемого блока
 * @param {number} blockX - X координата блока
 * @param {number} blockY - Y координата блока
 * @param {number} blockWidth - Ширина блока
 * @param {number} blockHeight - Высота блока
 */
function updateGridOverlay(blockX, blockY, blockWidth, blockHeight) {
    const overlay = document.getElementById('grid-overlay');
    if (!overlay) return;
    
    // Очищаем старые точки
    overlay.innerHTML = '';
    
    const gridSize = WORKFLOW_CONFIG.GRID_SIZE;
    const steps = 4; // 4 шага в каждом направлении
    const radius = steps * gridSize; // 160px
    const minDotSize = 3;
    const maxDotSize = 12;
    
    // Границы блока
    const blockLeft = blockX;
    const blockRight = blockX + blockWidth;
    const blockTop = blockY;
    const blockBottom = blockY + blockHeight;
    
    // Область поиска точек - от границ блока + radius
    const startX = Math.floor((blockLeft - radius) / gridSize) * gridSize + 20;
    const endX = Math.ceil((blockRight + radius) / gridSize) * gridSize + 20;
    const startY = Math.floor((blockTop - radius) / gridSize) * gridSize + 20;
    const endY = Math.ceil((blockBottom + radius) / gridSize) * gridSize + 20;
    
    // Создаём точки в области вокруг блока
    for (let x = startX; x <= endX; x += gridSize) {
        for (let y = startY; y <= endY; y += gridSize) {
            // Пропускаем за пределами холста
            if (x < 0 || x > 5000 || y < 0 || y > 5000) continue;
            
            // Расстояние от точки до ближайшей границы блока
            const distX = Math.max(0, blockLeft - x, x - blockRight);
            const distY = Math.max(0, blockTop - y, y - blockBottom);
            const distance = Math.sqrt(distX * distX + distY * distY);
            
            // Пропускаем если слишком далеко
            if (distance > radius) continue;
            
            // Пропускаем точки внутри блока
            if (x >= blockLeft && x <= blockRight && y >= blockTop && y <= blockBottom) continue;
            
            // Размер: ближе к блоку = больше
            const ratio = 1 - (distance / radius);
            const eased = ratio * ratio; // Квадратичное смягчение
            const dotSize = minDotSize + (maxDotSize - minDotSize) * eased;
            
            // Цвет: ближе к блоку = светлее, дальше = темнее (как фоновая сетка)
            // Фоновая сетка ~100 для dark, точки от 100 до 110
            const minGray = 100;  // дальние - как фон
            const maxGray = 110;  // ближние - светлее
            const gray = Math.round(minGray + (maxGray - minGray) * eased);
            
            const dot = document.createElement('div');
            dot.className = 'grid-dot';
            dot.style.left = x + 'px';
            dot.style.top = y + 'px';
            dot.style.width = dotSize + 'px';
            dot.style.height = dotSize + 'px';
            dot.style.background = `rgb(${gray}, ${gray}, ${gray})`;
            overlay.appendChild(dot);
        }
    }
}

/**
 * Очистка оверлея сетки
 */
function clearGridOverlay() {
    const overlay = document.getElementById('grid-overlay');
    if (overlay) {
        overlay.innerHTML = '';
    }
}
