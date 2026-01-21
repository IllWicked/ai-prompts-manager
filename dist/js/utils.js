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

// Генерация уникального ID для вкладки
function generateTabId() {
    return 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Генерация уникального ID для элемента
function generateItemId() {
    return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Получить синхронизированный animation-delay для пульсирующих индикаторов
 * Все индикаторы будут пульсировать в одной фазе
 * @returns {string} CSS animation-delay значение (например "-0.35s")
 */
function getSyncedAnimationDelay() {
    const animationDuration = 1000; // 1s - длительность анимации pulse-generating
    const now = Date.now();
    const offset = now % animationDuration;
    return `-${offset}ms`;
}
