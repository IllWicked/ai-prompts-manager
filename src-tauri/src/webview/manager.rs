//! Управление WebView
//!
//! Этот модуль содержит функции для:
//! - Создания Claude webview с обработчиками событий
//! - Создания и пересоздания toolbar
//! - Изменения размеров и позиций webview

use std::fs;
use std::sync::atomic::Ordering;
use tauri::{
    AppHandle, Emitter, Manager,
    WebviewBuilder, WebviewUrl,
    LogicalPosition, LogicalSize,
};

use crate::state::{
    CLAUDE_VISIBLE, ACTIVE_TAB, PANEL_RATIO,
    WEBVIEW_CREATION_LOCK, DOWNLOADS_LOG_LOCK,
};
use crate::types::DownloadEntry;
use crate::utils::get_dimensions;
use crate::utils::dimensions::sizes;
use crate::downloads::paths::{
    get_custom_downloads_path, 
    get_unique_filepath,
    get_downloads_log_path,
};
use crate::webview::scripts::get_claude_init_script;

/// Создаёт Claude webview если он ещё не существует
///
/// Потокобезопасная функция — использует мьютекс для предотвращения
/// race condition при быстром переключении табов.
///
/// # Arguments
/// * `app` - handle приложения
/// * `tab` - номер таба (1-3)
/// * `url` - начальный URL (по умолчанию "https://claude.ai/new")
///
/// # Returns
/// * `Ok(())` - webview создан или уже существует
/// * `Err(String)` - ошибка создания
pub fn ensure_claude_webview(app: &AppHandle, tab: u8, url: Option<&str>) -> Result<(), String> {
    // Блокируем создание webview для предотвращения race condition
    let _guard = WEBVIEW_CREATION_LOCK.lock()
        .map_err(|_| "Webview creation lock poisoned")?;
    
    let label = format!("claude_{}", tab);
    
    // Проверяем ещё раз под локом - webview мог быть создан пока ждали
    if app.get_webview(&label).is_some() {
        return Ok(());
    }
    
    let window = app.get_window("main").ok_or("Window not found")?;
    let (width, height, _) = get_dimensions(app)?;
    let ratio = PANEL_RATIO.load(Ordering::SeqCst) as f64 / 100.0;
    let ui_width = width * ratio;
    let claude_width = width - ui_width;
    
    let target_url = url.unwrap_or("https://claude.ai/new");
    
    // Клонируем app handle для использования в closures
    let app_handle = app.clone();
    let app_handle_page = app.clone();
    let tab_for_page = tab;
    
    let url_parsed = target_url.parse()
        .map_err(|e| format!("Invalid URL '{}': {}", target_url, e))?;
    
    // Скрипт который выполняется при каждой загрузке страницы
    let init_script = get_claude_init_script(tab);
    
    window.add_child(
        WebviewBuilder::new(&label, WebviewUrl::External(url_parsed))
            .initialization_script(&init_script)
            .disable_drag_drop_handler()
            .on_page_load(move |_webview, payload| {
                use tauri::webview::PageLoadEvent;
                if payload.event() == PageLoadEvent::Finished {
                    let _ = app_handle_page.emit("claude-page-loaded", serde_json::json!({
                        "tab": tab_for_page,
                        "url": payload.url().to_string()
                    }));
                }
            })
            .on_download(move |webview, event| {
                handle_download_event(&app_handle, &webview, event, tab)
            }),
        LogicalPosition::new(width * 2.0, 0.0), // Создаём за экраном
        LogicalSize::new(claude_width, height),
    ).map_err(|e| e.to_string())?;
    
    // После создания нового Claude webview - пересоздаём toolbar чтобы он был поверх
    recreate_toolbar(app)?;
    
    Ok(())
}

/// Обработчик событий загрузки файлов
fn handle_download_event(
    app: &AppHandle,
    webview: &tauri::Webview,
    event: tauri::webview::DownloadEvent,
    tab: u8,
) -> bool {
    use tauri::webview::DownloadEvent;
    
    match event {
        DownloadEvent::Requested { url, destination } => {
            let url_str = url.as_str();
            
            // Извлекаем имя файла из URL
            let filename = extract_filename_from_url(url_str);
            
            // Устанавливаем путь загрузки с уникальным именем
            if let Some(custom_path) = get_custom_downloads_path() {
                let dir = std::path::PathBuf::from(&custom_path);
                *destination = get_unique_filepath(&dir, &filename);
            } else if let Some(dir) = destination.parent() {
                *destination = get_unique_filepath(dir, &filename);
            }
            
            // Отправляем событие с итоговым именем файла
            let final_filename = destination.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&filename)
                .to_string();
            let _ = app.emit("download-started", &final_filename);
        }
        
        DownloadEvent::Finished { url: _, path, success } => {
            let filename = path.as_ref()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("file")
                .to_string();
            
            let file_path = path.as_ref()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            
            let claude_url = webview.url()
                .map(|u| u.to_string())
                .unwrap_or_default();
            
            if success {
                // Добавляем в лог загрузок
                save_download_to_log(&filename, &file_path);
                
                let _ = app.emit("download-finished", serde_json::json!({
                    "filename": filename,
                    "tab": tab,
                    "url": claude_url,
                    "file_path": file_path
                }));
            } else {
                let _ = app.emit("download-failed", &filename);
            }
        }
        
        _ => {}
    }
    
    true // Разрешаем загрузку
}

/// Извлекает имя файла из URL загрузки Claude
fn extract_filename_from_url(url_str: &str) -> String {
    if url_str.contains("path=") {
        // Одиночный файл
        url_str.split("path=").nth(1)
            .and_then(|s| s.split('&').next())
            .map(|s| urlencoding::decode(s).unwrap_or_default().to_string())
            .and_then(|s| s.split('/').last().map(|s| s.to_string()))
            .unwrap_or_else(|| "file".to_string())
    } else if url_str.contains("download-files") {
        // Архив из нескольких файлов
        "claude_files.zip".to_string()
    } else {
        // Fallback
        url_str.split('/').last()
            .and_then(|s| s.split('?').next())
            .unwrap_or("file")
            .to_string()
    }
}

/// Сохраняет запись о загрузке в лог
fn save_download_to_log(filename: &str, file_path: &str) {
    if let Ok(_guard) = DOWNLOADS_LOG_LOCK.lock() {
        if let Some(log_path) = get_downloads_log_path() {
            let mut entries: Vec<DownloadEntry> = if log_path.exists() {
                fs::read_to_string(&log_path)
                    .ok()
                    .and_then(|c| serde_json::from_str(&c).ok())
                    .unwrap_or_default()
            } else {
                Vec::new()
            };
            
            // Проверяем дубликаты
            if !entries.iter().any(|e| e.file_path == file_path) {
                entries.push(DownloadEntry {
                    timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                    filename: filename.to_string(),
                    file_path: file_path.to_string(),
                });
                
                // Ограничиваем размер
                if entries.len() > 500 {
                    entries = entries.split_off(entries.len() - 500);
                }
                
                if let Ok(json) = serde_json::to_string_pretty(&entries) {
                    if let Err(e) = fs::write(&log_path, json) {
                        eprintln!("[Downloads] Failed to write log: {}", e);
                    }
                }
            }
        }
    }
}

/// Создаёт webview тулбара если он ещё не существует
///
/// Вызывается ПОСЛЕ создания claude webview чтобы быть поверх.
pub fn ensure_toolbar(app: &AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    
    // Создаём toolbar если его нет
    if app.get_webview("toolbar").is_none() {
        window.add_child(
            WebviewBuilder::new("toolbar", WebviewUrl::App("toolbar.html".into()))
                .transparent(true)
                .background_color(tauri::webview::Color(0, 0, 0, 0)),
            LogicalPosition::new(-500.0, 0.0),
            LogicalSize::new(sizes::TOOLBAR_WIDTH, sizes::TOOLBAR_HEIGHT),
        ).map_err(|e| e.to_string())?;
    }
    
    // Создаём downloads popup если его нет
    if app.get_webview("downloads").is_none() {
        window.add_child(
            WebviewBuilder::new("downloads", WebviewUrl::App("downloads.html".into()))
                .transparent(true)
                .background_color(tauri::webview::Color(0, 0, 0, 0)),
            LogicalPosition::new(-500.0, 0.0),
            LogicalSize::new(sizes::DOWNLOADS_WIDTH, sizes::DOWNLOADS_HEIGHT),
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Пересоздаёт toolbar чтобы поднять его z-order
///
/// Вызывается после создания новых Claude webview.
pub fn recreate_toolbar(app: &AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    
    // Закрываем существующие
    if let Some(toolbar) = app.get_webview("toolbar") {
        let _ = toolbar.close();
    }
    if let Some(downloads) = app.get_webview("downloads") {
        let _ = downloads.close();
    }
    
    // Небольшая задержка чтобы webview успели закрыться
    std::thread::sleep(std::time::Duration::from_millis(10));
    
    // Создаём заново - теперь они будут поверх
    window.add_child(
        WebviewBuilder::new("toolbar", WebviewUrl::App("toolbar.html".into()))
            .transparent(true)
            .background_color(tauri::webview::Color(0, 0, 0, 0)),
        LogicalPosition::new(-500.0, 0.0),
        LogicalSize::new(sizes::TOOLBAR_WIDTH, sizes::TOOLBAR_HEIGHT),
    ).map_err(|e| e.to_string())?;
    
    window.add_child(
        WebviewBuilder::new("downloads", WebviewUrl::App("downloads.html".into()))
            .transparent(true)
            .background_color(tauri::webview::Color(0, 0, 0, 0)),
        LogicalPosition::new(-500.0, 0.0),
        LogicalSize::new(sizes::DOWNLOADS_WIDTH, sizes::DOWNLOADS_HEIGHT),
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Обновляет размеры и позиции всех webview
///
/// Вызывается при:
/// - Изменении размера окна
/// - Переключении видимости Claude
/// - Изменении соотношения панелей
/// - Переключении табов
pub fn resize_webviews(app: &AppHandle) -> Result<(), String> {
    let (width, height, _) = get_dimensions(app)?;
    let is_visible = CLAUDE_VISIBLE.load(Ordering::SeqCst);
    let active_tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let ratio = PANEL_RATIO.load(Ordering::SeqCst) as f64 / 100.0;
    
    let ui_webview = app.get_webview("ui").ok_or("UI webview not found")?;
    
    if is_visible {
        let ui_width = width * ratio;
        let claude_width = width - ui_width;
        let claude_x = ui_width;
        
        // UI - левая часть
        ui_webview.set_position(LogicalPosition::new(0.0, 0.0))
            .map_err(|e| e.to_string())?;
        ui_webview.set_size(LogicalSize::new(ui_width, height))
            .map_err(|e| e.to_string())?;
        
        // Claude tabs - правая часть
        for i in 1u8..=3 {
            let label = format!("claude_{}", i);
            if let Some(webview) = app.get_webview(&label) {
                if i == active_tab {
                    webview.set_position(LogicalPosition::new(claude_x, 0.0))
                        .map_err(|e| e.to_string())?;
                    webview.set_size(LogicalSize::new(claude_width, height))
                        .map_err(|e| e.to_string())?;
                } else {
                    webview.set_position(LogicalPosition::new(width * 2.0, 0.0))
                        .map_err(|e| e.to_string())?;
                }
            }
        }
        
        // Toolbar - внизу по центру области claude
        if let Some(toolbar) = app.get_webview("toolbar") {
            let toolbar_x = claude_x + (claude_width - sizes::TOOLBAR_WIDTH) / 2.0;
            let toolbar_y = height - sizes::TOOLBAR_HEIGHT - sizes::TOOLBAR_BOTTOM_OFFSET;
            toolbar.set_position(LogicalPosition::new(toolbar_x, toolbar_y))
                .map_err(|e| e.to_string())?;
            toolbar.set_size(LogicalSize::new(sizes::TOOLBAR_WIDTH, sizes::TOOLBAR_HEIGHT))
                .map_err(|e| e.to_string())?;
        }
    } else {
        // UI - на всю ширину
        ui_webview.set_position(LogicalPosition::new(0.0, 0.0))
            .map_err(|e| e.to_string())?;
        ui_webview.set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        
        // Все Claude скрываем
        for i in 1u8..=3 {
            let label = format!("claude_{}", i);
            if let Some(webview) = app.get_webview(&label) {
                webview.set_position(LogicalPosition::new(width * 2.0, 0.0))
                    .map_err(|e| e.to_string())?;
            }
        }
        
        // Тулбар тоже скрываем
        if let Some(toolbar) = app.get_webview("toolbar") {
            toolbar.set_position(LogicalPosition::new(width * 2.0, 0.0))
                .map_err(|e| e.to_string())?;
        }
        
        // Downloads тоже скрываем
        if let Some(downloads) = app.get_webview("downloads") {
            downloads.set_position(LogicalPosition::new(width * 2.0, 0.0))
                .map_err(|e| e.to_string())?;
        }
    }
    
    Ok(())
}
