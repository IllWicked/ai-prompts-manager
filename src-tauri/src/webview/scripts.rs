//! JavaScript скрипты для инжекции в Claude WebView
//!
//! Этот модуль содержит:
//! - Константы с JS кодом (helpers, селекторы)
//! - Функцию генерации init script для каждого таба

/// Общие JS функции для инжектирования в Claude.ai
///
/// Загружается из внешнего файла `scripts/claude_helpers.js`
/// и содержит функции для:
/// - Инициализации UI
/// - Перехвата загрузки файлов
/// - Работы с ProseMirror редактором
pub const CLAUDE_HELPERS_JS: &str = include_str!("../../scripts/claude_helpers.js");

/// Централизованные селекторы для Claude.ai
///
/// Загружается из внешнего файла `scripts/selectors.json`
/// Это единый источник правды для всех CSS селекторов.
/// При обновлении Claude.ai править ТОЛЬКО этот файл!
pub const CLAUDE_SELECTORS_JSON: &str = include_str!("../../scripts/selectors.json");

/// Генерирует JavaScript код для инициализации Claude WebView
///
/// Этот скрипт выполняется автоматически при каждой загрузке/перезагрузке
/// страницы Claude.ai и обеспечивает:
/// - Установку номера таба (`window.__CLAUDE_TAB__`)
/// - Загрузку селекторов (`window.__SEL__`)
/// - Инициализацию helper функций
/// - Настройку интерсептора загрузки файлов
/// - Мониторинг состояния генерации
///
/// # Arguments
/// * `tab` - номер таба (1-3)
///
/// # Returns
/// JavaScript код готовый для выполнения в webview
///
/// # Example
/// ```ignore
/// let script = get_claude_init_script(1);
/// webview.eval(&script)?;
/// ```
pub fn get_claude_init_script(tab: u8) -> String {
    format!(r##"
    (function() {{
        // Проверяем, не инициализирован ли уже скрипт
        if (window.__tauriInitialized) return;
        
        // Проверяем, что мы на главной странице Claude, а не в iframe артефакта
        if (window.self !== window.top) return;
        if (!location.hostname.includes("claude.ai")) return;
        
        window.__tauriInitialized = true;
        
        // Номер таба для этого webview
        window.__CLAUDE_TAB__ = {tab};
        
        // Селекторы доступны глобально для helpers
        window.__SEL__ = {selectors};
        
        // Загружаем общие функции
        {helpers}
        
        // СРАЗУ устанавливаем интерсептор загрузки файлов (без задержки!)
        setupUploadInterceptor();
        
        // Ждём готовности DOM
        function onReady(fn) {{
            if (document.readyState === "loading") {{
                document.addEventListener("DOMContentLoaded", fn);
            }} else {{
                setTimeout(fn, 0);
            }}
        }}
        
        onReady(function() {{
            // Запускаем сразу без задержки
            initClaudeWithMonitor();
        }});
        
        function initClaudeWithMonitor() {{
            let lastState = null;
            
            // Мониторинг генерации - используем централизованные селекторы
            function checkGenerating() {{
                const SEL = window.__SEL__;
                let stopBtn = null;
                
                // Поиск по массиву селекторов generation.stopButton
                const stopSelectors = SEL.generation.stopButton;
                for (const sel of stopSelectors) {{
                    stopBtn = document.querySelector(sel);
                    if (stopBtn) break;
                }}
                
                const streamingEl = document.querySelector(SEL.generation.streamingIndicator);
                const thinkingEl = document.querySelector(SEL.generation.thinkingIndicator);
                const isGenerating = !!(stopBtn || streamingEl || thinkingEl);
                
                if (isGenerating !== lastState) {{
                    lastState = isGenerating;
                    const currentUrl = new URL(window.location.href);
                    currentUrl.hash = isGenerating ? "generating" : "";
                    history.replaceState(null, "", currentUrl.toString());
                }}
            }}
            
            // Инициализация UI
            initClaudeUI();
            
            // Мониторинг генерации
            setInterval(checkGenerating, 300);
            checkGenerating();
        }}
    }})();
    "##, tab = tab, selectors = CLAUDE_SELECTORS_JSON, helpers = CLAUDE_HELPERS_JS)
}

/// Генерирует JavaScript код для инжекции монитора генерации
///
/// Используется когда нужно повторно установить мониторинг
/// (например, после SPA навигации внутри Claude).
///
/// # Arguments
/// * `tab` - номер таба (1-3) - не используется напрямую, но нужен для консистентности
///
/// # Returns
/// JavaScript код для установки монитора генерации
pub fn get_generation_monitor_script() -> String {
    format!(r#"
        (function() {{
            if (window.__generationMonitorActive) return;
            window.__generationMonitorActive = true;
            
            // Селекторы доступны глобально (из init script)
            // Если нет - загружаем
            if (!window.__SEL__) {{
                window.__SEL__ = {selectors};
            }}
            
            // Загружаем общие функции
            {helpers}
            
            let lastState = null;
            
            // Инициализация UI
            initClaudeUI();
            
            // Мониторинг генерации - используем централизованные селекторы
            function checkGenerating() {{
                const SEL = window.__SEL__;
                let stopBtn = null;
                
                // Поиск по массиву селекторов generation.stopButton
                const stopSelectors = SEL?.generation?.stopButton || [];
                for (const sel of stopSelectors) {{
                    stopBtn = document.querySelector(sel);
                    if (stopBtn) break;
                }}
                
                const streamingEl = SEL?.generation?.streamingIndicator ? 
                    document.querySelector(SEL.generation.streamingIndicator) : null;
                const thinkingEl = SEL?.generation?.thinkingIndicator ? 
                    document.querySelector(SEL.generation.thinkingIndicator) : null;
                
                const isGenerating = !!(stopBtn || streamingEl || thinkingEl);
                
                if (isGenerating !== lastState) {{
                    lastState = isGenerating;
                    
                    const currentUrl = new URL(window.location.href);
                    if (isGenerating) {{
                        currentUrl.hash = 'generating';
                    }} else {{
                        currentUrl.hash = '';
                    }}
                    history.replaceState(null, '', currentUrl.toString());
                }}
            }}
            
            setInterval(checkGenerating, 300);
            checkGenerating();
        }})()
    "#, selectors = CLAUDE_SELECTORS_JSON, helpers = CLAUDE_HELPERS_JS)
}

/// Генерирует JavaScript код для скролла в Claude webview
///
/// # Arguments
/// * `delta_y` - величина скролла в пикселях
///
/// # Returns
/// JavaScript код для выполнения скролла
pub fn get_scroll_script(delta_y: f64) -> String {
    format!(r#"
        (function() {{
            const delta = {delta};
            const SEL = window.__SEL__;
            
            // Поиск по централизованным селекторам scroll container
            const scrollSelectors = SEL?.navigation?.scrollContainer || [
                '.overflow-y-scroll.flex-1',
                '[class*="overflow-y-scroll"][class*="flex-1"]'
            ];
            const arr = Array.isArray(scrollSelectors) ? scrollSelectors : [scrollSelectors];
            
            for (const sel of arr) {{
                try {{
                    const el = document.querySelector(sel);
                    if (el && el.scrollHeight > el.clientHeight) {{
                        el.scrollTop += delta;
                        return;
                    }}
                }} catch(e) {{}}
            }}
            
            // Fallback - перебор всех элементов
            const all = document.querySelectorAll('*');
            for (const item of all) {{
                const style = getComputedStyle(item);
                const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll') 
                                     && item.scrollHeight > item.clientHeight
                                     && style.pointerEvents !== 'none';
                if (isScrollable) {{
                    item.scrollTop += delta;
                    return;
                }}
            }}
            
            window.scrollBy(0, delta);
        }})();
    "#, delta = delta_y)
}

/// Генерирует JavaScript код для клика по координатам
///
/// # Arguments
/// * `x` - координата X
/// * `y` - координата Y
///
/// # Returns
/// JavaScript код для выполнения клика
pub fn get_click_script(x: f64, y: f64) -> String {
    format!(r#"
        (function() {{
            const el = document.elementFromPoint({x}, {y});
            if (el) {{
                el.click();
            }}
        }})();
    "#, x = x, y = y)
}
