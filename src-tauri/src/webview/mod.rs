//! Модуль управления WebView
//!
//! Этот модуль объединяет функциональность для:
//! - JavaScript скриптов для инжекции (`scripts`)
//! - Управления webview (создание, resize) (`manager`)

pub mod scripts;
pub mod manager;

// Реэкспорт часто используемых элементов
pub use scripts::{
    CLAUDE_HELPERS_JS,
    CLAUDE_SELECTORS_JSON,
    get_claude_init_script,
    get_generation_monitor_script,
};

pub use manager::{
    ensure_claude_webview,
    create_claude_webview,
    ensure_toolbar,
    raise_toolbar_zorder,
    suspend_claude_tab,
    resume_claude_tab,
    resize_webviews,
    allow_claude_multiple_downloads,
};
