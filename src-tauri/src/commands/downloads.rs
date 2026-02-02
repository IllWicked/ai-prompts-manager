//! Команды управления загрузками
//!
//! Этот модуль содержит Tauri команды для:
//! - Получения и установки пути загрузок
//! - Выбора папки через диалог
//! - Открытия файлов

use std::fs;
use tauri::AppHandle;

use crate::downloads::paths::{get_custom_downloads_path, save_custom_downloads_path};
use crate::utils::platform::open_file_in_system;

/// Получает текущий путь для загрузок
///
/// # Returns
/// * Кастомный путь если задан
/// * Пустая строка если используется путь по умолчанию
#[tauri::command]
pub fn get_downloads_path() -> Result<String, String> {
    Ok(get_custom_downloads_path().unwrap_or_default())
}

/// Устанавливает путь для загрузок
///
/// # Arguments
/// * `path` - новый путь или пустая строка для сброса на путь по умолчанию
///
/// # Returns
/// * `Ok(())` - путь успешно установлен
/// * `Err(String)` - ошибка (путь не существует, не является папкой)
#[tauri::command]
pub fn set_downloads_path(path: String) -> Result<(), String> {
    if path.is_empty() {
        // Сброс на путь по умолчанию
        save_custom_downloads_path(None)
    } else {
        let p = std::path::Path::new(&path);
        
        // Проверяем что путь существует
        if !p.exists() {
            return Err("Указанная папка не существует".to_string());
        }
        
        // Проверяем что это директория, а не файл
        if !p.is_dir() {
            return Err("Указанный путь не является папкой".to_string());
        }
        
        save_custom_downloads_path(Some(path))
    }
}

/// Открывает диалог выбора папки для загрузок
///
/// После выбора автоматически сохраняет путь в настройки.
///
/// # Returns
/// * `Ok(path)` - выбранный путь
/// * `Err(String)` - папка не выбрана или ошибка сохранения
#[tauri::command]
pub async fn pick_downloads_folder(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let folder = app.dialog()
        .file()
        .set_title("Выберите папку для загрузок")
        .blocking_pick_folder();
    
    match folder {
        Some(path) => {
            let path_str = path.to_string();
            // Сохраняем выбранный путь
            save_custom_downloads_path(Some(path_str.clone()))?;
            Ok(path_str)
        }
        None => Err("Папка не выбрана".to_string())
    }
}

/// Открывает файл в системном приложении по умолчанию
///
/// # Arguments
/// * `file_path` - полный путь к файлу
///
/// # Returns
/// * `Ok(())` - файл успешно открыт
/// * `Err(String)` - файл не найден или ошибка открытия
#[tauri::command]
pub fn open_file(file_path: String) -> Result<(), String> {
    open_file_in_system(&file_path)
}

/// Удаляет файл и его запись из лога загрузок
///
/// # Arguments
/// * `file_path` - полный путь к файлу
///
/// # Returns
/// * `Ok(true)` - файл успешно удалён
/// * `Err(String)` - ошибка удаления
#[tauri::command]
pub fn delete_download(file_path: String) -> Result<bool, String> {
    use crate::downloads::paths::get_downloads_log_path;
    use crate::types::DownloadEntry;
    
    let log_path = get_downloads_log_path().ok_or("Cannot get log path")?;
    
    if !log_path.exists() {
        return Ok(false);
    }
    
    // Удаляем файл с диска
    let path = std::path::Path::new(&file_path);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    
    // Удаляем запись из лога
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let mut entries: Vec<DownloadEntry> = serde_json::from_str(&content).unwrap_or_default();
    
    let original_len = entries.len();
    entries.retain(|e| e.file_path != file_path);
    
    if entries.len() < original_len {
        let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
        fs::write(&log_path, json).map_err(|e| e.to_string())?;
    }
    
    Ok(true)
}

/// Удаляет все загруженные файлы и очищает лог
///
/// # Returns
/// * `Ok(count)` - количество удалённых файлов
/// * `Err(String)` - ошибка
#[tauri::command]
pub fn delete_all_downloads() -> Result<u32, String> {
    use crate::downloads::paths::get_downloads_log_path;
    use crate::types::DownloadEntry;
    
    let log_path = get_downloads_log_path().ok_or("Cannot get log path")?;
    
    if !log_path.exists() {
        return Ok(0);
    }
    
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let entries: Vec<DownloadEntry> = serde_json::from_str(&content).unwrap_or_default();
    
    let mut deleted_count = 0u32;
    
    // Удаляем файлы
    for entry in &entries {
        if !entry.file_path.is_empty() {
            let path = std::path::Path::new(&entry.file_path);
            if path.exists() {
                if fs::remove_file(path).is_ok() {
                    deleted_count += 1;
                }
            }
        }
    }
    
    // Очищаем лог
    fs::remove_file(&log_path).map_err(|e| e.to_string())?;
    
    Ok(deleted_count)
}
