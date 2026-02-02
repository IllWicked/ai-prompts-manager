//! Команды управления приложением
//!
//! Этот модуль содержит Tauri команды для:
//! - Сброса данных приложения
//! - Открытия папки данных
//! - Управления окном

use std::fs;
use tauri::AppHandle;

use crate::downloads::paths::{get_app_data_dir, get_archive_log_path, get_downloads_settings_path};
use crate::utils::platform::open_directory_in_system;

/// Сбрасывает данные приложения (кроме логов и настроек загрузок)
///
/// Удаляет папку данных приложения, но сохраняет:
/// - `archive_log.json` — история скачанных файлов
/// - `downloads_settings.json` — настройки пути загрузок
///
/// # Returns
/// * `Ok(())` — данные успешно сброшены
/// * `Err(String)` — ошибка при сбросе
#[tauri::command]
pub fn reset_app_data() -> Result<(), String> {
    let Some(app_folder) = get_app_data_dir() else {
        return Ok(()); // Нет папки — нечего сбрасывать
    };
    
    if !app_folder.exists() {
        return Ok(());
    }
    
    // Сохраняем archive_log.json перед удалением
    let archive_log_path = get_archive_log_path();
    let archive_log_backup = archive_log_path
        .as_ref()
        .filter(|p| p.exists())
        .and_then(|p| fs::read(p).ok());
    
    // Сохраняем downloads_settings.json перед удалением
    let downloads_settings_path = get_downloads_settings_path();
    let downloads_settings_backup = downloads_settings_path
        .as_ref()
        .filter(|p| p.exists())
        .and_then(|p| fs::read(p).ok());
    
    // Пытаемся удалить папку целиком
    if fs::remove_dir_all(&app_folder).is_err() {
        // Если не удалось — удаляем содержимое по отдельности, кроме защищённых файлов
        if let Ok(entries) = fs::read_dir(&app_folder) {
            for entry in entries.flatten() {
                let path = entry.path();
                let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                
                // Не удаляем защищённые файлы
                if filename != "archive_log.json" && filename != "downloads_settings.json" {
                    let _ = if path.is_dir() {
                        fs::remove_dir_all(&path)
                    } else {
                        fs::remove_file(&path)
                    };
                }
            }
        }
    }
    
    // Восстанавливаем archive_log.json
    if let (Some(backup), Some(path)) = (archive_log_backup, archive_log_path) {
        let _ = fs::create_dir_all(&app_folder);
        let _ = fs::write(&path, &backup);
    }
    
    // Восстанавливаем downloads_settings.json
    if let (Some(backup), Some(path)) = (downloads_settings_backup, downloads_settings_path) {
        let _ = fs::create_dir_all(&app_folder);
        let _ = fs::write(&path, &backup);
    }
    
    Ok(())
}

/// Открывает папку данных приложения в файловом менеджере
///
/// Создаёт папку если она не существует.
///
/// # Returns
/// * `Ok(())` — папка успешно открыта
/// * `Err(String)` — ошибка (не удалось найти/создать/открыть папку)
#[tauri::command]
pub fn open_app_data_dir() -> Result<(), String> {
    let app_folder = get_app_data_dir()
        .ok_or("Could not find app data directory")?;
    
    // Создаём папку если не существует
    if !app_folder.exists() {
        fs::create_dir_all(&app_folder).map_err(|e| e.to_string())?;
    }
    
    // Открываем в проводнике
    open_directory_in_system(&app_folder)
}

/// Устанавливает цвет фона окна
///
/// # Arguments
/// * `app` - handle приложения
/// * `r`, `g`, `b` - RGB компоненты цвета (0-255)
///
/// # Returns
/// * `Ok(())` — цвет успешно установлен
/// * `Err(String)` — ошибка
#[tauri::command]
pub fn set_window_background(app: AppHandle, r: u8, g: u8, b: u8) -> Result<(), String> {
    use tauri::Manager;
    use tauri::window::Color;
    
    let window = app.get_window("main").ok_or("Main window not found")?;
    window.set_background_color(Some(Color(r, g, b, 255)))
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Получает ширину главного окна в логических пикселях
///
/// Учитывает DPI масштабирование.
///
/// # Arguments
/// * `app` - handle приложения
///
/// # Returns
/// Ширина окна в логических пикселях
#[tauri::command]
pub fn get_window_width(app: AppHandle) -> Result<f64, String> {
    use crate::utils::get_dimensions;
    let (width, _, _) = get_dimensions(&app)?;
    Ok(width)
}
