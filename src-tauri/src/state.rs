//! Глобальные состояния приложения
//!
//! Этот модуль содержит все статические переменные для хранения состояния:
//! - Видимость панели Claude
//! - Активный таб
//! - Соотношение панелей
//! - Мьютексы для синхронизации

use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU32};
use std::sync::Mutex;
use once_cell::sync::Lazy;

/// Видимость панели Claude (true = показана)
pub static CLAUDE_VISIBLE: AtomicBool = AtomicBool::new(false);

/// Номер активного таба Claude (1-3)
pub static ACTIVE_TAB: AtomicU8 = AtomicU8::new(1);

/// Соотношение панелей в процентах (0-100, где значение = ширина UI панели)
/// По умолчанию 50% (равное разделение)
pub static PANEL_RATIO: AtomicU32 = AtomicU32::new(50);

/// Мьютекс для защиты от race condition при создании webview
/// Используется при быстром переключении табов или параллельных вызовах
pub static WEBVIEW_CREATION_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// Мьютекс для защиты записи в лог загрузок
pub static DOWNLOADS_LOG_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// Мьютекс для защиты записи в лог архивов
pub static ARCHIVE_LOG_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
