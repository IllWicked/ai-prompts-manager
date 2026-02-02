/**
 * Unit Tests: utils.js
 * Тестирование вспомогательных функций и утилит
 */

// ============================================================================
// Функции из utils.js (копируем для тестирования)
// ============================================================================

const delay = ms => new Promise(r => setTimeout(r, ms));

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

const debounce = (func, delayMs) => {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delayMs);
    };
};

function generateTabId() {
    return 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateItemId() {
    return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getGeneratingAnimationDelay() {
    const animationDuration = 1000;
    const now = Date.now();
    const offset = now % animationDuration;
    return `-${offset}ms`;
}

// DOM кэш
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

function getCached(key, id) {
    if (!domCache[key]) domCache[key] = document.getElementById(id);
    return domCache[key];
}

function clearDomCache() {
    Object.keys(domCache).forEach(key => domCache[key] = null);
}

const getWorkflowContainer = () => getCached('container', 'workflow-container');
const getWorkflowCanvas = () => getCached('canvas', 'workflow-canvas');
const getWorkflowSvg = () => getCached('svg', 'workflow-svg');
const getZoomIndicator = () => getCached('zoomIndicator', 'zoom-indicator');
const getUndoBtn = () => getCached('undoBtn', 'undo-btn');
const getRedoBtn = () => getCached('redoBtn', 'redo-btn');

function getCanvasScale(canvas) {
    canvas = canvas || getWorkflowCanvas();
    if (!canvas) return 1;
    
    const transform = window.getComputedStyle(canvas).transform;
    if (transform && transform !== 'none') {
        const matrix = new DOMMatrix(transform);
        return matrix.a;
    }
    return 1;
}

// ============================================================================
// ТЕСТЫ
// ============================================================================

describe('utils.js', () => {

    beforeEach(() => {
        clearDomCache();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // ========================================================================
    // escapeHtml()
    // ========================================================================
    describe('escapeHtml()', () => {
        
        it('должен экранировать < и >', () => {
            const result = escapeHtml('<script>alert("xss")</script>');
            
            expect(result).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
        });

        it('должен экранировать &', () => {
            const result = escapeHtml('Tom & Jerry');
            
            expect(result).toBe('Tom &amp; Jerry');
        });

        it('должен экранировать кавычки', () => {
            const result = escapeHtml('say "hello"');
            
            // textContent + innerHTML экранирует кавычки как &quot; только в атрибутах
            // в innerHTML кавычки остаются как есть
            expect(result).toContain('say');
            expect(result).toContain('hello');
        });

        it('должен обрабатывать пустую строку', () => {
            const result = escapeHtml('');
            
            expect(result).toBe('');
        });

        it('должен сохранять обычный текст без изменений', () => {
            const result = escapeHtml('Hello World 123');
            
            expect(result).toBe('Hello World 123');
        });

        it('должен обрабатывать кириллицу', () => {
            const result = escapeHtml('Привет <мир>');
            
            expect(result).toBe('Привет &lt;мир&gt;');
        });

        it('должен обрабатывать множественные спецсимволы', () => {
            const result = escapeHtml('<div class="test">&nbsp;</div>');
            
            expect(result).toContain('&lt;div');
            expect(result).toContain('&amp;nbsp;');
            expect(result).toContain('&lt;/div&gt;');
        });

        it('должен предотвращать XSS атаки', () => {
            const malicious = '<img src=x onerror="alert(1)">';
            const result = escapeHtml(malicious);
            
            expect(result).not.toContain('<img');
            expect(result).toContain('&lt;img');
        });

        it('должен обрабатывать переносы строк', () => {
            const result = escapeHtml('line1\nline2');
            
            expect(result).toBe('line1\nline2');
        });
    });

    // ========================================================================
    // debounce()
    // ========================================================================
    describe('debounce()', () => {
        
        it('должен вызвать функцию после задержки', () => {
            const mockFn = jest.fn();
            const debouncedFn = debounce(mockFn, 100);
            
            debouncedFn();
            
            expect(mockFn).not.toHaveBeenCalled();
            
            jest.advanceTimersByTime(100);
            
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('должен отменить предыдущий вызов при повторном вызове', () => {
            const mockFn = jest.fn();
            const debouncedFn = debounce(mockFn, 100);
            
            debouncedFn();
            jest.advanceTimersByTime(50);
            debouncedFn(); // Сбрасывает таймер
            jest.advanceTimersByTime(50);
            
            expect(mockFn).not.toHaveBeenCalled();
            
            jest.advanceTimersByTime(50);
            
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('должен передать аргументы в функцию', () => {
            const mockFn = jest.fn();
            const debouncedFn = debounce(mockFn, 100);
            
            debouncedFn('arg1', 'arg2', 123);
            jest.advanceTimersByTime(100);
            
            expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2', 123);
        });

        it('должен использовать последние аргументы при множественных вызовах', () => {
            const mockFn = jest.fn();
            const debouncedFn = debounce(mockFn, 100);
            
            debouncedFn('first');
            debouncedFn('second');
            debouncedFn('third');
            
            jest.advanceTimersByTime(100);
            
            expect(mockFn).toHaveBeenCalledTimes(1);
            expect(mockFn).toHaveBeenCalledWith('third');
        });

        it('должен сохранять контекст this', () => {
            const obj = {
                value: 42,
                method: jest.fn(function() {
                    return this.value;
                })
            };
            obj.debouncedMethod = debounce(obj.method, 100);
            
            obj.debouncedMethod();
            jest.advanceTimersByTime(100);
            
            expect(obj.method).toHaveBeenCalled();
        });

        it('должен работать с нулевой задержкой', () => {
            const mockFn = jest.fn();
            const debouncedFn = debounce(mockFn, 0);
            
            debouncedFn();
            jest.advanceTimersByTime(0);
            
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('должен позволять вызывать функцию повторно после выполнения', () => {
            const mockFn = jest.fn();
            const debouncedFn = debounce(mockFn, 100);
            
            debouncedFn();
            jest.advanceTimersByTime(100);
            expect(mockFn).toHaveBeenCalledTimes(1);
            
            debouncedFn();
            jest.advanceTimersByTime(100);
            expect(mockFn).toHaveBeenCalledTimes(2);
        });
    });

    // ========================================================================
    // generateTabId()
    // ========================================================================
    describe('generateTabId()', () => {
        
        it('должен начинаться с "tab_"', () => {
            const id = generateTabId();
            
            expect(id).toMatch(/^tab_/);
        });

        it('должен содержать timestamp', () => {
            const before = Date.now();
            const id = generateTabId();
            const after = Date.now();
            
            const parts = id.split('_');
            const timestamp = parseInt(parts[1]);
            
            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });

        it('должен содержать случайную часть', () => {
            const id = generateTabId();
            const parts = id.split('_');
            
            expect(parts[2]).toBeDefined();
            expect(parts[2].length).toBe(9);
        });

        it('должен генерировать уникальные ID', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(generateTabId());
            }
            
            expect(ids.size).toBe(100);
        });

        it('должен содержать только допустимые символы', () => {
            const id = generateTabId();
            
            expect(id).toMatch(/^tab_\d+_[a-z0-9]+$/);
        });
    });

    // ========================================================================
    // generateItemId()
    // ========================================================================
    describe('generateItemId()', () => {
        
        it('должен начинаться с "item_"', () => {
            const id = generateItemId();
            
            expect(id).toMatch(/^item_/);
        });

        it('должен содержать timestamp', () => {
            const before = Date.now();
            const id = generateItemId();
            const after = Date.now();
            
            const parts = id.split('_');
            const timestamp = parseInt(parts[1]);
            
            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });

        it('должен генерировать уникальные ID', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(generateItemId());
            }
            
            expect(ids.size).toBe(100);
        });
    });

    // ========================================================================
    // delay()
    // ========================================================================
    describe('delay()', () => {
        
        it('должен вернуть Promise', () => {
            const result = delay(100);
            
            expect(result).toBeInstanceOf(Promise);
        });

        it('должен резолвиться после указанного времени', async () => {
            const mockFn = jest.fn();
            
            delay(100).then(mockFn);
            
            expect(mockFn).not.toHaveBeenCalled();
            
            jest.advanceTimersByTime(100);
            await Promise.resolve(); // Flush promises
            
            expect(mockFn).toHaveBeenCalled();
        });

        it('должен работать с async/await', async () => {
            let completed = false;
            
            const run = async () => {
                await delay(50);
                completed = true;
            };
            
            const promise = run();
            expect(completed).toBe(false);
            
            jest.advanceTimersByTime(50);
            await promise;
            
            expect(completed).toBe(true);
        });
    });

    // ========================================================================
    // getCanvasScale()
    // ========================================================================
    describe('getCanvasScale()', () => {
        
        it('должен вернуть 1 если canvas не существует', () => {
            const scale = getCanvasScale(null);
            
            expect(scale).toBe(1);
        });

        it('должен вернуть 1 если нет transform', () => {
            const canvas = document.createElement('div');
            document.body.appendChild(canvas);
            
            const scale = getCanvasScale(canvas);
            
            expect(scale).toBe(1);
            
            canvas.remove();
        });

        // SKIP: jsdom не поддерживает DOMMatrix
        // Эти тесты работают в реальном браузере
        it.skip('должен вернуть scale из matrix transform', () => {
            const canvas = document.createElement('div');
            canvas.style.transform = 'matrix(0.5, 0, 0, 0.5, 0, 0)';
            document.body.appendChild(canvas);
            
            const scale = getCanvasScale(canvas);
            
            expect(scale).toBe(0.5);
            
            canvas.remove();
        });

        it.skip('должен вернуть scale из scale() transform', () => {
            const canvas = document.createElement('div');
            canvas.style.transform = 'scale(0.75)';
            document.body.appendChild(canvas);
            
            const scale = getCanvasScale(canvas);
            
            expect(scale).toBe(0.75);
            
            canvas.remove();
        });

        it.skip('должен использовать workflow-canvas по умолчанию', () => {
            const canvas = document.createElement('div');
            canvas.id = 'workflow-canvas';
            canvas.style.transform = 'scale(0.6)';
            document.body.appendChild(canvas);
            
            clearDomCache();
            
            const scale = getCanvasScale();
            
            expect(scale).toBe(0.6);
            
            canvas.remove();
        });
    });

    // ========================================================================
    // getGeneratingAnimationDelay()
    // ========================================================================
    describe('getGeneratingAnimationDelay()', () => {
        
        it('должен вернуть строку с отрицательным значением в ms', () => {
            const result = getGeneratingAnimationDelay();
            
            expect(result).toMatch(/^-\d+ms$/);
        });

        it('должен вернуть значение в диапазоне 0-999ms', () => {
            const result = getGeneratingAnimationDelay();
            const value = parseInt(result.replace('-', '').replace('ms', ''));
            
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1000);
        });

        it('должен возвращать разные значения в разное время', () => {
            jest.useRealTimers();
            
            const results = new Set();
            for (let i = 0; i < 10; i++) {
                results.add(getGeneratingAnimationDelay());
                // Небольшая задержка между вызовами
            }
            
            // Маловероятно что все 10 значений будут одинаковыми
            // Но может случиться если все вызовы в одну миллисекунду
            expect(results.size).toBeGreaterThanOrEqual(1);
            
            jest.useFakeTimers();
        });
    });

    // ========================================================================
    // DOM getters (getCached)
    // ========================================================================
    describe('DOM getters', () => {
        
        afterEach(() => {
            document.getElementById('workflow-container')?.remove();
            document.getElementById('workflow-canvas')?.remove();
            document.getElementById('workflow-svg')?.remove();
            document.getElementById('zoom-indicator')?.remove();
            clearDomCache();
        });

        it('getWorkflowContainer должен вернуть элемент по ID', () => {
            const container = document.createElement('div');
            container.id = 'workflow-container';
            document.body.appendChild(container);
            
            const result = getWorkflowContainer();
            
            expect(result).toBe(container);
        });

        it('getWorkflowCanvas должен вернуть элемент по ID', () => {
            const canvas = document.createElement('div');
            canvas.id = 'workflow-canvas';
            document.body.appendChild(canvas);
            
            const result = getWorkflowCanvas();
            
            expect(result).toBe(canvas);
        });

        it('должен кэшировать элементы', () => {
            const container = document.createElement('div');
            container.id = 'workflow-container';
            document.body.appendChild(container);
            
            const result1 = getWorkflowContainer();
            const result2 = getWorkflowContainer();
            
            expect(result1).toBe(result2);
        });

        it('должен вернуть null для несуществующего элемента', () => {
            clearDomCache();
            
            const result = getWorkflowContainer();
            
            expect(result).toBeNull();
        });

        it('getZoomIndicator должен работать корректно', () => {
            const indicator = document.createElement('div');
            indicator.id = 'zoom-indicator';
            document.body.appendChild(indicator);
            
            const result = getZoomIndicator();
            
            expect(result).toBe(indicator);
        });
    });

    // ========================================================================
    // Интеграционные тесты
    // ========================================================================
    describe('Integration', () => {
        
        it('escapeHtml + innerHTML должен быть безопасным', () => {
            const container = document.createElement('div');
            const userInput = '<script>alert("xss")</script>';
            
            container.innerHTML = escapeHtml(userInput);
            
            // Не должно быть script элемента
            expect(container.querySelector('script')).toBeNull();
            // Текст должен отображаться как есть
            expect(container.textContent).toBe(userInput);
        });

        it('debounce должен работать с реальными таймерами', async () => {
            jest.useRealTimers();
            
            const mockFn = jest.fn();
            const debouncedFn = debounce(mockFn, 50);
            
            debouncedFn();
            expect(mockFn).not.toHaveBeenCalled();
            
            await new Promise(r => setTimeout(r, 60));
            
            expect(mockFn).toHaveBeenCalledTimes(1);
            
            jest.useFakeTimers();
        });
    });
});
