//! Управление WebView
//!
//! Этот модуль содержит функции для:
//! - Создания Claude webview с обработчиками событий
//! - Создания toolbar и управления z-order
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
    WEBVIEW_CREATION_LOCK, TOOLBAR_CREATION_LOCK, DOWNLOADS_LOG_LOCK,
    UPLOAD_COUNTERS,
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
    let created = create_claude_webview(app, tab, url)?;
    
    if created {
        // Поднимаем z-order toolbar поверх нового Claude webview
        if app.get_webview("toolbar").is_some() {
            raise_toolbar_zorder(app);
        } else {
            ensure_toolbar(app)?;
        }
    }
    
    Ok(())
}

/// Создаёт Claude webview без пересоздания toolbar.
/// Возвращает true если webview был создан, false если уже существовал.
/// Используется в батчевых операциях (startup, reset) где toolbar
/// пересоздаётся один раз в конце.
pub fn create_claude_webview(app: &AppHandle, tab: u8, url: Option<&str>) -> Result<bool, String> {
    // Блокируем создание webview для предотвращения race condition
    let _guard = WEBVIEW_CREATION_LOCK.lock()
        .map_err(|_| "Webview creation lock poisoned")?;
    
    let label = format!("claude_{}", tab);
    
    // Проверяем ещё раз под локом - webview мог быть создан пока ждали
    if app.get_webview(&label).is_some() {
        return Ok(false);
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
                    let url = payload.url().to_string();
                    // Не эмитим событие для about:blank и других не-Claude страниц
                    if url.starts_with("https://claude.ai") {
                        let _ = app_handle_page.emit("claude-page-loaded", serde_json::json!({
                            "tab": tab_for_page,
                            "url": url
                        }));
                    }
                }
            })
            .on_download(move |webview, event| {
                handle_download_event(&app_handle, &webview, event, tab)
            }),
        LogicalPosition::new(width * 2.0, 0.0),
        LogicalSize::new(claude_width, height),
    ).map_err(|e| e.to_string())?;
    
    // Скрываем при создании — layout_claude покажет через show() + позицию
    // Создаём за экраном (width*2) чтобы избежать мелькания до hide()
    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.hide();
    }
    
    // Регистрируем нативный перехватчик загрузок (Windows: WebResourceRequested)
    setup_native_upload_interceptor(app, tab);
    
    Ok(true)
}

/// Регистрирует нативный перехватчик загрузок файлов
///
/// На Windows: использует WebView2 WebResourceRequested для перехвата
/// запросов к `/upload-file` на уровне сетевого стека.
/// На других платформах: no-op.
fn setup_native_upload_interceptor(app: &AppHandle, tab: u8) {
    #[cfg(windows)]
    {
        let label = format!("claude_{}", tab);
        let tab_index = (tab.saturating_sub(1)) as usize;
        
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.with_webview(move |wv| {
                unsafe {
                    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
                    use webview2_com::WebResourceRequestedEventHandler;
                    
                    let core: ICoreWebView2 = wv.controller().CoreWebView2().unwrap();
                    
                    let filter: Vec<u16> = "*upload-file*"
                        .encode_utf16()
                        .chain(std::iter::once(0))
                        .collect();
                    let _ = core.AddWebResourceRequestedFilter(
                        windows_core::PCWSTR::from_raw(filter.as_ptr()),
                        webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_RESOURCE_CONTEXT(0)
                    );
                    
                    let handler = WebResourceRequestedEventHandler::create(Box::new(
                        move |_sender, _args| {
                            if tab_index < 3 {
                                UPLOAD_COUNTERS[tab_index].fetch_add(
                                    1, std::sync::atomic::Ordering::SeqCst
                                );
                            }
                            Ok(())
                        }
                    ));
                    
                    let mut token: i64 = 0;
                    let _ = core.add_WebResourceRequested(
                        &handler,
                        &mut token as *mut i64 as *mut _
                    );
                }
            });
        }
    }
    
    #[cfg(not(windows))]
    {
        let _ = (app, tab);
    }
}

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

/// Приостанавливает Claude webview — ОТКЛЮЧЕНО.
///
/// hide() уже вызывает put_IsVisible(FALSE), что throttle-ит анимации и снижает CPU.
/// TrySuspend дополнительно замораживает DOM, что ломает querySelector/insertContent
/// на фоновых табах. Экономия памяти не стоит проблем со стабильностью.
pub fn suspend_claude_tab(_app: &AppHandle, _tab: u8) {}

/// Возобновляет Claude webview — ОТКЛЮЧЕНО (suspend отключён).
pub fn resume_claude_tab(_app: &AppHandle, _tab: u8) {}

/// Поднимает z-order toolbar и downloads поверх Claude webview
///
/// Использует Win32 SetWindowPos(HWND_TOP) для изменения z-order
/// без пересоздания webview. Сохраняет состояние, не вызывает мерцания.
/// На не-Windows платформах — no-op.
pub fn raise_toolbar_zorder(app: &AppHandle) {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE, HWND_TOP,
        };
        
        for label in &["toolbar", "downloads"] {
            if let Some(webview) = app.get_webview(label) {
                let _ = webview.with_webview(move |wv| {
                    unsafe {
                        let mut hwnd = std::mem::zeroed();
                        let _ = wv.controller().ParentWindow(&mut hwnd);
                        if !hwnd.is_invalid() {
                            let _ = SetWindowPos(
                                hwnd,
                                Some(HWND_TOP),
                                0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                            );
                        }
                    }
                });
            }
        }
    }
    
    #[cfg(not(windows))]
    {
        let _ = app;
    }
}

/// Создаёт webview тулбара если он ещё не существует
///
/// Вызывается ПОСЛЕ создания claude webview чтобы быть поверх.
/// Потокобезопасная — использует мьютекс.
pub fn ensure_toolbar(app: &AppHandle) -> Result<(), String> {
    // Блокируем для предотвращения race condition
    let _guard = TOOLBAR_CREATION_LOCK.lock()
        .map_err(|_| "Toolbar creation lock poisoned")?;
    
    let window = app.get_window("main").ok_or("Main window not found")?;
    
    // Создаём toolbar если его нет
    if app.get_webview("toolbar").is_none() {
        window.add_child(
            WebviewBuilder::new("toolbar", WebviewUrl::App("toolbar.html".into()))
                .transparent(true)
                .background_color(tauri::webview::Color(0, 0, 0, 0)),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(sizes::TOOLBAR_WIDTH, sizes::TOOLBAR_HEIGHT),
        ).map_err(|e| e.to_string())?;
        // Скрываем сразу — resize_webviews покажет когда нужно
        if let Some(toolbar) = app.get_webview("toolbar") {
            let _ = toolbar.hide();
        }
    }
    
    // Создаём downloads popup если его нет
    if app.get_webview("downloads").is_none() {
        window.add_child(
            WebviewBuilder::new("downloads", WebviewUrl::App("downloads.html".into()))
                .transparent(true)
                .background_color(tauri::webview::Color(0, 0, 0, 0)),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(sizes::DOWNLOADS_WIDTH, sizes::DOWNLOADS_HEIGHT),
        ).map_err(|e| e.to_string())?;
        // Скрываем сразу — show_downloads покажет когда нужно
        if let Some(downloads) = app.get_webview("downloads") {
            let _ = downloads.hide();
        }
    }
    
    Ok(())
}

/// Обновляет layout UI панели
fn layout_ui(app: &AppHandle, width: f64, height: f64,
             is_visible: bool, ratio: f64) -> Result<(), String> {
    let ui_webview = app.get_webview("ui").ok_or("UI webview not found")?;
    
    let ui_width = if is_visible { width * ratio } else { width };
    
    ui_webview.set_position(LogicalPosition::new(0.0, 0.0))
        .map_err(|e| e.to_string())?;
    ui_webview.set_size(LogicalSize::new(ui_width, height))
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Обновляет layout Claude табов (показывает активный, скрывает остальные)
fn layout_claude(app: &AppHandle, width: f64, height: f64,
                 is_visible: bool, active_tab: u8, ratio: f64) -> Result<(), String> {
    if is_visible {
        let claude_x = width * ratio;
        let claude_width = width - claude_x;
        
        for i in 1u8..=3 {
            let label = format!("claude_{}", i);
            if let Some(webview) = app.get_webview(&label) {
                // show() для всех — валидный HWND + IsVisible=TRUE + DOM живой
                let _ = webview.show();
                
                if i == active_tab {
                    webview.set_position(LogicalPosition::new(claude_x, 0.0))
                        .map_err(|e| e.to_string())?;
                    webview.set_size(LogicalSize::new(claude_width, height))
                        .map_err(|e| e.to_string())?;
                } else {
                    // За экран — IsVisible=TRUE, DOM живой
                    webview.set_position(LogicalPosition::new(width * 2.0, 0.0))
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    } else {
        // Панель скрыта — show() + за экран (DOM живой для фоновой генерации)
        for i in 1u8..=3 {
            let label = format!("claude_{}", i);
            if let Some(webview) = app.get_webview(&label) {
                let _ = webview.show();
                webview.set_position(LogicalPosition::new(width * 2.0, 0.0))
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    
    Ok(())
}

/// Обновляет layout overlay-элементов (toolbar, downloads)
fn layout_overlay(app: &AppHandle, width: f64, height: f64,
                  is_visible: bool, ratio: f64) -> Result<(), String> {
    if is_visible {
        let claude_x = width * ratio;
        let claude_width = width - claude_x;
        
        if let Some(toolbar) = app.get_webview("toolbar") {
            let toolbar_x = claude_x + (claude_width - sizes::TOOLBAR_WIDTH) / 2.0;
            let toolbar_y = height - sizes::TOOLBAR_HEIGHT - sizes::TOOLBAR_BOTTOM_OFFSET;
            toolbar.set_position(LogicalPosition::new(toolbar_x, toolbar_y))
                .map_err(|e| e.to_string())?;
            toolbar.set_size(LogicalSize::new(sizes::TOOLBAR_WIDTH, sizes::TOOLBAR_HEIGHT))
                .map_err(|e| e.to_string())?;
            let _ = toolbar.show();
        }
    } else {
        if let Some(toolbar) = app.get_webview("toolbar") {
            let _ = toolbar.hide();
        }
        if let Some(downloads) = app.get_webview("downloads") {
            let _ = downloads.hide();
        }
    }
    
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
    
    layout_ui(app, width, height, is_visible, ratio)?;
    layout_claude(app, width, height, is_visible, active_tab, ratio)?;
    layout_overlay(app, width, height, is_visible, ratio)?;
    
    Ok(())
}

/// Разрешает множественные загрузки с claude.ai в WebView2 профиле.
///
/// Проблема: WebView2 (Edge) показывает диалог "Allow multiple downloads?"
/// при скачивании нескольких файлов. Если пользователь нажмёт "Нет" или
/// пропустит окно — все последующие множественные загрузки блокируются
/// до полной переустановки.
///
/// Решение: прописываем разрешение в Chromium Preferences до запуска WebView2.
/// Файл: {LOCALAPPDATA}/com.ai.prompts.manager/EBWebView/Default/Preferences
///
/// Вызывается из main.rs setup() **до** создания окна.
pub fn allow_claude_multiple_downloads() {
    let Some(local_data) = dirs::data_local_dir() else { return };
    let prefs_path = local_data
        .join("com.ai.prompts.manager")
        .join("EBWebView")
        .join("Default")
        .join("Preferences");
    
    // Читаем существующий файл или начинаем с пустого объекта
    let mut root: serde_json::Value = if prefs_path.exists() {
        match fs::read_to_string(&prefs_path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or(serde_json::json!({})),
            Err(_) => serde_json::json!({}),
        }
    } else {
        serde_json::json!({})
    };
    
    // Проверяем: уже разрешено?
    let already_set = root
        .pointer("/profile/content_settings/exceptions/automatic_downloads/https://claude.ai,*/setting")
        .and_then(|v| v.as_i64())
        == Some(1);
    
    if already_set { return }
    
    // Прописываем разрешение: setting=1 = CONTENT_SETTING_ALLOW
    let profile = root.as_object_mut().unwrap()
        .entry("profile").or_insert(serde_json::json!({}));
    let cs = profile.as_object_mut().unwrap()
        .entry("content_settings").or_insert(serde_json::json!({}));
    let exc = cs.as_object_mut().unwrap()
        .entry("exceptions").or_insert(serde_json::json!({}));
    let ad = exc.as_object_mut().unwrap()
        .entry("automatic_downloads").or_insert(serde_json::json!({}));
    
    ad.as_object_mut().unwrap().insert(
        "https://claude.ai,*".to_string(),
        serde_json::json!({ "setting": 1 })
    );
    
    // Создаём директории и записываем
    if let Some(parent) = prefs_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&prefs_path, serde_json::to_string(&root).unwrap_or_default());
}