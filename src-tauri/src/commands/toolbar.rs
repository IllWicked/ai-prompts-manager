//! Команды тулбара навигации
//!
//! Этот модуль содержит Tauri команды для:
//! - Навигации (назад, вперёд, перезагрузка)
//! - Управления popup загрузок
//! - Проброса событий (scroll, click)

use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};
use tauri::LogicalPosition;

use crate::state::{ACTIVE_TAB, PANEL_RATIO};
use crate::utils::dimensions::sizes;
use crate::webview::scripts::{get_scroll_script, get_click_script};

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
        
        // Обновляем список при каждом показе
        let _ = app.emit("refresh-downloads", ());
    }
    Ok(())
}

/// Скрывает popup загрузок
#[tauri::command]
pub fn hide_downloads(app: AppHandle) -> Result<(), String> {
    if let Some(downloads) = app.get_webview("downloads") {
        downloads.set_position(LogicalPosition::new(-500.0, 0.0))
            .map_err(|e| e.to_string())?;
    }
    // Уведомляем toolbar что popup закрылся
    let _ = app.emit("downloads-closed", ());
    Ok(())
}

/// Пробрасывает scroll из toolbar в активный Claude webview
///
/// # Arguments
/// * `delta_y` - величина скролла в пикселях (положительное = вниз)
#[tauri::command]
pub fn forward_scroll(app: AppHandle, delta_y: f64) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        let script = get_scroll_script(delta_y);
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Пробрасывает клик из toolbar в активный Claude webview
///
/// Конвертирует координаты из системы координат toolbar
/// в систему координат Claude webview.
///
/// # Arguments
/// * `x`, `y` - координаты клика относительно toolbar
#[tauri::command]
pub fn forward_click(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let label = format!("claude_{}", tab);
    
    // Получаем позицию toolbar относительно окна
    let window = app.get_window("main").ok_or("Main window not found")?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let width = size.width as f64 / scale;
    let height = size.height as f64 / scale;
    
    let ratio = PANEL_RATIO.load(Ordering::SeqCst) as f64 / 100.0;
    let ui_width = width * ratio;
    let claude_x = ui_width;
    let claude_width = width - ui_width;
    
    // Позиция toolbar (должна совпадать с resize_webviews)
    let toolbar_width = sizes::TOOLBAR_WIDTH;
    let toolbar_x = claude_x + (claude_width - toolbar_width) / 2.0;
    let toolbar_y = height - sizes::TOOLBAR_HEIGHT - sizes::TOOLBAR_BOTTOM_OFFSET;
    
    // Координаты клика относительно Claude webview
    let claude_click_x = toolbar_x - claude_x + x;
    let claude_click_y = toolbar_y + y;
    
    if let Some(webview) = app.get_webview(&label) {
        let script = get_click_script(claude_click_x, claude_click_y);
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}
