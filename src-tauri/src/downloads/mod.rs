//! Модуль работы с загрузками
//!
//! Этот модуль объединяет функциональность для:
//! - Работы с путями к логам и настройкам (`paths`)
//! - Обработки событий загрузки (будет добавлено позже)

pub mod paths;

// Реэкспорт часто используемых функций
pub use paths::{
    get_app_data_dir,
    get_archive_log_path,
    get_downloads_log_path,
    get_downloads_settings_path,
    get_custom_downloads_path,
    save_custom_downloads_path,
    get_unique_filepath,
};
