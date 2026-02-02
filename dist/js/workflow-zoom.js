/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKFLOW ZOOM MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции масштабирования и навигации по workflow canvas.
 * 
 * Зависимости:
 *   - window.AppState (shared state)
 *   - workflowZoom, isEditMode (алиасы)
 *   - getWorkflowContainer(), getWorkflowCanvas(), getWorkflowWrapper(), getZoomIndicator() (DOM getters)
 *   - selectedNodes, clearNodeSelection() (из index.html)
 * 
 * @requires config.js (STORAGE_KEYS)
 * 
 * Экспортирует (глобально):
 *   - adjustWorkflowScale(resetScroll)
 *   - calculateContentBounds()
 *   - calculateViewModeZoom()
 *   - setupWorkflowZoom()
 *   - scrollToBlocks()
 */

/**
 * Масштабирование workflow под размер контейнера
 */
function adjustWorkflowScale() {
    const container = getWorkflowContainer();
    const canvas = getWorkflowCanvas();
    const wrapper = getWorkflowWrapper();
    if (!container || !canvas || !wrapper) return;
    
    const nodes = document.querySelectorAll('.workflow-node');
    
    const indicator = getZoomIndicator();
    
    if (isEditMode) {
        // Edit mode - применяем текущий zoom
        canvas.style.transform = `scale(${workflowZoom})`;
        canvas.style.transformOrigin = 'top left';
        
        // Edit mode - восстанавливаем большой холст и позицию
        canvas.style.minWidth = '5000px';
        canvas.style.minHeight = '5000px';
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.style.left = '';
        canvas.style.top = '';
        
        // Устанавливаем CSS переменную для обратного зума (для масштабирования кликабельных зон)
        canvas.style.setProperty('--zoom-inverse', 1 / workflowZoom);
        
        // Edit mode - wrapper сбрасываем
        wrapper.style.width = '';
        wrapper.style.height = '';
        
        // Показываем и обновляем индикатор зума
        if (indicator) {
            indicator.textContent = Math.round(workflowZoom * 100) + '%';
            indicator.classList.add('visible');
        }
        
        // В edit mode НЕ скроллим автоматически - камера остаётся где пользователь её оставил
        // scrollToBlocks() вызывается только явно при переключении в edit mode
    } else {
        // View mode - автоматический zoom чтобы все блоки были видны
        const viewZoom = calculateViewModeZoom();
        
        // Устанавливаем CSS переменную для view mode тоже
        canvas.style.setProperty('--zoom-inverse', 1 / viewZoom);
        
        // View mode - canvas остаётся большим (для SVG линий)
        canvas.style.minWidth = '5000px';
        canvas.style.minHeight = '5000px';
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.style.left = '0';
        canvas.style.top = '0';
        
        // Вычисляем bounds контента
        const bounds = calculateContentBounds();
        
        // Сдвигаем canvas через translate (применяется до scale)
        // чтобы контент начинался с начала wrapper
        const offsetX = -bounds.minX + 25;
        const offsetY = -bounds.minY + 25;
        canvas.style.transform = `scale(${viewZoom}) translate(${offsetX}px, ${offsetY}px)`;
        canvas.style.transformOrigin = 'top left';
        
        // Wrapper = размер контента * zoom
        const contentWidth = bounds.maxX - bounds.minX + 50;
        const contentHeight = bounds.maxY - bounds.minY + 50;
        wrapper.style.width = (contentWidth * viewZoom) + 'px';
        
        // Добавляем отступ только если видна кнопка завершения/продолжения проекта
        const finishBtn = document.getElementById('finish-project-btn');
        const continueBtn = document.getElementById('continue-project-btn');
        const buttonVisible = finishBtn?.classList.contains('visible') || continueBtn?.classList.contains('visible');
        const buttonOffset = buttonVisible ? 75 : 0;
        wrapper.style.height = (contentHeight * viewZoom) + buttonOffset + 'px';
        
        // Скрываем индикатор
        if (indicator) {
            indicator.classList.remove('visible');
        }
        
        // В view mode тоже НЕ скроллим автоматически - камера остаётся где пользователь её оставил
    }
}

/**
 * Вычисление границ контента (для view mode wrapper)
 * @returns {{minX: number, maxX: number, minY: number, maxY: number}}
 */
function calculateContentBounds() {
    const nodes = document.querySelectorAll('.workflow-node');
    if (nodes.length === 0) {
        return { minX: 0, maxX: 800, minY: 0, maxY: 600 };
    }
    
    let minX = Infinity, maxX = 0;
    let minY = Infinity, maxY = 0;
    
    nodes.forEach(node => {
        const x = parseInt(node.style.left) || 0;
        const y = parseInt(node.style.top) || 0;
        const width = node.offsetWidth || 700;
        const height = node.offsetHeight || 200;
        
        if (x < minX) minX = x;
        if (x + width > maxX) maxX = x + width;
        if (y < minY) minY = y;
        if (y + height > maxY) maxY = y + height;
    });
    
    return { minX, maxX, minY, maxY };
}

/**
 * Вычисление оптимального zoom для view mode
 * @returns {number} Zoom level (0.1 - 0.5)
 */
function calculateViewModeZoom() {
    const container = getWorkflowContainer();
    const nodes = document.querySelectorAll('.workflow-node');
    if (!container || nodes.length === 0) return 0.6;
    
    let minX = Infinity;
    let maxX = 0;
    
    nodes.forEach(node => {
        const x = parseInt(node.style.left) || 0;
        const width = node.offsetWidth || 700;
        
        if (x < minX) minX = x;
        if (x + width > maxX) maxX = x + width;
    });
    
    const contentWidth = maxX - minX + 80; // padding
    const containerWidth = container.clientWidth;
    
    // Вычисляем zoom только по ширине
    let zoom = containerWidth / contentWidth;
    
    // Минимум 0.1, максимум 0.5 (чтобы не было слишком крупно)
    return Math.max(0.1, Math.min(0.5, zoom));
}

/**
 * Настройка zoom и panning для workflow canvas
 * Включает: Ctrl+wheel zoom, panning средней кнопкой/левой на пустом месте
 */
function setupWorkflowZoom() {
    const container = getWorkflowContainer();
    if (!container) return;
    
    container.addEventListener('wheel', (e) => {
        if (!isEditMode) return;
        
        // Ctrl + scroll = zoom
        if (e.ctrlKey) {
            e.preventDefault();
            
            const canvas = getWorkflowCanvas();
            if (!canvas) return;
            
            // Скорость zoom - 5% за шаг
            const zoomSpeed = 0.05;
            const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
            const newZoom = Math.max(WORKFLOW_CONFIG.ZOOM_MIN, Math.min(WORKFLOW_CONFIG.ZOOM_MAX, workflowZoom + delta));
            
            // Округляем для избежания дробных погрешностей
            const roundedZoom = Math.round(newZoom * 100) / 100;
            
            if (roundedZoom !== workflowZoom) {
                // Позиция курсора относительно контейнера
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left + container.scrollLeft;
                const mouseY = e.clientY - rect.top + container.scrollTop;
                
                // Позиция в координатах canvas
                const canvasX = mouseX / workflowZoom;
                const canvasY = mouseY / workflowZoom;
                
                // Обновляем zoom
                workflowZoom = roundedZoom;
                localStorage.setItem(STORAGE_KEYS.WORKFLOW_ZOOM, workflowZoom);
                canvas.style.transform = `scale(${workflowZoom})`;
                
                // Обновляем индикатор
                const indicator = getZoomIndicator();
                if (indicator) {
                    indicator.textContent = Math.round(workflowZoom * 100) + '%';
                }
                
                // Корректируем scroll чтобы zoom был к точке курсора
                const newMouseX = canvasX * workflowZoom;
                const newMouseY = canvasY * workflowZoom;
                
                container.scrollTo({
                    left: Math.round(newMouseX - (e.clientX - rect.left)),
                    top: Math.round(newMouseY - (e.clientY - rect.top)),
                    behavior: 'instant'
                });
            }
        } else {
            // Проверяем, не скроллим ли мы внутри textarea или другого scrollable элемента
            const scrollableEl = e.target.closest('textarea, .workflow-node-body');
            if (scrollableEl && scrollableEl.scrollHeight > scrollableEl.clientHeight) {
                const atTop = scrollableEl.scrollTop <= 0;
                const atBottom = scrollableEl.scrollTop + scrollableEl.clientHeight >= scrollableEl.scrollHeight - 1;
                const scrollingUp = e.deltaY < 0;
                const scrollingDown = e.deltaY > 0;
                
                // Если можно скроллить в нужном направлении — даём браузеру обработать
                if ((scrollingUp && !atTop) || (scrollingDown && !atBottom)) {
                    return; // Позволяем нативный скролл внутри элемента
                }
                // Если достигли края — блокируем чтобы не "проваливался" скролл на контейнер
                e.preventDefault();
                return;
            }
            
            // Обычный скролл — ограничиваем пределами холста
            // Canvas имеет фиксированный размер, transform: scale не меняет scrollable area
            const canvasSize = WORKFLOW_CONFIG.CANVAS_SIZE;
            const maxScrollX = Math.max(0, canvasSize - container.clientWidth);
            const maxScrollY = Math.max(0, canvasSize - container.clientHeight);
            
            // Вычисляем новую позицию
            let newScrollX = container.scrollLeft + (e.shiftKey ? e.deltaY : e.deltaX);
            let newScrollY = container.scrollTop + (e.shiftKey ? 0 : e.deltaY);
            
            // Ограничиваем
            newScrollX = Math.max(0, Math.min(maxScrollX, newScrollX));
            newScrollY = Math.max(0, Math.min(maxScrollY, newScrollY));
            
            // Если выходим за границы — превентим и скроллим вручную
            if (newScrollX !== container.scrollLeft + (e.shiftKey ? e.deltaY : e.deltaX) ||
                newScrollY !== container.scrollTop + (e.shiftKey ? 0 : e.deltaY)) {
                e.preventDefault();
                container.scrollLeft = newScrollX;
                container.scrollTop = newScrollY;
            }
        }
        // Shift + scroll = горизонтальный скролл (обрабатывается выше через shiftKey)
    }, { passive: false });
    
    // Panning холста (средняя кнопка мыши или Space + левая кнопка)
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panScrollLeft = 0;
    let panScrollTop = 0;
    
    container.addEventListener('mousedown', (e) => {
        // Снимаем выделение текста при клике на пустое место (в любом режиме)
        const isEmptyCanvas = e.target.id === 'workflow-canvas' || 
                              e.target.id === 'workflow-container' ||
                              e.target.classList.contains('workflow-svg') ||
                              e.target.classList.contains('workflow-wrapper') ||
                              e.target.classList.contains('grid-overlay') ||
                              e.target.tagName === 'path'; // SVG paths
        
        if (e.button === 0 && isEmptyCanvas && !window.isTextSelecting) {
            // Снимаем выделение текста
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                selection.removeAllRanges();
            }
            // Убираем фокус с textarea
            if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
                document.activeElement.blur();
            }
        }
        
        if (!isEditMode) return;
        
        // Средняя кнопка мыши (button === 1) или пустое место на холсте с левой кнопкой
        const isMiddleButton = e.button === 1;
        
        if (isMiddleButton || (e.button === 0 && isEmptyCanvas)) {
            // Снимаем выделение при клике на пустое место
            if (e.button === 0 && isEmptyCanvas && selectedNodes.size > 0) {
                clearNodeSelection();
            }
            
            // Для левой кнопки на пустом месте - начинаем panning
            if (e.button === 0 && isEmptyCanvas) {
                isPanning = true;
            } else if (isMiddleButton) {
                isPanning = true;
            }
            
            if (isPanning) {
                e.preventDefault();
                panStartX = e.clientX;
                panStartY = e.clientY;
                panScrollLeft = container.scrollLeft;
                panScrollTop = container.scrollTop;
                container.style.cursor = 'grabbing';
            }
        }
    });
    
    // Дополнительный обработчик click для надёжного снятия выделения
    container.addEventListener('click', (e) => {
        const isEmptyCanvas = e.target.id === 'workflow-canvas' || 
                              e.target.id === 'workflow-container' ||
                              e.target.classList.contains('workflow-svg') ||
                              e.target.classList.contains('workflow-wrapper') ||
                              e.target.classList.contains('grid-overlay') ||
                              e.target.tagName === 'path';
        
        if (isEmptyCanvas && !window.isTextSelecting) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
            }
        }
    });
    
    container.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        
        e.preventDefault();
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        
        // Ограничения scroll - не выходить за пределы холста
        const canvasSize = WORKFLOW_CONFIG.CANVAS_SIZE;
        const maxScrollX = Math.max(0, canvasSize - container.clientWidth);
        const maxScrollY = Math.max(0, canvasSize - container.clientHeight);
        
        container.scrollLeft = Math.max(0, Math.min(maxScrollX, panScrollLeft - dx));
        container.scrollTop = Math.max(0, Math.min(maxScrollY, panScrollTop - dy));
    });
    
    container.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            container.style.cursor = '';
        }
    });
    
    container.addEventListener('mouseleave', () => {
        if (isPanning) {
            isPanning = false;
            container.style.cursor = '';
        }
    });
}

/**
 * Прокрутка к блокам (в центр холста) - только для edit mode
 */
function scrollToBlocks() {
    const container = getWorkflowContainer();
    if (!container) return;
    
    // В view mode просто сбрасываем скролл - контент уже позиционирован через transform
    if (!isEditMode) {
        container.scrollTop = 0;
        return;
    }
    
    // Находим все блоки и определяем самый верхний
    const nodes = document.querySelectorAll('.workflow-node');
    if (nodes.length === 0) return;
    
    let minY = Infinity;
    let minX = Infinity;
    let maxX = 0;
    
    nodes.forEach(node => {
        const x = parseInt(node.style.left) || 0;
        const y = parseInt(node.style.top) || 0;
        const width = node.offsetWidth || 700;
        
        if (y < minY) minY = y;
        if (x < minX) minX = x;
        if (x + width > maxX) maxX = x + width;
    });
    
    // Центр блоков по горизонтали
    const blocksCenterX = (minX + maxX) / 2;
    
    // С учётом zoom
    const scaledCenterX = blocksCenterX * workflowZoom;
    const scaledMinY = minY * workflowZoom;
    
    const containerWidth = container.clientWidth;
    
    // Прокручиваем так, чтобы центр блоков был по центру экрана
    const scrollX = scaledCenterX - containerWidth / 2;
    // Немного отступа сверху (20px)
    const scrollY = Math.max(0, scaledMinY - 20);
    
    container.scrollLeft = Math.max(0, scrollX);
    container.scrollTop = scrollY;
}

// Экспорт
window.adjustWorkflowScale = adjustWorkflowScale;
window.scrollToBlocks = scrollToBlocks;
