// === Claude Helpers ===
// Общие функции для инжектирования в Claude.ai WebView
// Селекторы передаются через window._s из main.rs (selectors.json)

/**
 * Получить значение селектора по пути (поддержка вложенности)
 * @param {string} path - путь к селектору, например "generation.stopButton" или "ui.ghostButtonIndicator"
 * @returns {string|string[]|null} - селектор(ы) или null
 */
function __getSel__(path) {
    const parts = path.split('.');
    let value = window._s;
    for (const part of parts) {
        if (!value || typeof value !== 'object') return null;
        value = value[part];
    }
    return value;
}

/**
 * Поиск элемента по пути к селектору с fallback
 * @param {string} path - путь к селектору, например "navigation.leftNav"
 * @returns {Element|null}
 */
function __findEl__(path) {
    const selectors = __getSel__(path);
    if (!selectors) return null;
    const arr = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of arr) {
        try {
            const el = document.querySelector(sel);
            if (el) return el;
        } catch (e) {
            // Невалидный селектор — пробуем следующий
        }
    }
    return null;
}

/**
 * Эвристики для поиска элементов по контексту.
 * Используют стабильные атрибуты (aria-*, role, contenteditable),
 * которые привязаны к accessibility и меняются реже CSS-классов.
 */
const __HEURISTICS__ = {
    'input.proseMirror': () => {
        // ProseMirror — всегда contenteditable div
        return document.querySelector('[contenteditable="true"][role="textbox"]')
            || document.querySelector('[contenteditable="true"].ProseMirror')
            || document.querySelector('div[contenteditable="true"][data-placeholder]');
    },
    'input.sendButton': () => {
        // Кнопка Send — рядом с editor
        const editor = document.querySelector('.ProseMirror')
            || document.querySelector('[contenteditable="true"][role="textbox"]')
            || document.querySelector('[contenteditable="true"]');
        if (editor) {
            const area = editor.closest('fieldset') || editor.closest('form')
                || editor.closest('[role="presentation"]')
                || editor.parentElement?.parentElement?.parentElement;
            if (area) {
                const btn = area.querySelector('button[type="submit"]')
                    || area.querySelector('button[aria-label*="Send" i]')
                    || area.querySelector('button[aria-label*="send" i]')
                    || area.querySelector('button[data-testid*="send"]');
                if (btn) return btn;
                // Фоллбэк: последняя кнопка в области ввода (обычно Send)
                const buttons = area.querySelectorAll('button:not([aria-label*="Stop" i]):not([disabled])');
                if (buttons.length > 0) return buttons[buttons.length - 1];
            }
        }
        return null;
    },
    'input.fileInput': () => {
        return document.querySelector('input[type="file"][accept]');
    },
    'generation.stopButton': () => {
        // Кнопка Stop — ищем по aria-label, testid, или по SVG-иконке (квадрат = stop)
        return document.querySelector('button[aria-label*="Stop" i]')
            || document.querySelector('button[aria-label*="stop" i]')
            || document.querySelector('[data-testid*="stop"]')
            || document.querySelector('button[aria-label*="Cancel" i]')
            || (() => {
                // Фоллбэк: кнопка с квадратной SVG-иконкой рядом с input
                const editor = document.querySelector('.ProseMirror, [contenteditable="true"]');
                if (!editor) return null;
                const area = editor.closest('fieldset') || editor.closest('form') || editor.parentElement?.parentElement?.parentElement;
                if (!area) return null;
                const buttons = area.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.querySelector('rect, [d*="M4 4h16v16H4"], [d*="M6 6h12v12H6"]')) return btn;
                }
                return null;
            })();
    },
    'navigation.leftNav': () => {
        // Навигация — элемент nav в корне
        return document.querySelector('nav[aria-label]')
            || document.querySelector('body > div nav');
    },
    'navigation.pinSidebarButton': () => {
        return document.querySelector('button[data-testid*="sidebar"]')
            || document.querySelector('button[data-testid*="pin"]');
    },
    'navigation.scrollContainer': () => {
        // Скроллируемый контейнер с сообщениями
        // Ищем по классам overflow
        const byClass = document.querySelectorAll('[class*="overflow-y"]');
        for (const el of byClass) {
            if (el.scrollHeight > el.clientHeight + 100) return el;
        }
        // Фоллбэк: ищем main > div со скроллом, или [role="main"] потомок
        const main = document.querySelector('main') || document.querySelector('[role="main"]');
        if (main) {
            const children = main.querySelectorAll('div');
            for (const el of children) {
                const style = getComputedStyle(el);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 100) {
                    return el;
                }
            }
        }
        return null;
    },
    'ui.titleContainer': () => {
        // Контейнер заголовка чата — flex div с truncate в header
        const header = document.querySelector('header') || document.querySelector('[role="banner"]');
        if (!header) return null;
        return header.querySelector('[class*="truncate"]')
            || header.querySelector('[class*="font-bold"]');
    }
};

/**
 * Умный поиск элемента: сначала стандартный __findEl__, затем эвристики.
 * При срабатывании эвристики — логирует событие в диагностику.
 * @param {string} path - путь к селектору, например "input.proseMirror"
 * @returns {Element|null}
 */
function __findElSmart__(path) {
    // 1. Стандартный поиск по селекторам из selectors.json
    const el = __findEl__(path);
    if (el) return el;
    
    // 2. Эвристический fallback
    const heuristic = __HEURISTICS__[path];
    if (!heuristic) return null;
    
    try {
        const found = heuristic();
        if (found) {
            // Логируем: стандартный селектор сломан, но эвристика нашла
            __logSelectorFallback__(path);
            return found;
        }
    } catch (e) {
        // Эвристика упала — молча продолжаем
    }
    
    return null;
}

/**
 * Логирует срабатывание эвристического fallback в диагностику.
 * Дедупликация: не логирует один и тот же path чаще раза в 5 минут.
 */
const __fallbackLogTimestamps__ = {};
function __logSelectorFallback__(path) {
    const now = Date.now();
    if (__fallbackLogTimestamps__[path] && (now - __fallbackLogTimestamps__[path]) < 300000) {
        return; // Не чаще раза в 5 минут
    }
    __fallbackLogTimestamps__[path] = now;
    
    if (window._inv) {
        window._inv('write_diagnostic', {
            eventType: 'selector_heuristic_fallback',
            details: JSON.stringify({
                path: path,
                tab: window._t || 0
            })
        }).catch(() => {});
    }
}

/**
 * Health-check всех критических селекторов при запуске.
 * Проверяет стандартные селекторы из selectors.json.
 * Сломанные пишет в лог диагностики. Пользователь ничего не видит.
 */
function runSelectorHealthCheck() {
    const critical = [
        'input.proseMirror',
        'input.sendButton',
        'generation.stopButton',
        'navigation.leftNav',
        'navigation.scrollContainer'
    ];
    
    const broken = [];
    const heuristicWorking = [];
    
    for (const path of critical) {
        // Проверяем стандартный селектор (без эвристик)
        if (!__findEl__(path)) {
            // Стандартный не работает — проверяем эвристику
            const heuristic = __HEURISTICS__[path];
            let heuristicOk = false;
            if (heuristic) {
                try { heuristicOk = !!heuristic(); } catch(e) {}
            }
            
            if (heuristicOk) {
                heuristicWorking.push(path);
            } else {
                broken.push(path);
            }
        }
    }
    
    // Пишем в лог, только если что-то сломано
    if (broken.length > 0 || heuristicWorking.length > 0) {
        if (window._inv) {
            window._inv('write_diagnostic', {
                eventType: 'selector_health_check',
                details: JSON.stringify({
                    broken: broken,
                    heuristicOnly: heuristicWorking,
                    total: critical.length,
                    tab: window._t || 0
                })
            }).catch(() => {});
        }
    }
}

function hideGhostButton() {
    // Используем централизованный селектор
    const ghostIndicator = __getSel__('ui.ghostButtonIndicator');
    if (!ghostIndicator) return;
    
    // Ищем кнопку с ghost indicator напрямую через :has()
    // Fallback на перебор если :has() не поддерживается
    try {
        const ghost = document.querySelector(`button:has(${ghostIndicator})`);
        if (ghost) {
            ghost.style.display = 'none';
            return;
        }
    } catch (e) {
        // :has() не поддерживается, используем fallback
    }
    
    // Fallback: перебор кнопок (для старых браузеров)
    document.querySelectorAll('button').forEach(btn => {
        if (btn.querySelector(ghostIndicator)) {
            btn.style.display = 'none';
        }
    });
}

function hideSidebar() {
    // Отключаем перехват кликов у свёрнутого левого сайдбара
    const leftNav = __findElSmart__('navigation.leftNav');
    if (leftNav) {
        const navWidth = leftNav.offsetWidth;
        if (navWidth < 100) {
            leftNav.style.pointerEvents = 'none';
            const pinBtn = __findElSmart__('navigation.pinSidebarButton');
            if (pinBtn) {
                pinBtn.style.pointerEvents = 'auto';
            }
        } else {
            leftNav.style.pointerEvents = '';
        }
    }
}

function setupSidebarObserver() {
    if (window._o1) {
        window._o1.disconnect();
    }
    window._o1 = new MutationObserver(() => hideSidebar());
    
    const observeSidebar = () => {
        const leftNav = __findElSmart__('navigation.leftNav');
        if (leftNav) {
            window._o1.observe(leftNav, { 
                attributes: true, 
                attributeFilter: ['style', 'class'],
                subtree: false 
            });
        } else {
            setTimeout(observeSidebar, 500);
        }
    };
    observeSidebar();
}

/**
 * Объединённый MutationObserver с debounce через requestAnimationFrame
 * Заменяет отдельные ghostObserver и uiObserver для лучшей производительности
 */
function setupCombinedObserver() {
    if (window._o2) {
        window._o2.disconnect();
    }
    
    let uiUpdatePending = false;
    
    window._o2 = new MutationObserver(() => {
        if (uiUpdatePending) return;
        uiUpdatePending = true;
        
        requestAnimationFrame(() => {
            hideGhostButton();
            truncateChatTitle();
            uiUpdatePending = false;
        });
    });
    
    window._o2.observe(document.body, { childList: true, subtree: true });
}

function truncateChatTitle() {
    // Используем умный поиск с fallback на эвристики
    const titleContainer = __findElSmart__('ui.titleContainer');
    if (!titleContainer) return;
    
    // Применяем CSS для корректной работы truncate в flexbox
    // min-width: 0 позволяет flex-элементам сжиматься меньше их контента
    titleContainer.style.minWidth = '0';
    titleContainer.style.paddingRight = '0';
    
    // Находим все вложенные flex-контейнеры и применяем min-width: 0
    const flexChildren = titleContainer.querySelectorAll('div, button, a');
    flexChildren.forEach(el => {
        el.style.minWidth = '0';
    });
}

function initClaudeUI() {
    // === Мониторинг генерации через Tauri invoke ===
    // DOM polling → _inv('set_generation_state', {tab, generating}) → AtomicBool в Rust
    // Main WebView читает через check_generation_status (polling 500мс).
    // Sticky: при пропадании DOM-индикаторов состояние держится ещё ~2 сек
    // (7 тиков × 300мс) чтобы пережить переходы Claude между фазами.
    if (!window._g0) {
        window._g0 = true;
        var lastState = false;
        var falseCount = 0;
        var GEN_STICKY_COUNT = 7; // 7 × 300мс ≈ 2 сек
        
        function checkGenerating() {
            var SEL = window._s;
            if (!SEL || !SEL.generation) return;
            
            var detected = false;
            
            var stopSelectors = SEL.generation.stopButton;
            if (stopSelectors) {
                var arr = Array.isArray(stopSelectors) ? stopSelectors : [stopSelectors];
                for (var i = 0; i < arr.length; i++) {
                    try { if (document.querySelector(arr[i])) { detected = true; break; } } catch(e) {}
                }
            }
            if (!detected && SEL.generation.streamingIndicator) {
                try { if (document.querySelector(SEL.generation.streamingIndicator)) detected = true; } catch(e) {}
            }
            if (!detected && SEL.generation.thinkingIndicator) {
                try { if (document.querySelector(SEL.generation.thinkingIndicator)) detected = true; } catch(e) {}
            }
            
            // Sticky logic
            var isGenerating;
            if (detected) {
                falseCount = 0;
                isGenerating = true;
            } else if (lastState) {
                falseCount++;
                isGenerating = falseCount < GEN_STICKY_COUNT;
            } else {
                isGenerating = false;
            }
            
            if (isGenerating !== lastState) {
                lastState = isGenerating;
                // Прямой invoke → AtomicBool в Rust (надёжный канал, _inv проверен)
                if (window._inv) {
                    try { window._inv('set_generation_state', { tab: window._t, generating: isGenerating }); } catch(e) {}
                }
            }
        }
        
        if (window._g1) clearInterval(window._g1);
        window._g1 = setInterval(checkGenerating, 300);
        checkGenerating();
    }
    
    // Получаем селектор для artifact controls
    const artifactControlsSelector = __getSel__('ui.artifactControls') || '[data-testid="wiggle-controls-actions"]';
    
    // Стили для скрытия элементов и убирания рамок фокуса
    if (!document.getElementById('_cs')) {
        const style = document.createElement('style');
        style.id = '_cs';
        style.textContent = `
            *:focus { outline: none !important; }
            *:focus-visible { outline: none !important; }
            
            /* Скрываем весь контейнер с кнопками Share и сайдбаром артефактов */
            div:has(> ${artifactControlsSelector}) { display: none !important; }
        `;
        document.head.appendChild(style);
    }
    
    // Отслеживание изменения URL для проектов
    setupUrlChangeDetection();
    
    // Первоначальное скрытие элементов
    hideGhostButton();
    hideSidebar();
    truncateChatTitle();
    
    // Объединённый observer для UI обновлений (с debounce)
    setupCombinedObserver();
    
    // Отдельный observer для сайдбара (точечный, без subtree)
    setupSidebarObserver();
    
    // Глобальный слушатель кликов - закрывает downloads popup
    setupGlobalClickListener();
    
    // Резервный интервал (редкий, на случай пропуска)
    if (window._u0) {
        clearInterval(window._u0);
    }
    window._u0 = setInterval(() => { hideSidebar(); truncateChatTitle(); }, 5000);
    
    // Health-check селекторов через 3 сек (DOM должен стабилизироваться)
    setTimeout(runSelectorHealthCheck, 3000);
}

/**
 * Слушает клики в Claude webview и закрывает downloads popup
 */
function setupGlobalClickListener() {
    if (window._c0) return;
    window._c0 = true;
    
    document.addEventListener('click', () => {
        if (window._inv) {
            window._inv('hide_downloads').catch(() => {});
        }
    }, { capture: true });
}

/**
 * Отслеживает изменения URL и уведомляет Tauri
 * Нужно для детекции перехода на страницу проекта
 * 
 * Использует popstate (back/forward) + polling каждые 2 сек.
 * Не патчит history.pushState/replaceState.
 */
function setupUrlChangeDetection() {
    if (window._d0) return;
    window._d0 = true;
    
    let lastUrl = location.href;
    
    // Функция проверки и уведомления
    const checkUrlChange = () => {
        if (location.href !== lastUrl) {
            const oldUrl = lastUrl;
            lastUrl = location.href;
            
            // Игнорируем изменения только в hash
            const oldBase = oldUrl.split('#')[0];
            const newBase = location.href.split('#')[0];
            if (oldBase === newBase) return;
            
            // Уведомляем Tauri
            if (window._inv) {
                window._inv('notify_url_change', { 
                    tab: window._t || 1,
                    url: location.href 
                }).catch(() => {});
            }
        }
    };
    
    // Слушаем popstate (back/forward)
    window.addEventListener('popstate', () => {
        setTimeout(checkUrlChange, 100);
    });
    
    // Периодическая проверка (ловит SPA-навигацию через pushState)
    if (window._d1) {
        clearInterval(window._d1);
    }
    window._d1 = setInterval(checkUrlChange, 2000);
}
