//! Команды для работы с аттачментами
//!
//! Этот модуль содержит Tauri команды для:
//! - Чтения файлов для прикрепления к сообщениям Claude
//! - Записи временных файлов (скрипты)
//! - Прикрепления файлов к Claude через инжекцию в input[type="file"]

use std::fs;
use tauri::{AppHandle, Manager};
use base64::Engine;

use crate::types::FileData;
use crate::utils::mime::get_mime_type;
use crate::utils::dimensions::limits::MAX_ATTACHMENT_SIZE;

/// Читает файл и подготавливает для отправки в Claude
///
/// # Arguments
/// * `path` - путь к файлу
///
/// # Returns
/// Структура FileData с именем, MIME-типом и base64 содержимым
///
/// # Errors
/// - Файл не найден
/// - Файл слишком большой (>50 MB)
/// - Ошибка чтения
#[tauri::command]
pub async fn read_file_for_attachment(path: String) -> Result<FileData, String> {
    let path = std::path::Path::new(&path);
    
    // Проверяем существование файла
    if !path.exists() {
        return Err(format!("Файл не найден: {}", path.display()));
    }
    
    // Проверяем размер файла
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Ошибка получения метаданных: {}", e))?;
    
    if metadata.len() > MAX_ATTACHMENT_SIZE {
        return Err(format!(
            "Файл слишком большой: {} MB (максимум {} MB)", 
            metadata.len() / 1024 / 1024,
            MAX_ATTACHMENT_SIZE / 1024 / 1024
        ));
    }
    
    // Читаем файл
    let data = fs::read(path)
        .map_err(|e| format!("Ошибка чтения файла: {}", e))?;
    
    // Определяем MIME-тип
    let mime_type = get_mime_type(path.extension().and_then(|e| e.to_str())).to_string();
    
    // Кодируем в base64
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);
    
    // Получаем имя файла
    let name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    
    Ok(FileData {
        name,
        mime_type,
        data: base64_data,
    })
}

/// Записывает временный файл (для скриптов)
///
/// Безопасно обрабатывает имя файла (удаляет path traversal).
///
/// # Arguments
/// * `app` - handle приложения
/// * `filename` - имя файла
/// * `content` - содержимое файла
///
/// # Returns
/// Полный путь к созданному файлу
#[tauri::command]
pub async fn write_temp_file(
    app: AppHandle, 
    filename: String, 
    content: String
) -> Result<String, String> {
    // Sanitize filename — извлекаем только имя файла
    let safe_filename = std::path::Path::new(&filename)
        .file_name()
        .ok_or("Invalid filename: path components not allowed")?
        .to_str()
        .ok_or("Invalid filename encoding")?;
    
    if safe_filename.is_empty() {
        return Err("Filename cannot be empty".to_string());
    }
    
    // Получаем директорию для временных файлов
    let temp_dir = app.path().temp_dir()
        .map_err(|e| format!("Cannot get temp dir: {}", e))?;
    
    // Создаём поддиректорию
    let scripts_dir = temp_dir.join("ai-prompts-manager-scripts");
    fs::create_dir_all(&scripts_dir)
        .map_err(|e| format!("Cannot create scripts dir: {}", e))?;
    
    // Полный путь к файлу
    let file_path = scripts_dir.join(safe_filename);
    
    // Записываем содержимое
    fs::write(&file_path, &content)
        .map_err(|e| format!("Cannot write file: {}", e))?;
    
    Ok(file_path.to_string_lossy().to_string())
}

/// Прикрепляет файл к сообщению Claude через инжекцию
///
/// Читает файл, кодирует в base64 и инжектит в input[type="file"]
/// через DataTransfer API.
///
/// # Arguments
/// * `app` - handle приложения
/// * `tab` - номер таба Claude
/// * `path` - путь к файлу
#[tauri::command]
pub async fn attach_file_to_claude(
    app: AppHandle, 
    tab: u8, 
    path: String
) -> Result<(), String> {
    let file_path = std::path::Path::new(&path);
    
    // Проверяем существование файла
    if !file_path.exists() {
        return Err(format!("Файл не найден: {}", file_path.display()));
    }
    
    // Читаем файл
    let data = fs::read(file_path)
        .map_err(|e| format!("Ошибка чтения файла: {}", e))?;
    
    // Определяем MIME-тип
    let mime_type = get_mime_type(file_path.extension().and_then(|e| e.to_str()));
    
    // Кодируем в base64
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);
    
    // Получаем имя файла
    let file_name = file_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    
    // Формируем скрипт для инжекта
    let script = format!(r#"
        (async function() {{
            try {{
                const SEL = window.__SEL__;
                const fileInputSelector = SEL?.input?.fileInput || 'input[type="file"]';
                
                // Ждём готовности страницы
                const waitForInput = async (timeout = 15000) => {{
                    const start = Date.now();
                    while (Date.now() - start < timeout) {{
                        const input = document.querySelector(fileInputSelector);
                        if (input) return input;
                        await new Promise(r => setTimeout(r, 200));
                    }}
                    return null;
                }};
                
                let fileInput = await waitForInput();
                
                if (!fileInput) {{
                    console.warn('[Attachment] File input not found');
                    return;
                }}
                
                // Декодируем base64
                const base64 = "{base64}";
                const binaryString = atob(base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {{
                    bytes[i] = binaryString.charCodeAt(i);
                }}
                
                // Создаём File объект
                const blob = new Blob([bytes], {{ type: "{mime}" }});
                const file = new File([blob], "{name}", {{ type: "{mime}" }});
                
                // Создаём DataTransfer и устанавливаем файлы
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                
                // Триггерим событие change
                fileInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
                
            }} catch (e) {{
                console.error('[Attachment] Error:', e);
            }}
        }})();
    "#, 
        base64 = base64_data, 
        mime = mime_type, 
        name = file_name
    );
    
    // Инжектим в webview
    let label = format!("claude_{}", tab);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} not found", label))?;
    
    webview.eval(&script).map_err(|e| e.to_string())?;
    
    Ok(())
}
