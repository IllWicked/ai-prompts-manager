//! Структуры данных для AI Prompts Manager
//!
//! Этот модуль содержит все типы данных, используемые в приложении:
//! - Записи логов (архивы, загрузки)
//! - Настройки
//! - Данные файлов для аттачментов

use serde::{Deserialize, Serialize};

/// Запись в логе архивов (скачанные из Claude файлы)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ArchiveLogEntry {
    /// Временная метка в формате "YYYY-MM-DD HH:MM:SS"
    pub timestamp: String,
    /// Номер таба Claude (1-3)
    pub tab: u8,
    /// Имя скачанного файла
    pub filename: String,
    /// URL страницы Claude, с которой был скачан файл
    pub claude_url: String,
    /// Полный путь к скачанному файлу на диске
    #[serde(default)]
    pub file_path: String,
    /// Имя проекта из URL (если применимо)
    #[serde(default)]
    pub project_name: String,
    /// Сколько раз файл был скачан (дубли объединяются)
    #[serde(default = "default_download_count")]
    pub download_count: u32,
}

fn default_download_count() -> u32 { 1 }

/// Запись в логе всех загрузок
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DownloadEntry {
    /// Временная метка в формате "YYYY-MM-DD HH:MM:SS"
    pub timestamp: String,
    /// Имя файла
    pub filename: String,
    /// Полный путь к файлу на диске
    pub file_path: String,
}

/// Настройки загрузок
#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct DownloadsSettings {
    /// Кастомный путь для сохранения загрузок (None = путь по умолчанию)
    #[serde(default)]
    pub custom_path: Option<String>,
}

/// Данные файла для аттачмента к сообщению Claude
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileData {
    /// Имя файла
    pub name: String,
    /// MIME-тип файла
    pub mime_type: String,
    /// Содержимое файла в base64
    pub data: String,
}

/// Запись в логе диагностики (технические события для отладки)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiagnosticEntry {
    /// Временная метка в формате ISO 8601
    pub timestamp: String,
    /// Тип события (selector_broken, cdp_timeout, storage_error, send_error и т.д.)
    pub event_type: String,
    /// JSON-строка с деталями события
    #[serde(default)]
    pub details: String,
}
