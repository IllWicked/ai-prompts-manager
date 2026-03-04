// === Claude Helpers ===
// Общие функции для инжектирования в Claude.ai WebView
// Селекторы передаются через window.__SEL__ из main.rs (selectors.json)

/**
 * Получить значение селектора по пути (поддержка вложенности)
 * @param {string} path - путь к селектору, например "generation.stopButton" или "ui.ghostButtonIndicator"
 * @returns {string|string[]|null} - селектор(ы) или null
 */
function __getSel__(path) {
    const parts = path.split('.');
    let value = window.__SEL__;
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
 * Поиск всех элементов по пути к селектору
 * @param {string} path - путь к селектору
 * @returns {Element[]}
 */
function __findAll__(path) {
    const selectors = __getSel__(path);
    if (!selectors) return [];
    const arr = Array.isArray(selectors) ? selectors : [selectors];
    const results = [];
    for (const sel of arr) {
        try {
            document.querySelectorAll(sel).forEach(el => {
                if (!results.includes(el)) results.push(el);
            });
        } catch (e) {
            // Невалидный селектор — пробуем следующий
        }
    }
    return results;
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
        // Кнопка Send — рядом с editor, обычно submit или с aria-label
        const editor = __findElSmart__('input.proseMirror');
        if (!editor) return null;
        const form = editor.closest('form') || editor.closest('[role="presentation"]')
            || editor.parentElement?.parentElement?.parentElement;
        if (!form) return null;
        return form.querySelector('button[type="submit"]')
            || form.querySelector('button[aria-label*="Send"]')
            || form.querySelector('button[aria-label*="send"]');
    },
    'input.fileInput': () => {
        return document.querySelector('input[type="file"][accept]');
    },
    'generation.stopButton': () => {
        // Кнопка Stop — button с aria-label содержащим Stop
        return document.querySelector('button[aria-label*="Stop"]')
            || document.querySelector('button[aria-label*="stop"]')
            || document.querySelector('[data-testid*="stop"]');
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
        const candidates = document.querySelectorAll('[class*="overflow-y"]');
        for (const el of candidates) {
            if (el.scrollHeight > el.clientHeight + 100) return el;
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
    
    if (window.__TAURI__?.core?.invoke) {
        window.__TAURI__.core.invoke('write_diagnostic', {
            eventType: 'selector_heuristic_fallback',
            details: JSON.stringify({
                path: path,
                tab: window.__CLAUDE_TAB__ || 0
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
        if (window.__TAURI__?.core?.invoke) {
            window.__TAURI__.core.invoke('write_diagnostic', {
                eventType: 'selector_health_check',
                details: JSON.stringify({
                    broken: broken,
                    heuristicOnly: heuristicWorking,
                    total: critical.length,
                    tab: window.__CLAUDE_TAB__ || 0
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

function setupGhostObserver() {
    // Ghost observer теперь объединён с UI observer в setupCombinedObserver()
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
    if (window.__sidebarObserver) {
        window.__sidebarObserver.disconnect();
    }
    window.__sidebarObserver = new MutationObserver(() => hideSidebar());
    
    const observeSidebar = () => {
        const leftNav = __findElSmart__('navigation.leftNav');
        if (leftNav) {
            window.__sidebarObserver.observe(leftNav, { 
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
    if (window.__combinedObserver) {
        window.__combinedObserver.disconnect();
    }
    
    let uiUpdatePending = false;
    
    window.__combinedObserver = new MutationObserver(() => {
        if (uiUpdatePending) return;
        uiUpdatePending = true;
        
        requestAnimationFrame(() => {
            hideGhostButton();
            truncateChatTitle();
            uiUpdatePending = false;
        });
    });
    
    window.__combinedObserver.observe(document.body, { childList: true, subtree: true });
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

/**
 * Перехватчик fetch: отслеживает загрузку файлов И генерацию ответов Claude.
 * 
 * Генерация: при POST на /completion ставит маркер \u200B в document.title.
 * Rust читает title через COM-событие DocumentTitleChanged — без eval/sleep.
 * Маркер снимается когда SSE-стрим закрывается (ReadableStream done/cancel/error).
 * 
 * Загрузки: инкрементирует счётчик при успешном upload-file.
 */
function setupFetchInterceptor() {
    if (window.__fetchInterceptorInstalled) return;
    window.__fetchInterceptorInstalled = true;
    // Backward compat — старое имя
    window.__uploadInterceptorInstalled = true;
    
    window.__uploadedFilesCount = 0;
    window.__isGenerating = false;
    
    const origFetch = window.fetch;
    window.__originalFetch = origFetch;
    
    const tabNum = window.__CLAUDE_TAB__ || 1;
    
    // Счётчик активных стримов + debounce для сброса
    // Claude может делать несколько /completion запросов подряд
    // (thinking + response, multi-step), поэтому нельзя сбрасывать сразу
    let activeStreams = 0;
    let offTimer = null;
    const DEBOUNCE_MS = 2500;
    
    function notifyRust(generating) {
        try {
            if (window.__TAURI__) {
                window.__TAURI__.core.invoke('set_generation_state', { tab: tabNum, generating: generating });
            }
        } catch(e) {}
    }
    
    function streamStarted() {
        activeStreams++;
        if (offTimer) { clearTimeout(offTimer); offTimer = null; }
        if (!window.__isGenerating) {
            window.__isGenerating = true;
            notifyRust(true);
        }
    }
    
    function streamEnded() {
        activeStreams = Math.max(0, activeStreams - 1);
        // Не сбрасываем сразу — ждём: может следующий стрим начнётся
        if (offTimer) clearTimeout(offTimer);
        offTimer = setTimeout(() => {
            offTimer = null;
            if (activeStreams === 0 && window.__isGenerating) {
                window.__isGenerating = false;
                notifyRust(false);
            }
        }, DEBOUNCE_MS);
    }
    
    window.fetch = async function(...args) {
        const url = (args[0] instanceof Request ? args[0].url : args[0]?.toString?.()) || '';
        const method = ((args[1]?.method || (args[0] instanceof Request ? args[0].method : '')) || 'GET').toUpperCase();
        
        const isCompletion = url.includes('/completion') && method === 'POST';
        
        let response;
        try {
            response = await origFetch.apply(this, args);
        } catch(e) {
            if (isCompletion) streamEnded();
            throw e;
        }
        
        // === Генерация: оборачиваем SSE ReadableStream ===
        if (isCompletion && response.ok && response.body) {
            streamStarted();
            
            const reader = response.body.getReader();
            const stream = new ReadableStream({
                pull(controller) {
                    return reader.read().then(({ done, value }) => {
                        if (done) {
                            controller.close();
                            streamEnded();
                            return;
                        }
                        controller.enqueue(value);
                    }).catch(err => {
                        try { controller.error(err); } catch(_) {}
                        streamEnded();
                    });
                },
                cancel(reason) {
                    reader.cancel(reason);
                    streamEnded();
                }
            });
            
            return new Response(stream, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });
        }
        
        // === Загрузки ===
        if (url.includes('/upload-file')) {
            try {
                const clone = response.clone();
                const data = await clone.json();
                if (data.success || data.file_name || data.sanitized_name) {
                    window.__uploadedFilesCount++;
                    try {
                        if (window.__TAURI__?.core?.invoke) {
                            window.__TAURI__.core.invoke('increment_upload_count', { 
                                tab: window.__CLAUDE_TAB__ || 1 
                            });
                        }
                    } catch(_) {}
                }
            } catch(e) {}
        }
        
        return response;
    };
}

// Backward compat alias
function setupUploadInterceptor() { setupFetchInterceptor(); }

function initClaudeUI() {
    // Получаем селектор для artifact controls
    const artifactControlsSelector = __getSel__('ui.artifactControls') || '[data-testid="wiggle-controls-actions"]';
    
    // Стили для скрытия элементов и убирания рамок фокуса
    if (!document.getElementById('tauri-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'tauri-custom-styles';
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
    if (window.__claudeUIInterval) {
        clearInterval(window.__claudeUIInterval);
    }
    window.__claudeUIInterval = setInterval(() => { hideSidebar(); truncateChatTitle(); }, 5000);
    
    // Health-check селекторов через 3 сек (DOM должен стабилизироваться)
    setTimeout(runSelectorHealthCheck, 3000);
}

/**
 * Слушает клики в Claude webview и закрывает downloads popup
 */
function setupGlobalClickListener() {
    if (window.__globalClickListenerInstalled) return;
    window.__globalClickListenerInstalled = true;
    
    document.addEventListener('click', () => {
        if (window.__TAURI__?.core?.invoke) {
            window.__TAURI__.core.invoke('hide_downloads').catch(() => {});
        }
    }, { capture: true });
}

/**
 * Отслеживает изменения URL и уведомляет Tauri
 * Нужно для детекции перехода на страницу проекта
 */
function setupUrlChangeDetection() {
    if (window.__urlChangeDetectionInstalled) return;
    window.__urlChangeDetectionInstalled = true;
    
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
            
            // Уведомляем через postMessage в Tauri
            if (window.__TAURI__?.core?.invoke) {
                window.__TAURI__.core.invoke('notify_url_change', { 
                    tab: window.__CLAUDE_TAB__ || 1,
                    url: location.href 
                }).catch(() => {});
            }
        }
    };
    
    // Слушаем popstate (back/forward)
    window.addEventListener('popstate', () => {
        setTimeout(checkUrlChange, 100);
    });
    
    // Перехватываем pushState и replaceState
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
        origPushState.apply(this, args);
        setTimeout(checkUrlChange, 100);
    };
    
    history.replaceState = function(...args) {
        origReplaceState.apply(this, args);
        setTimeout(checkUrlChange, 100);
    };
    
    // Также проверяем периодически (на случай навигации через клики)
    // Сохраняем ID для возможности очистки
    if (window.__urlCheckInterval) {
        clearInterval(window.__urlCheckInterval);
    }
    window.__urlCheckInterval = setInterval(checkUrlChange, 2000);
}
