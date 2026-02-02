//! Утилиты и вспомогательные функции
//!
//! Этот модуль объединяет различные утилиты:
//! - `mime` - определение MIME-типов
//! - `platform` - платформо-зависимые функции
//! - `dimensions` - работа с размерами окна

pub mod mime;
pub mod platform;
pub mod dimensions;

// Реэкспорт часто используемых функций
pub use mime::get_mime_type;
pub use platform::{set_window_icon_from_exe, open_file_in_system, open_directory_in_system};
pub use dimensions::get_dimensions;
