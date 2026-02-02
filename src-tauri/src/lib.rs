//! AI Prompts Manager - Backend Library
//!
//! Этот крейт содержит всю backend логику приложения,
//! разбитую на модули по функциональности.
//!
//! ## Структура модулей
//!
//! - `types` - структуры данных (логи, настройки, файлы)
//! - `state` - глобальные состояния (Atomic*, Mutex)
//! - `utils` - утилиты (MIME, платформа, размеры)
//! - `downloads` - работа с загрузками (пути, настройки)
//! - `webview` - управление WebView (скрипты, создание, resize)
//! - `commands` - Tauri команды (app, toolbar, downloads, logs, claude)

pub mod types;
pub mod state;
pub mod utils;
pub mod downloads;
pub mod webview;
pub mod commands;

// Реэкспорт часто используемых типов
pub use types::{ArchiveLogEntry, DownloadEntry, DownloadsSettings, FileData};
