// === Claude Helpers ===
// Общие функции для инжектирования в Claude.ai WebView
// Селекторы передаются через window.__SEL__ из main.rs

/**
 * Поиск элемента по массиву селекторов с fallback
 * @param {string} key - ключ селектора в __SEL__
 * @returns {Element|null}
 */
function __findEl__(key) {
    const selectors = window.__SEL__[key];
    if (!selectors) return null;
    const arr = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of arr) {
        try {
            const el = document.querySelector(sel);
            if (el) return el;
        } catch (e) {}
    }
    return null;
}

/**
 * Поиск всех элементов по массиву селекторов
 * @param {string} key - ключ селектора в __SEL__
 * @returns {Element[]}
 */
function __findAll__(key) {
    const selectors = window.__SEL__[key];
    if (!selectors) return [];
    const arr = Array.isArray(selectors) ? selectors : [selectors];
    const results = [];
    for (const sel of arr) {
        try {
            document.querySelectorAll(sel).forEach(el => {
                if (!results.includes(el)) results.push(el);
            });
        } catch (e) {}
    }
    return results;
}

function hideGhostButton() {
    document.querySelectorAll('button').forEach(btn => {
        // Используем селектор GHOST_BUTTON_INDICATOR
        const ghostIndicator = window.__SEL__.GHOST_BUTTON_INDICATOR;
        if (btn.querySelector(ghostIndicator)) {
            btn.style.display = 'none';
        }
    });
}

function setupGhostObserver() {
    if (window.__ghostObserver) {
        window.__ghostObserver.disconnect();
    }
    window.__ghostObserver = new MutationObserver(() => hideGhostButton());
    window.__ghostObserver.observe(document.body, { childList: true, subtree: true });
}

function hideSidebar() {
    // Отключаем перехват кликов у свёрнутого левого сайдбара
    const leftNav = __findEl__('LEFT_NAV');
    if (leftNav) {
        const navWidth = leftNav.offsetWidth;
        if (navWidth < 100) {
            leftNav.style.pointerEvents = 'none';
            const pinBtn = __findEl__('PIN_SIDEBAR_BUTTON');
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
        const leftNav = __findEl__('LEFT_NAV');
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

function truncateChatTitle() {
    // Находим контейнер заголовка
    const titleContainer = document.querySelector('div.flex.min-w-0.flex-1.shrink.md\\:items-center.font-base-bold');
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
    // Стили для скрытия элементов и убирания рамок фокуса
    if (!document.getElementById('tauri-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'tauri-custom-styles';
        style.textContent = `
            *:focus { outline: none !important; }
            *:focus-visible { outline: none !important; }
            
            /* Скрываем весь контейнер с кнопками Share и сайдбаром артефактов */
            div:has(> [data-testid="wiggle-controls-actions"]) { display: none !important; }
        `;
        document.head.appendChild(style);
    }
    
    // Отслеживание изменения URL для проектов
    setupUrlChangeDetection();
    
    // Скрываем кнопку-призрака
    hideGhostButton();
    setupGhostObserver();
    
    hideSidebar();
    truncateChatTitle();
    setupSidebarObserver();
    
    // Глобальный слушатель кликов - закрывает downloads popup
    setupGlobalClickListener();
    
    // MutationObserver для UI обновлений
    if (!window.__uiObserver) {
        window.__uiObserver = new MutationObserver(() => {
            truncateChatTitle();
        });
        window.__uiObserver.observe(document.body, { childList: true, subtree: true });
    }
    
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
    setInterval(checkUrlChange, 2000);
}
