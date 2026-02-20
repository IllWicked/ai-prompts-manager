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

/// Нормализует имя файла: убирает суффиксы " (1)", " (2)" и т.д.
/// которые Windows добавляет при повторном скачивании.
///
/// Примеры:
/// - "project-v4 (1).zip" → "project-v4.zip"
/// - "project-v4 (2).zip" → "project-v4.zip"
/// - "project-v4.zip"     → "project-v4.zip" (без изменений)
fn normalize_filename(name: &str) -> String {
    // Ищем паттерн " (N)" перед расширением или в конце
    if let Some(paren_start) = name.rfind(" (") {
        let after_paren = &name[paren_start + 2..];
        if let Some(paren_end) = after_paren.find(')') {
            let digits = &after_paren[..paren_end];
            if !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()) {
                // Убираем " (N)", склеиваем остаток
                let before = &name[..paren_start];
                let after = &after_paren[paren_end + 1..];
                return format!("{}{}", before, after);
            }
        }
    }
    name.to_string()
}

/// Записывает запись в лог архивов
///
/// Потокобезопасная запись с использованием мьютекса.
/// При совпадении filename + claude_url обновляет timestamp и увеличивает счётчик.
/// Ограничивает размер лога до MAX_ARCHIVE_LOG_ENTRIES записей.
///
/// # Arguments
/// * `entry` - запись для добавления
///
/// # Returns
/// * `Ok(())` - запись успешно добавлена или обновлена
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
    
    // Ищем дубль по нормализованному filename + claude_url
    let normalized = normalize_filename(&entry.filename);
    if let Some(existing) = entries.iter_mut().find(|e| {
        normalize_filename(&e.filename) == normalized && e.claude_url == entry.claude_url
    }) {
        // Обновляем существующую запись
        existing.timestamp = entry.timestamp;
        existing.filename = normalized; // Сохраняем чистое имя без " (N)"
        existing.download_count += 1;
        if !entry.file_path.is_empty() {
            existing.file_path = entry.file_path;
        }
    } else {
        // Новая запись — сохраняем с нормализованным именем
        let mut new_entry = entry;
        new_entry.filename = normalized;
        entries.push(new_entry);
    }
    
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
///
/// При чтении выполняет миграцию: объединяет дубли (по filename + claude_url),
/// сохраняя последний timestamp и суммируя download_count.
#[tauri::command]
pub fn get_archive_log() -> Result<Vec<ArchiveLogEntry>, String> {
    let log_path = get_archive_log_path().ok_or("Cannot get log path")?;
    
    if !log_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let entries: Vec<ArchiveLogEntry> = serde_json::from_str(&content).unwrap_or_default();
    let original_len = entries.len();
    
    // Дедупликация: объединяем записи с одинаковыми normalized filename + claude_url
    let mut deduped: Vec<ArchiveLogEntry> = Vec::new();
    for mut entry in entries {
        let normalized = normalize_filename(&entry.filename);
        if let Some(existing) = deduped.iter_mut().find(|e| {
            normalize_filename(&e.filename) == normalized && e.claude_url == entry.claude_url
        }) {
            // Берём более позднюю дату
            if entry.timestamp > existing.timestamp {
                existing.timestamp = entry.timestamp;
            }
            existing.filename = normalized; // Чистое имя
            existing.download_count += entry.download_count;
            if !entry.file_path.is_empty() {
                existing.file_path = entry.file_path;
            }
        } else {
            entry.filename = normalized;
            deduped.push(entry);
        }
    }
    
    // Если были дубли — перезаписываем файл (одноразовая миграция)
    if deduped.len() != original_len {
        if let Ok(json) = serde_json::to_string_pretty(&deduped) {
            let _ = fs::write(&log_path, &json);
        }
    }
    
    Ok(deduped)
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
        download_count: 1,
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
