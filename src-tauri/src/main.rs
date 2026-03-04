//! AI Prompts Manager - точка входа
//!
//! Этот файл содержит только:
//! - Конфигурацию Tauri Builder
//! - Регистрацию команд
//! - Setup приложения (создание окна)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    Emitter,
    WebviewBuilder, WebviewUrl, WindowBuilder,
    LogicalPosition, LogicalSize,
};

// Импортируем библиотеку
use ai_prompts_manager::{
    utils, 
    webview, 
    commands::{app, claude, attachments, downloads, logs, toolbar, storage},
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // App commands
            app::reset_app_data,
            app::open_app_data_dir,
            app::set_window_background,
            app::get_window_width,
            
            // Claude commands
            claude::preload_claude,
            claude::toggle_claude,
            claude::get_active_tab,
            claude::switch_claude_tab,
            claude::switch_claude_tab_with_url,
            claude::get_tab_url,
            claude::get_claude_state,
            claude::new_chat_in_tab,
            claude::reload_claude_tab,
            claude::recreate_claude_tab,
            claude::navigate_claude_tab,
            claude::notify_url_change,
            claude::reset_claude_state,
            claude::set_panel_ratio,
            claude::get_panel_ratio,
            claude::eval_in_claude,
            claude::eval_in_claude_with_result,
            claude::inject_generation_monitor,
            claude::check_generation_status,
            claude::set_generation_state,
            claude::insert_text_to_claude,
            
            // Attachments commands
            attachments::read_file_for_attachment,
            attachments::write_temp_file,
            attachments::attach_file_to_claude,
            attachments::get_upload_count,
            attachments::reset_upload_count,
            attachments::increment_upload_count,
            
            // Storage commands
            storage::save_tabs_to_file,
            storage::load_tabs_from_file,
            storage::delete_tabs_file,
            storage::get_tabs_file_size,
            
            // Downloads commands
            downloads::get_downloads_path,
            downloads::set_downloads_path,
            downloads::pick_downloads_folder,
            downloads::open_file,
            downloads::delete_download,
            downloads::delete_all_downloads,
            
            // Logs commands
            logs::get_archive_log,
            logs::clear_archive_log,
            logs::add_archive_log_entry,
            logs::get_downloads_log,
            logs::add_download_entry,
            logs::write_diagnostic,
            logs::export_diagnostics,
            
            // Toolbar commands
            toolbar::toolbar_back,
            toolbar::toolbar_forward,
            toolbar::toolbar_reload,
            toolbar::toolbar_recreate,
            toolbar::show_downloads,
            toolbar::hide_downloads,
            toolbar::forward_scroll,
            toolbar::forward_click,
        ])
        .setup(|app| {
            // Создаём окно - на весь экран
            let window = WindowBuilder::new(app, "main")
                .title("AI Prompts Manager")
                .inner_size(1000.0, 600.0)
                .min_inner_size(800.0, 500.0)
                .center()
                .maximized(true)
                .build()?;
            
            // Устанавливаем иконку из EXE ресурса (workaround для бага Tauri)
            utils::set_window_icon_from_exe(&window);
            
            // Создаём UI webview
            window.add_child(
                WebviewBuilder::new("ui", WebviewUrl::App("index.html".into())),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(1000.0, 600.0),
            )?;
            
            // Запускаем фоновые задачи
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Ресайзим UI под реальный размер окна
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                let _ = webview::resize_webviews(&app_handle);
                
                // Создаём все три Claude webview при старте
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                for tab in 1u8..=3 {
                    if let Err(e) = webview::create_claude_webview(&app_handle, tab, None) {
                        eprintln!("[Startup] Failed to create claude_{}: {}", tab, e);
                        let _ = logs::write_diagnostic(
                            "startup_error".to_string(),
                            format!("{{\"tab\":{},\"error\":\"{}\"}}", tab, e),
                        );
                        let _ = app_handle.emit("startup-error", serde_json::json!({
                            "tab": tab, "error": e
                        }));
                    } else {
                        // Регистрируем COM-обработчик DocumentTitleChanged
                        webview::setup_title_change_monitor(&app_handle, tab);
                    }
                }
                
                // Создаём toolbar/downloads поверх всех Claude
                if let Err(e) = webview::ensure_toolbar(&app_handle) {
                    eprintln!("[Startup] Failed to create toolbar: {}", e);
                    let _ = logs::write_diagnostic(
                        "startup_error".to_string(),
                        format!("{{\"component\":\"toolbar\",\"error\":\"{}\"}}", e),
                    );
                }
                
                // Suspend неактивные табы (2 и 3) для экономии CPU/RAM
                webview::suspend_claude_tab(&app_handle, 2);
                webview::suspend_claude_tab(&app_handle, 3);
                
                // Поднимаем z-order toolbar
                webview::raise_toolbar_zorder(&app_handle);
                
                // Синхронизируем позиции всех webview
                let _ = webview::resize_webviews(&app_handle);
            });
            
            // Обработчик изменения размера окна
            let app_handle2 = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Resized(_) = event {
                    let _ = webview::resize_webviews(&app_handle2);
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
