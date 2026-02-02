//! Пути к файлам логов и настроек загрузок
//!
//! Этот модуль содержит функции для получения путей к:
//! - Логу архивов (скачанные из Claude файлы)
//! - Логу всех загрузок
//! - Настройкам загрузок
//! - Генерации уникальных имён файлов

use std::fs;
use std::path::PathBuf;

use crate::types::DownloadsSettings;

/// Идентификатор приложения для папки данных
const APP_IDENTIFIER: &str = "com.ai.prompts.manager";

/// Получает путь к папке данных приложения
///
/// Возвращает путь вида:
/// - Windows: `%LOCALAPPDATA%\com.ai.prompts.manager`
/// - macOS: `~/Library/Application Support/com.ai.prompts.manager`
/// - Linux: `~/.local/share/com.ai.prompts.manager`
pub fn get_app_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join(APP_IDENTIFIER))
}

/// Получает путь к файлу лога архивов
///
/// Архивный лог хранит информацию о файлах, скачанных из Claude
/// (артефакты, код, документы).
///
/// # Returns
/// Путь к `archive_log.json` или `None` если не удалось определить директорию
pub fn get_archive_log_path() -> Option<PathBuf> {
    get_app_data_dir().map(|d| d.join("archive_log.json"))
}

/// Получает путь к файлу лога всех загрузок
///
/// Этот лог хранит информацию обо всех скачанных файлах
/// для отображения в менеджере загрузок.
///
/// # Returns
/// Путь к `downloads_log.json` или `None` если не удалось определить директорию
pub fn get_downloads_log_path() -> Option<PathBuf> {
    get_app_data_dir().map(|d| d.join("downloads_log.json"))
}

/// Получает путь к файлу настроек загрузок
///
/// Настройки включают кастомный путь для сохранения файлов.
///
/// # Returns
/// Путь к `downloads_settings.json` или `None` если не удалось определить директорию
pub fn get_downloads_settings_path() -> Option<PathBuf> {
    get_app_data_dir().map(|d| d.join("downloads_settings.json"))
}

/// Получает кастомный путь загрузок из настроек
///
/// Читает файл настроек и возвращает кастомный путь,
/// если он задан и существует на диске.
///
/// # Returns
/// * `Some(path)` - кастомный путь существует и валиден
/// * `None` - путь не задан или не существует (использовать путь по умолчанию)
pub fn get_custom_downloads_path() -> Option<String> {
    let settings_path = get_downloads_settings_path()?;
    
    if !settings_path.exists() {
        return None;
    }
    
    let content = fs::read_to_string(&settings_path).ok()?;
    let settings: DownloadsSettings = serde_json::from_str(&content).ok()?;
    
    // Проверяем что путь существует
    if let Some(ref path) = settings.custom_path {
        if std::path::Path::new(path).exists() {
            return settings.custom_path;
        }
    }
    
    None
}

/// Сохраняет кастомный путь загрузок в настройки
///
/// # Arguments
/// * `path` - новый путь или `None` для сброса на путь по умолчанию
///
/// # Returns
/// * `Ok(())` - настройки успешно сохранены
/// * `Err(String)` - ошибка сохранения
pub fn save_custom_downloads_path(path: Option<String>) -> Result<(), String> {
    let settings_path = get_downloads_settings_path()
        .ok_or("Cannot get settings path")?;
    
    // Создаём директорию если нет
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let settings = DownloadsSettings { custom_path: path };
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&settings_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Генерирует уникальное имя файла, добавляя (1), (2) и т.д. если файл существует
///
/// # Arguments
/// * `dir` - директория для сохранения
/// * `filename` - желаемое имя файла
///
/// # Returns
/// Полный путь к файлу с уникальным именем
///
/// # Example
/// ```ignore
/// // Если "file.txt" существует, вернёт "file (1).txt"
/// let path = get_unique_filepath(Path::new("/downloads"), "file.txt");
/// ```
pub fn get_unique_filepath(dir: &std::path::Path, filename: &str) -> PathBuf {
    let full_path = dir.join(filename);
    
    if !full_path.exists() {
        return full_path;
    }
    
    // Разбиваем на имя и расширение
    let path = std::path::Path::new(filename);
    let stem = path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    let extension = path.extension().and_then(|s| s.to_str());
    
    // Ищем свободный номер
    let mut counter = 1;
    loop {
        let new_filename = match extension {
            Some(ext) => format!("{} ({}).{}", stem, counter, ext),
            None => format!("{} ({})", stem, counter),
        };
        let new_path = dir.join(&new_filename);
        
        if !new_path.exists() {
            return new_path;
        }
        
        counter += 1;
        
        // Защита от бесконечного цикла - используем timestamp для гарантированной уникальности
        if counter > 9999 {
            let ts = chrono::Utc::now().timestamp_millis();
            let fallback_filename = match extension {
                Some(ext) => format!("{}_{}.{}", stem, ts, ext),
                None => format!("{}_{}", stem, ts),
            };
            return dir.join(fallback_filename);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_app_identifier() {
        assert_eq!(APP_IDENTIFIER, "com.ai.prompts.manager");
    }

    #[test]
    fn test_get_app_data_dir() {
        let path = get_app_data_dir();
        assert!(path.is_some());
        assert!(path.unwrap().ends_with(APP_IDENTIFIER));
    }

    #[test]
    fn test_log_paths_have_correct_filenames() {
        if let Some(path) = get_archive_log_path() {
            assert_eq!(path.file_name().unwrap(), "archive_log.json");
        }
        
        if let Some(path) = get_downloads_log_path() {
            assert_eq!(path.file_name().unwrap(), "downloads_log.json");
        }
        
        if let Some(path) = get_downloads_settings_path() {
            assert_eq!(path.file_name().unwrap(), "downloads_settings.json");
        }
    }

    #[test]
    fn test_unique_filepath_new_file() {
        // Для несуществующего файла должен вернуть оригинальное имя
        let dir = Path::new("/tmp/nonexistent_dir_12345");
        let result = get_unique_filepath(dir, "test.txt");
        assert_eq!(result, dir.join("test.txt"));
    }
}
