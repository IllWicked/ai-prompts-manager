/**
 * AI Prompts Manager - Utilities
 * Вспомогательные функции и утилиты
 * 
 * @exports
 *   - delay(ms) — Promise-based задержка
 *   - debounce(func, delay) — устранение дребезга
 *   - escapeHtml(str) — экранирование HTML
 *   - getCanvasScale(canvas) — получение scale из CSS transform
 *   - DOM getters: getWorkflowContainer(), getWorkflowCanvas(), etc.
 */

// Helper для задержки
const delay = ms => new Promise(r => setTimeout(r, ms));

// Helper для получения версии приложения
async function getAppVersion() {
    if (!window.__TAURI__) return 'dev';
    try {
        // Tauri 2.0 API
        return await window.__TAURI__.core.invoke('plugin:app|version');
    } catch {
        return 'unknown';
    }
}

// Кэш часто используемых DOM элементов (инициализируется после DOMContentLoaded)
const domCache = {
    container: null,
    canvas: null,
    svg: null,
    wrapper: null,
    editModal: null,
    editTitle: null,
    editContent: null,
    zoomIndicator: null,
    undoBtn: null,
    redoBtn: null
};

// Ленивое получение DOM элементов с кэшированием
function getCached(key, id) {
    if (!domCache[key]) domCache[key] = document.getElementById(id);
    return domCache[key];
}

const getWorkflowContainer = () => getCached('container', 'workflow-container');
const getWorkflowCanvas = () => getCached('canvas', 'workflow-canvas');
const getWorkflowSvg = () => getCached('svg', 'workflow-svg');
const getWorkflowWrapper = () => getCached('wrapper', 'workflow-wrapper');
const getEditModal = () => getCached('editModal', 'workflow-edit-modal');
const getEditTitle = () => getCached('editTitle', 'workflow-edit-title');
const getEditContent = () => getCached('editContent', 'workflow-edit-content');
const getZoomIndicator = () => getCached('zoomIndicator', 'zoom-indicator');
const getUndoBtn = () => getCached('undoBtn', 'undo-btn');
const getRedoBtn = () => getCached('redoBtn', 'redo-btn');

/**
 * Получить текущий scale canvas из CSS transform
 * @param {HTMLElement} canvas - элемент canvas (опционально, по умолчанию workflow-canvas)
 * @returns {number} scale (1 если нет transform)
 */
function getCanvasScale(canvas) {
    canvas = canvas || getWorkflowCanvas();
    if (!canvas) return 1;
    
    const transform = window.getComputedStyle(canvas).transform;
    if (transform && transform !== 'none') {
        const matrix = new DOMMatrix(transform);
        return matrix.a; // scaleX
    }
    return 1;
}

// Глобальная функция экранирования HTML для предотвращения XSS
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Утилита для устранения дребезга (debounce)
const debounce = (func, delay) => {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
};

// Генерация уникального ID для элемента
function generateItemId() {
    return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Получить синхронизированный animation-delay для индикаторов генерации
 * Все индикаторы будут пульсировать в одной фазе (период 1 сек)
 * @returns {string} CSS animation-delay значение (например "-350ms")
 */
function getGeneratingAnimationDelay() {
    const animationDuration = 1000; // 1s - длительность анимации pulse-generating
    const now = Date.now();
    const offset = now % animationDuration;
    return `-${offset}ms`;
}

// Алиас для обратной совместимости (используется в claude-ui.js)
window.getGeneratingAnimationDelay = getGeneratingAnimationDelay;

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM SCROLLBAR
// ═══════════════════════════════════════════════════════════════════════════

/** @type {Object|null} Данные активного скроллбара для drag */
let activeScrollbarData = null;

/**
 * Инициализация кастомного скроллбара
 * @param {HTMLElement} scrollable - скроллируемый контейнер
 * @param {HTMLElement} scrollbar - элемент скроллбара
 */
function initCustomScrollbar(scrollable, scrollbar) {
    const thumb = scrollbar.querySelector('.custom-scrollbar-thumb') || scrollbar.querySelector('.main-scrollbar-thumb');
    
    function updateThumb() {
        const scrollHeight = scrollable.scrollHeight;
        const clientHeight = scrollable.clientHeight;
        const trackHeight = scrollbar.clientHeight;
        
        if (scrollHeight <= clientHeight) {
            scrollbar.style.opacity = '0';
            scrollbar.style.pointerEvents = 'none';
            return;
        } else {
            scrollbar.style.opacity = '1';
            scrollbar.style.pointerEvents = 'auto';
        }
        
        const thumbHeight = Math.max(30, (clientHeight / scrollHeight) * trackHeight);
        const maxScroll = scrollHeight - clientHeight;
        const scrollPercent = scrollable.scrollTop / maxScroll;
        const thumbTop = scrollPercent * (trackHeight - thumbHeight);
        
        thumb.style.height = thumbHeight + 'px';
        thumb.style.top = thumbTop + 'px';
    }
    
    scrollable.addEventListener('scroll', updateThumb);
    
    const resizeObserver = new ResizeObserver(updateThumb);
    resizeObserver.observe(scrollable);
    
    thumb.addEventListener('mouseenter', () => {
        scrollbar.classList.add('active');
    });
    thumb.addEventListener('mouseleave', () => {
        if (!activeScrollbarData || !activeScrollbarData.isDragging || activeScrollbarData.scrollbar !== scrollbar) {
            scrollbar.classList.remove('active');
        }
    });
    
    thumb.addEventListener('mousedown', (e) => {
        activeScrollbarData = {
            isDragging: true,
            scrollable,
            scrollbar,
            thumb,
            startY: e.clientY,
            startScrollTop: scrollable.scrollTop
        };
        thumb.classList.add('dragging');
        scrollbar.classList.add('active');
        e.preventDefault();
    });
    
    scrollbar.addEventListener('click', (e) => {
        if (e.target === thumb) return;
        
        const rect = scrollbar.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const trackHeight = scrollbar.clientHeight;
        const scrollHeight = scrollable.scrollHeight;
        const clientHeight = scrollable.clientHeight;
        const scrollPercent = clickY / trackHeight;
        
        scrollable.scrollTop = scrollPercent * (scrollHeight - clientHeight);
    });
    
    setTimeout(updateThumb, 100);
}

/**
 * Инициализация глобальных обработчиков для drag скроллбаров
 * Вызывать один раз при загрузке страницы
 */
function initScrollbarGlobalHandlers() {
    document.addEventListener('mousemove', (e) => {
        if (!activeScrollbarData || !activeScrollbarData.isDragging) return;
        
        const { scrollable, scrollbar, thumb, startY, startScrollTop } = activeScrollbarData;
        const deltaY = e.clientY - startY;
        const scrollHeight = scrollable.scrollHeight;
        const clientHeight = scrollable.clientHeight;
        const trackHeight = scrollbar.clientHeight;
        const thumbHeight = Math.max(30, (clientHeight / scrollHeight) * trackHeight);
        const maxThumbTop = trackHeight - thumbHeight;
        const scrollRatio = (scrollHeight - clientHeight) / maxThumbTop;
        
        scrollable.scrollTop = startScrollTop + deltaY * scrollRatio;
    });
    
    document.addEventListener('mouseup', () => {
        if (activeScrollbarData && activeScrollbarData.isDragging) {
            activeScrollbarData.isDragging = false;
            activeScrollbarData.thumb.classList.remove('dragging');
            activeScrollbarData.scrollbar.classList.remove('active');
        }
    });
}

// Экспорт
window.initCustomScrollbar = initCustomScrollbar;
window.initScrollbarGlobalHandlers = initScrollbarGlobalHandlers;
window.escapeHtml = escapeHtml;
window.debounce = debounce;
window.generateItemId = generateItemId;
