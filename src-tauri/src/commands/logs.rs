//! Команды для работы с логами
//!
//! Этот модуль содержит Tauri команды для:
//! - Чтения и записи лога архивов (скачанные из Claude файлы)
//! - Чтения и записи лога загрузок (все загруженные файлы)

use std::fs;
use chrono::Local;

use crate::types::{ArchiveLogEntry, DownloadEntry};
use crate::state::{ARCHIVE_LOG_LOCK, DOWNLOADS_LOG_LOCK};
use crate::downloads::paths::{get_archive_log_path, get_downloads_log_path};
use crate::utils::dimensions::limits::{MAX_ARCHIVE_LOG_ENTRIES, MAX_DOWNLOADS_LOG_ENTRIES};

// ============================================================================
// Лог архивов (скачанные из Claude файлы)
// ============================================================================

/// Записывает запись в лог архивов
///
/// Потокобезопасная запись с использованием мьютекса.
/// Ограничивает размер лога до MAX_ARCHIVE_LOG_ENTRIES записей.
///
/// # Arguments
/// * `entry` - запись для добавления
///
/// # Returns
/// * `Ok(())` - запись успешно добавлена
/// * `Err(String)` - ошибка записи
pub fn write_archive_log(entry: ArchiveLogEntry) -> Result<(), String> {
    // Блокируем доступ к файлу для предотвращения race condition
    let _guard = ARCHIVE_LOG_LOCK.lock()
        .map_err(|_| "Archive log lock poisoned")?;
    
    let log_path = get_archive_log_path().ok_or("Cannot get log path")?;
    
    // Создаём директорию если нет
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    // Читаем существующий лог или создаём новый
    let mut entries: Vec<ArchiveLogEntry> = if log_path.exists() {
        let content = fs::read_to_string(&log_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    
    // Добавляем новую запись
    entries.push(entry);
    
    // Ограничиваем размер лога
    if entries.len() > MAX_ARCHIVE_LOG_ENTRIES {
        entries = entries.split_off(entries.len() - MAX_ARCHIVE_LOG_ENTRIES);
    }
    
    // Сохраняем
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(&log_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Получает все записи из лога архивов
#[tauri::command]
pub fn get_archive_log() -> Result<Vec<ArchiveLogEntry>, String> {
    let log_path = get_archive_log_path().ok_or("Cannot get log path")?;
    
    if !log_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let entries: Vec<ArchiveLogEntry> = serde_json::from_str(&content).unwrap_or_default();
    
    Ok(entries)
}

/// Очищает лог архивов
#[tauri::command]
pub fn clear_archive_log() -> Result<(), String> {
    let log_path = get_archive_log_path().ok_or("Cannot get log path")?;
    
    if log_path.exists() {
        fs::remove_file(&log_path).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Добавляет запись в лог архивов
///
/// # Arguments
/// * `tab` - номер таба Claude (1-3)
/// * `filename` - имя файла
/// * `claude_url` - URL страницы Claude
/// * `file_path` - полный путь к файлу (опционально)
#[tauri::command]
pub fn add_archive_log_entry(
    tab: u8, 
    filename: String, 
    claude_url: String, 
    file_path: Option<String>
) -> Result<(), String> {
    // Извлекаем имя проекта из URL
    let project_name = if claude_url.contains("/project/") {
        "Project".to_string()
    } else {
        "".to_string()
    };
    
    let entry = ArchiveLogEntry {
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        tab,
        filename,
        claude_url,
        file_path: file_path.unwrap_or_default(),
        project_name,
    };
    
    write_archive_log(entry)
}

// ============================================================================
// Лог загрузок (все загруженные файлы)
// ============================================================================

/// Получает все записи из лога загрузок
///
/// Автоматически фильтрует несуществующие файлы и обновляет лог.
#[tauri::command]
pub fn get_downloads_log() -> Result<Vec<DownloadEntry>, String> {
    let log_path = get_downloads_log_path().ok_or("Cannot get log path")?;
    
    if !log_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let entries: Vec<DownloadEntry> = serde_json::from_str(&content).unwrap_or_default();
    let original_len = entries.len();
    
    // Фильтруем только существующие файлы
    let valid_entries: Vec<DownloadEntry> = entries
        .into_iter()
        .filter(|e| {
            let path = std::path::Path::new(&e.file_path);
            path.exists()
        })
        .collect();
    
    // Если что-то отфильтровали — перезаписываем лог
    if valid_entries.len() != original_len {
        if let Ok(json) = serde_json::to_string_pretty(&valid_entries) {
            let _ = fs::write(&log_path, &json);
        }
    }
    
    Ok(valid_entries)
}

/// Добавляет запись в лог загрузок
///
/// Потокобезопасная запись. Не добавляет дубликаты (по file_path).
///
/// # Arguments
/// * `filename` - имя файла
/// * `file_path` - полный путь к файлу
#[tauri::command]
pub fn add_download_entry(filename: String, file_path: String) -> Result<(), String> {
    let _guard = DOWNLOADS_LOG_LOCK.lock()
        .map_err(|_| "Downloads log lock poisoned")?;
    
    let log_path = get_downloads_log_path().ok_or("Cannot get log path")?;
    
    // Создаём директорию если нет
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    // Читаем существующий лог
    let mut entries: Vec<DownloadEntry> = if log_path.exists() {
        let content = fs::read_to_string(&log_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    
    // Проверяем, нет ли уже записи с таким file_path
    if entries.iter().any(|e| e.file_path == file_path) {
        return Ok(());
    }
    
    // Добавляем новую запись
    entries.push(DownloadEntry {
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        filename,
        file_path,
    });
    
    // Ограничиваем размер
    if entries.len() > MAX_DOWNLOADS_LOG_ENTRIES {
        entries = entries.split_off(entries.len() - MAX_DOWNLOADS_LOG_ENTRIES);
    }
    
    // Сохраняем
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(&log_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}
