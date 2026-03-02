//! Команды файлового хранения данных
//!
//! Этот модуль содержит Tauri команды для:
//! - Сохранения и загрузки тяжёлых данных (tabs) в файлы
//! - Обхода лимита localStorage (5-10 MB)
//! - Атомарной записи через temp файл + rename

use std::fs;
use std::path::PathBuf;
use crate::downloads::paths::get_app_data_dir;

/// Получить путь к файлу данных вкладок
fn get_tabs_data_path() -> Option<PathBuf> {
    get_app_data_dir().map(|dir| dir.join("tabs_data.json"))
}

/// Получить путь к файлу бэкапа вкладок
fn get_tabs_backup_path() -> Option<PathBuf> {
    get_app_data_dir().map(|dir| dir.join("tabs_data.backup.json"))
}

/// Сохранить данные вкладок в файл
///
/// Использует атомарную запись: temp файл → rename.
/// Перед записью создаёт бэкап предыдущей версии.
///
/// # Arguments
/// * `data` - JSON строка с данными вкладок
#[tauri::command]
pub fn save_tabs_to_file(data: String) -> Result<(), String> {
    let path = get_tabs_data_path()
        .ok_or("Cannot get app data dir")?;
    
    // Создаём директорию если не существует
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create dir: {}", e))?;
    }
    
    // Бэкап: переименовываем текущий файл
    if path.exists() {
        if let Some(backup_path) = get_tabs_backup_path() {
            let _ = fs::rename(&path, &backup_path);
        }
    }
    
    // Атомарная запись: temp → rename
    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, &data)
        .map_err(|e| format!("Cannot write temp file: {}", e))?;
    
    fs::rename(&temp_path, &path)
        .map_err(|e| format!("Cannot rename temp to final: {}", e))?;
    
    Ok(())
}

/// Загрузить данные вкладок из файла
///
/// Если основной файл повреждён, пробует бэкап.
///
/// # Returns
/// JSON строка с данными или null (если файла нет)
#[tauri::command]
pub fn load_tabs_from_file() -> Result<Option<String>, String> {
    let path = get_tabs_data_path()
        .ok_or("Cannot get app data dir")?;
    
    // Пробуем основной файл
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(data) => {
                // Проверяем что это валидный JSON
                if serde_json::from_str::<serde_json::Value>(&data).is_ok() {
                    return Ok(Some(data));
                }
                // JSON повреждён — пробуем бэкап
            }
            Err(_) => {
                // Ошибка чтения — пробуем бэкап
            }
        }
    }
    
    // Пробуем бэкап
    if let Some(backup_path) = get_tabs_backup_path() {
        if backup_path.exists() {
            match fs::read_to_string(&backup_path) {
                Ok(data) => {
                    if serde_json::from_str::<serde_json::Value>(&data).is_ok() {
                        // Восстанавливаем из бэкапа
                        let _ = fs::copy(&backup_path, &path);
                        return Ok(Some(data));
                    }
                }
                Err(_) => {}
            }
        }
    }
    
    Ok(None)
}

/// Удалить файлы данных вкладок (при сбросе)
#[tauri::command]
pub fn delete_tabs_file() -> Result<(), String> {
    if let Some(path) = get_tabs_data_path() {
        let _ = fs::remove_file(&path);
    }
    if let Some(path) = get_tabs_backup_path() {
        let _ = fs::remove_file(&path);
    }
    Ok(())
}

/// Получить размер файла данных вкладок в байтах
#[tauri::command]
pub fn get_tabs_file_size() -> Result<u64, String> {
    if let Some(path) = get_tabs_data_path() {
        if path.exists() {
            let metadata = fs::metadata(&path)
                .map_err(|e| format!("Cannot get metadata: {}", e))?;
            return Ok(metadata.len());
        }
    }
    Ok(0)
}
