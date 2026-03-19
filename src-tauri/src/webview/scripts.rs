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

/// Claude Counter — переработанный плагин для показа usage/tokens
///
/// Загружается из `scripts/claude_counter.js`
/// Без monkey-patching: прямой fetch к API, APM-механизмы детекции
pub const CLAUDE_COUNTER_JS: &str = include_str!("../../scripts/claude_counter.js");

/// Claude Counter — стили
pub const CLAUDE_COUNTER_CSS: &str = include_str!("../../scripts/claude_counter.css");

/// Claude Auto-Continue — автоматическое продолжение при tool-use limit
///
/// Загружается из `scripts/claude_autocontinue.js`
/// Без monkey-patching: поллинг DOM + button.click()
pub const CLAUDE_AUTOCONTINUE_JS: &str = include_str!("../../scripts/claude_autocontinue.js");

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
/// - Загрузку селекторов (`window._s`)
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
        if (window._i0) return;
        if (window.self !== window.top) return;
        if (!location.hostname.includes("claude.ai")) return;
        
        window._i0 = true;
        
        // Кэшируем invoke/listen/emit до очистки __TAURI__
        const _inv = window.__TAURI__?.core?.invoke?.bind(window.__TAURI__.core);
        const _listen = window.__TAURI__?.event?.listen?.bind(window.__TAURI__.event);
        const _emit = window.__TAURI__?.event?.emit?.bind(window.__TAURI__.event);
        
        // Компактные глобалы вместо __CLAUDE_TAB__, __SEL__
        window._t = {tab};
        window._s = {selectors};
        
        // Передаём invoke/emit в helpers через глобал
        window._inv = _inv;
        window._emit = _emit;
        
        {helpers}
        
        // Очищаем Tauri-маркеры из глобального scope
        // (invoke уже закэширован, оригинал больше не нужен)
        setTimeout(function() {{
            try {{ delete window.__TAURI__; }} catch(e) {{}}
            try {{ delete window.__TAURI_INTERNALS__; }} catch(e) {{}}
        }}, 3000);
        
        function onReady(fn) {{
            if (document.readyState === "loading") {{
                document.addEventListener("DOMContentLoaded", fn);
            }} else {{
                setTimeout(fn, 0);
            }}
        }}
        
        onReady(function() {{
            initClaudeUI();
            
            // Claude Counter: inject CSS
            var _ccStyle = document.createElement('style');
            _ccStyle.id = '_ccs';
            _ccStyle.textContent = `{counter_css}`;
            document.head.appendChild(_ccStyle);
            
            // Hide Claude disclaimer
            var _hdStyle = document.createElement('style');
            _hdStyle.textContent = 'a[href*="claude-is-providing-incorrect"]{{display:none!important}}';
            document.head.appendChild(_hdStyle);
            
            // Claude Counter: init
            {counter_js}
            
            // Auto-Continue: init (starts disabled, enabled via eval from Main WebView)
            {autocontinue_js}
        }});
    }})();
    "##, tab = tab, selectors = CLAUDE_SELECTORS_JSON, helpers = CLAUDE_HELPERS_JS,
        counter_css = CLAUDE_COUNTER_CSS.replace('`', "\\`"),
        counter_js = CLAUDE_COUNTER_JS,
        autocontinue_js = CLAUDE_AUTOCONTINUE_JS)
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
            if (!window._s) {{
                window._s = {selectors};
            }}
            
            if (!window._inv && window.__TAURI__?.core?.invoke) {{
                window._inv = window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
            }}
            
            if (!window._emit && window.__TAURI__?.event?.emit) {{
                window._emit = window.__TAURI__.event.emit.bind(window.__TAURI__.event);
            }}
            
            {helpers}
            
            initClaudeUI();
        }})()
    "#, selectors = CLAUDE_SELECTORS_JSON, helpers = CLAUDE_HELPERS_JS)
}
