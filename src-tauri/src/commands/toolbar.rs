//! Команды тулбара навигации
//!
//! Этот модуль содержит Tauri команды для:
//! - Навигации (назад, вперёд, перезагрузка)
//! - Управления popup загрузок

use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};
use tauri::LogicalPosition;

use crate::state::{ACTIVE_TAB, PANEL_RATIO};
use crate::utils::dimensions::sizes;

/// Навигация назад в активном Claude webview
#[tauri::command]
pub fn toolbar_back(app: AppHandle) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        webview.eval("history.back()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Навигация вперёд в активном Claude webview
#[tauri::command]
pub fn toolbar_forward(app: AppHandle) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        webview.eval("history.forward()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Перезагрузка активного Claude webview
#[tauri::command]
pub fn toolbar_reload(app: AppHandle) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        webview.eval("location.reload()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Пересоздание активного Claude webview (для зависших табов)
#[tauri::command]
pub async fn toolbar_recreate(app: AppHandle) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    crate::commands::claude::recreate_claude_tab(app, tab).await
}

/// Показывает popup загрузок
///
/// Позиционирует popup над тулбаром в центре области Claude.
#[tauri::command]
pub fn show_downloads(app: AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let width = size.width as f64 / scale;
    let height = size.height as f64 / scale;
    
    let ratio = PANEL_RATIO.load(Ordering::SeqCst) as f64 / 100.0;
    let ui_width = width * ratio;
    let claude_x = ui_width;
    let claude_width = width - ui_width;
    
    if let Some(downloads) = app.get_webview("downloads") {
        // Центрируем по горизонтали в области Claude
        let downloads_x = claude_x + (claude_width - sizes::DOWNLOADS_WIDTH) / 2.0;
        // Позиционируем над toolbar
        let downloads_y = height 
            - sizes::TOOLBAR_HEIGHT 
            - sizes::TOOLBAR_BOTTOM_OFFSET 
            - sizes::DOWNLOADS_MARGIN 
            - sizes::DOWNLOADS_HEIGHT;
        
        downloads.set_position(LogicalPosition::new(downloads_x, downloads_y))
            .map_err(|e| e.to_string())?;
        let _ = downloads.show();
        
        // Обновляем список при каждом показе
        let _ = app.emit("refresh-downloads", ());
    }
    Ok(())
}

/// Скрывает popup загрузок
#[tauri::command]
pub fn hide_downloads(app: AppHandle) -> Result<(), String> {
    if let Some(downloads) = app.get_webview("downloads") {
        let _ = downloads.hide();
    }
    // Уведомляем toolbar что popup закрылся
    let _ = app.emit("downloads-closed", ());
    Ok(())
}
