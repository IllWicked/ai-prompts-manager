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
    const leftNav = __findEl__('navigation.leftNav');
    if (leftNav) {
        const navWidth = leftNav.offsetWidth;
        if (navWidth < 100) {
            leftNav.style.pointerEvents = 'none';
            const pinBtn = __findEl__('navigation.pinSidebarButton');
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
        const leftNav = __findEl__('navigation.leftNav');
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
    // Используем централизованный селектор
    const titleSelector = __getSel__('ui.titleContainer');
    const titleContainer = titleSelector ? document.querySelector(titleSelector) : null;
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
 * Устанавливает перехватчик fetch для отслеживания загрузки файлов
 * Увеличивает window.__uploadedFilesCount при успешной загрузке
 */
function setupUploadInterceptor() {
    if (window.__uploadInterceptorInstalled) return;
    
    window.__uploadedFilesCount = 0;
    window.__uploadInterceptorInstalled = true;
    
    const origFetch = window.fetch;
    window.__originalFetch = origFetch;
    
    window.fetch = async function(...args) {
        const response = await origFetch.apply(this, args);
        
        // Проверяем это upload-file запрос
        const url = args[0]?.toString?.() || args[0] || '';
        if (url.includes('/upload-file')) {
            try {
                // Клонируем response чтобы прочитать body
                const clone = response.clone();
                const data = await clone.json();
                if (data.success || data.file_name || data.sanitized_name) {
                    window.__uploadedFilesCount++;
                }
            } catch(e) {
                // Ignore parse errors
            }
        }
        
        return response;
    };
}

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
            lastUrl = location.href;
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
