#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use tauri::{
    Manager, WebviewBuilder, WebviewUrl, WindowBuilder,
    LogicalPosition, LogicalSize, AppHandle, Emitter,
    window::Color
};
use chrono::Local;
use serde::{Deserialize, Serialize};

// Для eval_in_claude_with_result на Windows
#[cfg(windows)]
use std::sync::{Arc, Mutex};

static CLAUDE_VISIBLE: AtomicBool = AtomicBool::new(false);
static ACTIVE_TAB: AtomicU8 = AtomicU8::new(1);

use std::sync::atomic::AtomicU32;
static PANEL_RATIO: AtomicU32 = AtomicU32::new(50); // 50% по умолчанию

// Константы анимации панели Claude
const ANIMATION_STEPS: i32 = 8;
const ANIMATION_DELAY_MS: u64 = 20;

// Общие JS функции для инжектирования в Claude.ai
const CLAUDE_HELPERS_JS: &str = include_str!("../scripts/claude_helpers.js");

// Структура для записи в лог скачиваний
#[derive(Serialize, Deserialize, Clone)]
struct ArchiveLogEntry {
    timestamp: String,
    tab: u8,
    filename: String,
    claude_url: String,
    #[serde(default)]
    file_path: String,  // Полный путь к скачанному файлу
    #[serde(default)]
    project_name: String,  // Имя проекта из URL
}

// Структура для менеджера загрузок (все файлы)
#[derive(Serialize, Deserialize, Clone)]
struct DownloadEntry {
    timestamp: String,
    filename: String,
    file_path: String,
}

// Получить путь к файлу лога архивов
fn get_archive_log_path() -> Option<std::path::PathBuf> {
    dirs::data_local_dir().map(|d| d.join("com.ai.prompts.manager").join("archive_log.json"))
}

// Получить путь к файлу лога всех загрузок
fn get_downloads_log_path() -> Option<std::path::PathBuf> {
    dirs::data_local_dir().map(|d| d.join("com.ai.prompts.manager").join("downloads_log.json"))
}

// Получить путь к файлу настроек загрузок
fn get_downloads_settings_path() -> Option<std::path::PathBuf> {
    dirs::data_local_dir().map(|d| d.join("com.ai.prompts.manager").join("downloads_settings.json"))
}

// Структура настроек загрузок
#[derive(Serialize, Deserialize, Clone, Default)]
struct DownloadsSettings {
    #[serde(default)]
    custom_path: Option<String>,
}

// Получить кастомный путь загрузок
fn get_custom_downloads_path() -> Option<String> {
    let settings_path = get_downloads_settings_path()?;
    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path).ok()?;
        let settings: DownloadsSettings = serde_json::from_str(&content).ok()?;
        // Проверяем что путь существует
        if let Some(ref path) = settings.custom_path {
            if std::path::Path::new(path).exists() {
                return settings.custom_path;
            }
        }
    }
    None
}

// Генерирует уникальное имя файла, добавляя (1), (2) и т.д. если файл существует
fn get_unique_filepath(dir: &std::path::Path, filename: &str) -> std::path::PathBuf {
    let full_path = dir.join(filename);
    
    if !full_path.exists() {
        return full_path;
    }
    
    // Разбиваем на имя и расширение
    let path = std::path::Path::new(filename);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(filename);
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
        
        // Защита от бесконечного цикла
        if counter > 9999 {
            return full_path;
        }
    }
}

// Сохранить кастомный путь загрузок
fn save_custom_downloads_path(path: Option<String>) -> Result<(), String> {
    let settings_path = get_downloads_settings_path().ok_or("Cannot get settings path")?;
    
    // Создаём директорию если нет
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let settings = DownloadsSettings { custom_path: path };
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&settings_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn get_downloads_path() -> Result<String, String> {
    // Возвращаем кастомный путь или пустую строку (означает "по умолчанию")
    Ok(get_custom_downloads_path().unwrap_or_default())
}

#[tauri::command]
fn set_downloads_path(path: String) -> Result<(), String> {
    if path.is_empty() {
        // Сброс на путь по умолчанию
        save_custom_downloads_path(None)
    } else {
        // Проверяем что путь существует
        if !std::path::Path::new(&path).exists() {
            return Err("Указанная папка не существует".to_string());
        }
        save_custom_downloads_path(Some(path))
    }
}

#[tauri::command]
async fn pick_downloads_folder(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let folder = app.dialog()
        .file()
        .set_title("Выберите папку для загрузок")
        .blocking_pick_folder();
    
    match folder {
        Some(path) => {
            let path_str = path.to_string();
            // Сохраняем выбранный путь
            save_custom_downloads_path(Some(path_str.clone()))?;
            Ok(path_str)
        }
        None => Err("Папка не выбрана".to_string())
    }
}

// Записать в лог скачиваний
fn write_archive_log(entry: ArchiveLogEntry) -> Result<(), String> {
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
    
    // Ограничиваем размер лога (последние 1000 записей)
    if entries.len() > 1000 {
        entries = entries.split_off(entries.len() - 1000);
    }
    
    // Сохраняем
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(&log_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn get_archive_log() -> Result<Vec<ArchiveLogEntry>, String> {
    let log_path = get_archive_log_path().ok_or("Cannot get log path")?;
    
    if !log_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let entries: Vec<ArchiveLogEntry> = serde_json::from_str(&content).unwrap_or_default();
    
    Ok(entries)
}

#[tauri::command]
fn clear_archive_log() -> Result<(), String> {
    let log_path = get_archive_log_path().ok_or("Cannot get log path")?;
    
    if log_path.exists() {
        fs::remove_file(&log_path).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// === Команды для менеджера загрузок (все файлы) ===

#[tauri::command]
fn get_downloads_log() -> Result<Vec<DownloadEntry>, String> {
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

#[tauri::command]
fn add_download_entry(filename: String, file_path: String) -> Result<(), String> {
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
    
    // Ограничиваем размер (последние 500 записей)
    if entries.len() > 500 {
        entries = entries.split_off(entries.len() - 500);
    }
    
    // Сохраняем
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(&log_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn delete_all_downloads() -> Result<u32, String> {
    let log_path = get_downloads_log_path().ok_or("Cannot get log path")?;
    
    if !log_path.exists() {
        return Ok(0);
    }
    
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let entries: Vec<DownloadEntry> = serde_json::from_str(&content).unwrap_or_default();
    
    let mut deleted_count = 0u32;
    
    // Удаляем файлы
    for entry in &entries {
        if !entry.file_path.is_empty() {
            let path = std::path::Path::new(&entry.file_path);
            if path.exists() {
                if fs::remove_file(path).is_ok() {
                    deleted_count += 1;
                }
            }
        }
    }
    
    // Очищаем лог
    fs::remove_file(&log_path).map_err(|e| e.to_string())?;
    
    Ok(deleted_count)
}

#[tauri::command]
fn delete_download(file_path: String) -> Result<bool, String> {
    let log_path = get_downloads_log_path().ok_or("Cannot get log path")?;
    
    if !log_path.exists() {
        return Ok(false);
    }
    
    // Удаляем файл с диска
    let path = std::path::Path::new(&file_path);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    
    // Удаляем запись из лога
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let mut entries: Vec<DownloadEntry> = serde_json::from_str(&content).unwrap_or_default();
    
    let original_len = entries.len();
    entries.retain(|e| e.file_path != file_path);
    
    if entries.len() < original_len {
        let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
        fs::write(&log_path, json).map_err(|e| e.to_string())?;
    }
    
    Ok(true)
}

#[tauri::command]
fn open_file(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
fn add_archive_log_entry(tab: u8, filename: String, claude_url: String, file_path: Option<String>) -> Result<(), String> {
    // Извлекаем имя проекта из URL
    // Формат: https://claude.ai/project/UUID или https://claude.ai/chat/UUID
    let project_name = if claude_url.contains("/project/") {
        // Получаем название проекта - пока просто "Project"
        // В реальности можно было бы парсить HTML страницы
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

// Windows-specific: установка иконки из EXE ресурса
#[cfg(target_os = "windows")]
fn set_window_icon_from_exe(window: &tauri::Window) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageW, WM_SETICON, ICON_BIG, ICON_SMALL,
    };
    use windows_sys::Win32::UI::Shell::ExtractIconW;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    
    unsafe {
        // Получаем путь к текущему EXE
        let Ok(exe_path) = std::env::current_exe() else { return };
        let path_str = exe_path.to_string_lossy();
        let path_wide: Vec<u16> = path_str.encode_utf16().chain(std::iter::once(0)).collect();
        
        // Извлекаем иконку из EXE (индекс 0 = первая иконка)
        let icon = ExtractIconW(GetModuleHandleW(std::ptr::null()), path_wide.as_ptr(), 0);
        
        // Проверяем что иконка валидна (0 и 1 = ошибки)
        if icon.is_null() || icon as usize == 1 {
            return;
        }
        
        // Получаем HWND окна
        if let Ok(hwnd) = window.hwnd() {
            let hwnd_ptr = hwnd.0 as *mut std::ffi::c_void;
            // Устанавливаем иконку для titlebar (ICON_SMALL) и taskbar/alt-tab (ICON_BIG)
            SendMessageW(hwnd_ptr, WM_SETICON, ICON_SMALL as usize, icon as isize);
            SendMessageW(hwnd_ptr, WM_SETICON, ICON_BIG as usize, icon as isize);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn set_window_icon_from_exe(_window: &tauri::Window) {
    // No-op на других платформах
}

#[tauri::command]
fn reset_app_data() -> Result<(), String> {
    if let Some(local_app_data) = dirs::data_local_dir() {
        let app_folder = local_app_data.join("com.ai.prompts.manager");
        if app_folder.exists() {
            // Сохраняем archive_log.json перед удалением
            let archive_log_path = app_folder.join("archive_log.json");
            let archive_log_backup = if archive_log_path.exists() {
                match fs::read(&archive_log_path) {
                    Ok(data) => {
                        
                        Some(data)
                    },
                    Err(_) => {
                        
                        None
                    }
                }
            } else {
                
                None
            };
            
            // Сохраняем downloads_settings.json перед удалением
            let downloads_settings_path = app_folder.join("downloads_settings.json");
            let downloads_settings_backup = if downloads_settings_path.exists() {
                fs::read(&downloads_settings_path).ok()
            } else {
                None
            };
            
            // Удаляем папку
            match fs::remove_dir_all(&app_folder) {
                Ok(_) => {},
                Err(_) => {
                    
                    // Пробуем удалить содержимое по отдельности, кроме защищённых файлов
                    if let Ok(entries) = fs::read_dir(&app_folder) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            // Не удаляем archive_log.json и downloads_settings.json
                            if filename != "archive_log.json" && filename != "downloads_settings.json" {
                                let _ = if path.is_dir() {
                                    fs::remove_dir_all(&path)
                                } else {
                                    fs::remove_file(&path)
                                };
                            }
                        }
                    }
                }
            }
            
            // Восстанавливаем archive_log.json
            if let Some(backup) = archive_log_backup {
                if let Err(_) = fs::create_dir_all(&app_folder) {
                    
                } else if let Err(_) = fs::write(&archive_log_path, &backup) {
                    
                } else {
                    
                }
            }
            
            // Восстанавливаем downloads_settings.json
            if let Some(backup) = downloads_settings_backup {
                let _ = fs::create_dir_all(&app_folder);
                let _ = fs::write(&downloads_settings_path, &backup);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn open_app_data_dir() -> Result<(), String> {
    if let Some(local_app_data) = dirs::data_local_dir() {
        let app_folder = local_app_data.join("com.ai.prompts.manager");
        
        // Создаём папку если не существует
        if !app_folder.exists() {
            fs::create_dir_all(&app_folder).map_err(|e| e.to_string())?;
        }
        
        // Открываем в проводнике
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(&app_folder)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(&app_folder)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(&app_folder)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        
        Ok(())
    } else {
        Err("Could not find app data directory".to_string())
    }
}

fn get_dimensions(app: &AppHandle) -> Result<(f64, f64, f64), String> {
    let window = app.get_window("main").ok_or("Window not found")?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    Ok((size.width as f64 / scale, size.height as f64 / scale, scale))
}

/// Создаёт webview тулбара если он ещё не существует
/// Вызывается ПОСЛЕ создания claude webview чтобы быть поверх
fn ensure_toolbar(app: &AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    
    // Создаём toolbar если его нет
    if app.get_webview("toolbar").is_none() {
        window.add_child(
            WebviewBuilder::new("toolbar", WebviewUrl::App("toolbar.html".into()))
                .transparent(true)
                .background_color(tauri::webview::Color(0, 0, 0, 0)),
            LogicalPosition::new(-500.0, 0.0),
            LogicalSize::new(152.0, 44.0),  // Маленький - только кнопки
        ).map_err(|e| e.to_string())?;
    }
    
    // Создаём downloads popup если его нет
    if app.get_webview("downloads").is_none() {
        window.add_child(
            WebviewBuilder::new("downloads", WebviewUrl::App("downloads.html".into()))
                .transparent(true)
                .background_color(tauri::webview::Color(0, 0, 0, 0)),
            LogicalPosition::new(-500.0, 0.0),  // Скрыт изначально
            LogicalSize::new(320.0, 360.0),
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// Пересоздать toolbar чтобы поднять его z-order (после создания новых Claude webview)
fn recreate_toolbar(app: &AppHandle) -> Result<(), String> {
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
        LogicalSize::new(152.0, 44.0),
    ).map_err(|e| e.to_string())?;
    
    window.add_child(
        WebviewBuilder::new("downloads", WebviewUrl::App("downloads.html".into()))
            .transparent(true)
            .background_color(tauri::webview::Color(0, 0, 0, 0)),
        LogicalPosition::new(-500.0, 0.0),
        LogicalSize::new(320.0, 360.0),
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

fn resize_webviews(app: &AppHandle) -> Result<(), String> {
    let (width, height, _) = get_dimensions(app)?;
    let is_visible = CLAUDE_VISIBLE.load(Ordering::SeqCst);
    let active_tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let ratio = PANEL_RATIO.load(Ordering::SeqCst) as f64 / 100.0;
    
    let ui_webview = app.get_webview("ui").ok_or("UI webview not found")?;
    
    // Toolbar - маленький, только кнопки
    let toolbar_width = 152.0;
    let toolbar_height = 44.0;
    let toolbar_bottom_offset = 10.0;
    
    if is_visible {
        let ui_width = width * ratio;
        let claude_width = width - ui_width;
        let claude_x = ui_width; // Claude начинается сразу после UI
        
        // UI - левая часть
        ui_webview.set_position(LogicalPosition::new(0.0, 0.0)).map_err(|e| e.to_string())?;
        ui_webview.set_size(LogicalSize::new(ui_width, height)).map_err(|e| e.to_string())?;
        
        // Claude tabs - правая часть
        for i in 1u8..=3 {
            let label = format!("claude_{}", i);
            if let Some(webview) = app.get_webview(&label) {
                if i == active_tab {
                    webview.set_position(LogicalPosition::new(claude_x, 0.0)).map_err(|e| e.to_string())?;
                    webview.set_size(LogicalSize::new(claude_width, height)).map_err(|e| e.to_string())?;
                } else {
                    webview.set_position(LogicalPosition::new(width * 2.0, 0.0)).map_err(|e| e.to_string())?;
                }
            }
        }
        
        // Toolbar - внизу по центру области claude
        if let Some(toolbar) = app.get_webview("toolbar") {
            let toolbar_x = claude_x + (claude_width - toolbar_width) / 2.0;
            let toolbar_y = height - toolbar_height - toolbar_bottom_offset;
            toolbar.set_position(LogicalPosition::new(toolbar_x, toolbar_y)).map_err(|e| e.to_string())?;
            toolbar.set_size(LogicalSize::new(toolbar_width, toolbar_height)).map_err(|e| e.to_string())?;
        }
        
        // Downloads popup - позиция не меняется здесь, только в show_downloads/hide_downloads
        // Размер фиксированный, задаётся при создании
    } else {
        // UI - на всю ширину
        ui_webview.set_position(LogicalPosition::new(0.0, 0.0)).map_err(|e| e.to_string())?;
        ui_webview.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
        
        // Все Claude скрываем
        for i in 1u8..=3 {
            let label = format!("claude_{}", i);
            if let Some(webview) = app.get_webview(&label) {
                webview.set_position(LogicalPosition::new(width * 2.0, 0.0)).map_err(|e| e.to_string())?;
            }
        }
        
        // Тулбар тоже скрываем
        if let Some(toolbar) = app.get_webview("toolbar") {
            toolbar.set_position(LogicalPosition::new(width * 2.0, 0.0)).map_err(|e| e.to_string())?;
        }
        
        // Downloads тоже скрываем
        if let Some(downloads) = app.get_webview("downloads") {
            downloads.set_position(LogicalPosition::new(width * 2.0, 0.0)).map_err(|e| e.to_string())?;
        }
    }
    
    Ok(())
}

/// Возвращает JS скрипт для инициализации Claude WebView
/// Выполняется автоматически при каждой загрузке/перезагрузке страницы
fn get_claude_init_script(tab: u8) -> String {
    // Централизованные селекторы - единый источник правды
    // При обновлении Claude.ai править ТОЛЬКО здесь!
    // Используем одинарные кавычки в JS для избежания проблем с экранированием
    let selectors_json = r##"{
        "GENERATION_INDICATOR": [
            "button[aria-label='Stop Response']",
            "button[aria-label='Stop']",
            "[data-testid='stop-button']"
        ],
        "STREAMING_INDICATOR": "[data-is-streaming='true']",
        "THINKING_INDICATOR": "[class*='thinking']",
        "LEFT_NAV": [
            "body > div.root > div > div.shrink-0 > div > nav"
        ],
        "PIN_SIDEBAR_BUTTON": [
            "button[data-testid='pin-sidebar-toggle']"
        ],
        "GHOST_BUTTON_INDICATOR": "svg style"
    }"##;

    format!(r##"
    (function() {{
        // Проверяем, не инициализирован ли уже скрипт
        if (window.__tauriInitialized) return;
        
        // Проверяем, что мы на главной странице Claude, а не в iframe артефакта
        if (window.self !== window.top) return;
        if (!location.hostname.includes("claude.ai")) return;
        
        window.__tauriInitialized = true;
        
        // Номер таба для этого webview
        window.__CLAUDE_TAB__ = {tab};
        
        // Селекторы доступны глобально для helpers
        window.__SEL__ = {selectors};
        
        // Загружаем общие функции
        {helpers}
        
        // СРАЗУ устанавливаем интерсептор загрузки файлов (без задержки!)
        setupUploadInterceptor();
        
        // Ждём готовности DOM
        function onReady(fn) {{
            if (document.readyState === "loading") {{
                document.addEventListener("DOMContentLoaded", fn);
            }} else {{
                setTimeout(fn, 0);
            }}
        }}
        
        onReady(function() {{
            // Запускаем сразу без задержки
            initClaudeWithMonitor();
        }});
        
        function initClaudeWithMonitor() {{
            let lastState = null;
            
            // Мониторинг генерации - используем централизованные селекторы
            function checkGenerating() {{
                const SEL = window.__SEL__;
                let stopBtn = null;
                
                // Поиск по массиву селекторов GENERATION_INDICATOR
                const genSelectors = SEL.GENERATION_INDICATOR;
                for (const sel of genSelectors) {{
                    stopBtn = document.querySelector(sel);
                    if (stopBtn) break;
                }}
                
                const streamingEl = document.querySelector(SEL.STREAMING_INDICATOR);
                const thinkingEl = document.querySelector(SEL.THINKING_INDICATOR);
                const isGenerating = !!(stopBtn || streamingEl || thinkingEl);
                
                if (isGenerating !== lastState) {{
                    lastState = isGenerating;
                    const currentUrl = new URL(window.location.href);
                    currentUrl.hash = isGenerating ? "generating" : "";
                    history.replaceState(null, "", currentUrl.toString());
                }}
            }}
            
            // Инициализация UI
            initClaudeUI();
            
            // Мониторинг генерации
            setInterval(checkGenerating, 300);
            checkGenerating();
        }}
    }})();
    "##, tab = tab, selectors = selectors_json, helpers = CLAUDE_HELPERS_JS)
}

fn ensure_claude_webview(app: &AppHandle, tab: u8, url: Option<&str>) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    if app.get_webview(&label).is_none() {
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
                .initialization_script(&init_script) // Авто-инжект при каждой загрузке
                .disable_drag_drop_handler() // Отключаем перехват Tauri, чтобы сайт сам обрабатывал drag&drop
                .on_page_load(move |_webview, payload| {
                    use tauri::webview::PageLoadEvent;
                    if payload.event() == PageLoadEvent::Finished {
                        // Эмитим событие с номером таба и URL
                        let _ = app_handle_page.emit("claude-page-loaded", serde_json::json!({
                            "tab": tab_for_page,
                            "url": payload.url().to_string()
                        }));
                    }
                })
                .on_download(move |webview, event| {
                    use tauri::webview::DownloadEvent;
                    match event {
                        DownloadEvent::Requested { url, destination } => {
                            let url_str = url.as_str();
                            
                            // Извлекаем имя файла из URL
                            // Формат одиночного: .../download-file?path=%2Fmnt%2F...%2Ffilename.ext
                            // Формат архива: .../download-files?paths=...
                            let filename = if url_str.contains("path=") {
                                // Одиночный файл - извлекаем параметр path и декодируем
                                url_str.split("path=").nth(1)
                                    .and_then(|s| s.split('&').next())
                                    .map(|s| urlencoding::decode(s).unwrap_or_default().to_string())
                                    .and_then(|s| s.split('/').last().map(|s| s.to_string()))
                                    .unwrap_or_else(|| "file".to_string())
                            } else if url_str.contains("download-files") {
                                // Архив из нескольких файлов - Claude генерирует .zip
                                "claude_files.zip".to_string()
                            } else {
                                // Fallback: берём последний сегмент пути
                                url_str.split('/').last()
                                    .and_then(|s| s.split('?').next())
                                    .unwrap_or("file")
                                    .to_string()
                            };
                            
                            // Устанавливаем путь загрузки с уникальным именем
                            if let Some(custom_path) = get_custom_downloads_path() {
                                let dir = std::path::PathBuf::from(&custom_path);
                                *destination = get_unique_filepath(&dir, &filename);
                            } else {
                                // Для пути по умолчанию тоже делаем уникальным
                                if let Some(dir) = destination.parent() {
                                    *destination = get_unique_filepath(dir, &filename);
                                }
                            }
                            
                            // Отправляем событие во все webview с итоговым именем файла
                            let final_filename = destination.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or(&filename)
                                .to_string();
                            let _ = app_handle.emit("download-started", &final_filename);
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
                            
                            // Получаем текущий URL страницы Claude
                            let claude_url = webview.url().map(|u| u.to_string()).unwrap_or_default();
                            
                            if success {
                                // Добавляем в лог загрузок напрямую (только если ещё нет)
                                if let Some(log_path) = get_downloads_log_path() {
                                    let mut entries: Vec<DownloadEntry> = if log_path.exists() {
                                        fs::read_to_string(&log_path)
                                            .ok()
                                            .and_then(|c| serde_json::from_str(&c).ok())
                                            .unwrap_or_default()
                                    } else {
                                        Vec::new()
                                    };
                                    
                                    // Проверяем, нет ли уже такой записи
                                    if !entries.iter().any(|e| e.file_path == file_path) {
                                        entries.push(DownloadEntry {
                                            timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                                            filename: filename.clone(),
                                            file_path: file_path.clone(),
                                        });
                                        
                                        if entries.len() > 500 {
                                            entries = entries.split_off(entries.len() - 500);
                                        }
                                        
                                        if let Ok(json) = serde_json::to_string_pretty(&entries) {
                                            let _ = fs::write(&log_path, json);
                                        }
                                    }
                                }
                                
                                // Отправляем событие во все webview (ui для тоста, downloads для списка)
                                let _ = app_handle.emit("download-finished", serde_json::json!({
                                    "filename": filename,
                                    "tab": tab,
                                    "url": claude_url,
                                    "file_path": file_path
                                }));
                            } else {
                                let _ = app_handle.emit("download-failed", &filename);
                            }
                        }
                        _ => {}
                    }
                    true // Разрешаем загрузку
                }),
            LogicalPosition::new(width * 2.0, 0.0), // Создаём за экраном
            LogicalSize::new(claude_width, height), // Правильная ширина сразу
        ).map_err(|e| e.to_string())?;
        
        // После создания нового Claude webview - пересоздаём toolbar чтобы он был поверх
        recreate_toolbar(app)?;
    }
    Ok(())
}

// Предзагрузка Claude webview в фоне (без показа)
#[tauri::command]
async fn preload_claude(app: AppHandle) -> Result<(), String> {
    // Создаём webview для первого таба если не существует
    ensure_claude_webview(&app, 1, None)?;
    Ok(())
}

#[tauri::command]
async fn toggle_claude(app: AppHandle) -> Result<bool, String> {
    let is_visible = CLAUDE_VISIBLE.load(Ordering::SeqCst);
    let new_state = !is_visible;
    
    if new_state {
        // Создаём первый таб если не существует
        ensure_claude_webview(&app, 1, None)?;
        // Создаём тулбар ПОСЛЕ claude чтобы он был поверх
        ensure_toolbar(&app)?;
    }
    
    // Анимация: плавное изменение размера за несколько шагов
    let ratio = PANEL_RATIO.load(Ordering::SeqCst) as f64 / 100.0;
    
    for i in 1..=ANIMATION_STEPS {
        let progress = i as f64 / ANIMATION_STEPS as f64;
        let eased = 1.0 - (1.0 - progress).powi(2); // ease-out quad
        
        let current_ratio = if new_state {
            // Открываем: от 100% до target ratio
            1.0 - (1.0 - ratio) * eased
        } else {
            // Закрываем: от target ratio до 100%
            ratio + (1.0 - ratio) * eased
        };
        
        // Временно устанавливаем ratio для анимации
        PANEL_RATIO.store((current_ratio * 100.0) as u32, Ordering::SeqCst);
        
        // Показываем Claude во время анимации открытия
        if new_state && i == 1 {
            CLAUDE_VISIBLE.store(true, Ordering::SeqCst);
        }
        
        resize_webviews(&app)?;
        std::thread::sleep(std::time::Duration::from_millis(ANIMATION_DELAY_MS));
    }
    
    // Финальное состояние
    PANEL_RATIO.store((ratio * 100.0) as u32, Ordering::SeqCst);
    CLAUDE_VISIBLE.store(new_state, Ordering::SeqCst);
    resize_webviews(&app)?;
    
    Ok(new_state)
}

#[tauri::command]
fn get_active_tab() -> u8 {
    ACTIVE_TAB.load(Ordering::SeqCst)
}

#[tauri::command]
async fn switch_claude_tab(app: AppHandle, tab: u8) -> Result<(), String> {
    if tab < 1 || tab > 3 {
        return Err("Invalid tab".to_string());
    }
    
    // Создаём тулбар если не существует (в начале, до всего)
    ensure_toolbar(&app)?;
    
    // Всегда создаём таб 1 если не существует (он базовый)
    ensure_claude_webview(&app, 1, None)?;
    
    // Создаём запрошенный таб если не существует
    if tab != 1 {
        ensure_claude_webview(&app, tab, None)?;
    }
    
    // Убеждаемся что Claude видим
    CLAUDE_VISIBLE.store(true, Ordering::SeqCst);
    ACTIVE_TAB.store(tab, Ordering::SeqCst);
    resize_webviews(&app)?;
    
    Ok(())
}

#[tauri::command]
async fn switch_claude_tab_with_url(app: AppHandle, tab: u8, url: String) -> Result<(), String> {
    if tab < 1 || tab > 3 {
        return Err("Invalid tab".to_string());
    }
    
    // Создаём тулбар если не существует
    ensure_toolbar(&app)?;
    
    // Всегда создаём таб 1 если не существует (он базовый)
    ensure_claude_webview(&app, 1, None)?;
    
    let label = format!("claude_{}", tab);
    
    // Если webview уже существует - навигируем на URL
    if let Some(webview) = app.get_webview(&label) {
        let url_parsed = url.parse()
            .map_err(|e| format!("Invalid URL '{}': {}", url, e))?;
        webview.navigate(url_parsed).map_err(|e| e.to_string())?;
    } else if tab != 1 {
        // Создаём новый webview с URL (кроме таба 1, он уже создан выше)
        ensure_claude_webview(&app, tab, Some(&url))?;
    }
    
    // Убеждаемся что Claude видим
    CLAUDE_VISIBLE.store(true, Ordering::SeqCst);
    ACTIVE_TAB.store(tab, Ordering::SeqCst);
    resize_webviews(&app)?;
    
    Ok(())
}

#[tauri::command]
async fn get_tab_url(app: AppHandle, tab: u8) -> Result<String, String> {
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        if let Ok(url) = webview.url() {
            let mut url_clean = url.clone();
            url_clean.set_fragment(None);
            return Ok(url_clean.to_string());
        }
    }
    Ok("https://claude.ai/new".to_string())
}

#[tauri::command]
async fn get_claude_state(app: AppHandle) -> Result<(bool, u8, Vec<u8>), String> {
    let is_visible = CLAUDE_VISIBLE.load(Ordering::SeqCst);
    let active_tab = ACTIVE_TAB.load(Ordering::SeqCst);
    
    // Какие табы существуют
    let mut existing_tabs = Vec::new();
    for i in 1u8..=3 {
        let label = format!("claude_{}", i);
        if app.get_webview(&label).is_some() {
            existing_tabs.push(i);
        }
    }
    
    Ok((is_visible, active_tab, existing_tabs))
}

#[tauri::command]
async fn new_chat_in_tab(app: AppHandle, tab: u8) -> Result<(), String> {
    const CLAUDE_NEW_URL: &str = "https://claude.ai/new";
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        let url = CLAUDE_NEW_URL.parse()
            .map_err(|e| format!("Invalid URL: {}", e))?;
        webview.navigate(url).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn reload_claude_tab(app: AppHandle, tab: u8) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        webview.eval("location.reload()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn navigate_claude_tab(app: AppHandle, tab: u8, url: String) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        let parsed_url = url.parse()
            .map_err(|e| format!("Invalid URL '{}': {}", url, e))?;
        webview.navigate(parsed_url).map_err(|e| e.to_string())?;
        
        // Эмитим событие о начале навигации (on_page_load сработает при загрузке)
        // source: "navigate" — для SPA навигации, "page_load" — реальная загрузка
        let _ = app.emit("claude-navigation-started", serde_json::json!({
            "tab": tab,
            "url": url
        }));
    }
    Ok(())
}

#[tauri::command]
async fn notify_url_change(app: AppHandle, tab: u8, url: String) -> Result<(), String> {
    // Эмитим событие о изменении URL (для SPA навигации внутри Claude)
    let _ = app.emit("claude-url-changed", serde_json::json!({
        "tab": tab,
        "url": url
    }));
    Ok(())
}

#[tauri::command]
async fn eval_in_claude(app: AppHandle, tab: u8, script: String) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Выполнить скрипт в Claude webview и вернуть результат через CDP (только Windows)
/// Использует Runtime.evaluate с awaitPromise для поддержки async скриптов
/// 
/// # Arguments
/// * `tab` - номер таба (1-3)
/// * `script` - JavaScript код для выполнения
/// * `timeout_secs` - таймаут в секундах (опционально, по умолчанию 10)
///   - Для быстрых DOM операций: 5 сек
///   - Для HTTP запросов к API: 30 сек
#[tauri::command]
async fn eval_in_claude_with_result(app: AppHandle, tab: u8, script: String, timeout_secs: Option<u64>) -> Result<String, String> {
    let label = format!("claude_{}", tab);
    let timeout = timeout_secs.unwrap_or(10); // Default 10 секунд
    
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} not found", label))?;
    
    #[cfg(windows)]
    {
        use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
        
        let result: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let result_clone = Arc::clone(&result);
        let done: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
        let done_clone = Arc::clone(&done);
        
        // Экранируем скрипт для вставки в JSON
        let escaped_script = script
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t");
        
        // Формируем параметры CDP Runtime.evaluate
        // awaitPromise: true - ждать resolve Promise
        // returnByValue: true - вернуть значение, а не reference
        let cdp_params = format!(
            r#"{{"expression":"{}","awaitPromise":true,"returnByValue":true}}"#,
            escaped_script
        );
        
        // Используем Arc для строк чтобы они жили до завершения callback
        let method_wide: Arc<Vec<u16>> = Arc::new(
            "Runtime.evaluate"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect()
        );
        
        let params_wide: Arc<Vec<u16>> = Arc::new(
            cdp_params
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect()
        );
        
        // Клонируем Arc для передачи в closure (prevent drop until callback completes)
        let _method_wide_ref = Arc::clone(&method_wide);
        let _params_wide_ref = Arc::clone(&params_wide);
        
        let _ = webview.with_webview(move |wv| {
            // Держим ссылки на Arc внутри closure
            let _keep_method = &_method_wide_ref;
            let _keep_params = &_params_wide_ref;
            
            unsafe {
                let core: ICoreWebView2 = wv.controller().CoreWebView2().unwrap();
                
                // Callback обработчик CDP
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |hr: windows::core::Result<()>, json_result: String| {
                    if hr.is_ok() && !json_result.is_empty() {
                        // json_result содержит полный CDP response: {"result":{"type":"...","value":...}}
                        // Нам нужно извлечь value
                        
                        // Парсим CDP response и извлекаем result.value
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_result) {
                            if let Some(value) = parsed.get("result").and_then(|r| r.get("value")) {
                                let mut r = result_clone.lock().unwrap();
                                *r = Some(value.to_string());
                            } else if let Some(err) = parsed.get("exceptionDetails") {
                                // Ошибка выполнения скрипта
                                let mut r = result_clone.lock().unwrap();
                                *r = Some(format!("{{\"error\":{}}}", err));
                            } else {
                                // Возвращаем весь результат если структура неожиданная
                                let mut r = result_clone.lock().unwrap();
                                *r = Some(json_result.clone());
                            }
                        } else {
                            let mut r = result_clone.lock().unwrap();
                            *r = Some(json_result.clone());
                        }
                    }
                    let mut d = done_clone.lock().unwrap();
                    *d = true;
                    Ok(())
                }));
                
                let method_pcwstr = windows_core::PCWSTR::from_raw(method_wide.as_ptr());
                let params_pcwstr = windows_core::PCWSTR::from_raw(params_wide.as_ptr());
                
                let _ = core.CallDevToolsProtocolMethod(method_pcwstr, params_pcwstr, &handler);
            }
        });
        
        // Ждём завершения с настраиваемым таймаутом
        let start = std::time::Instant::now();
        loop {
            {
                let d = done.lock().unwrap();
                if *d {
                    break;
                }
            }
            if start.elapsed().as_secs() > timeout {
                return Err(format!("Timeout after {} seconds waiting for script result", timeout));
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        
        let r = result.lock().unwrap();
        Ok(r.clone().unwrap_or_else(|| "null".to_string()))
    }
    
    #[cfg(not(windows))]
    {
        // На других платформах пока не поддерживается
        let _ = timeout; // Suppress unused warning
        Err("eval_in_claude_with_result is only supported on Windows".to_string())
    }
}

#[tauri::command]
async fn close_claude_tab(app: AppHandle, tab: u8) -> Result<u8, String> {
    // Таб 1 нельзя закрыть - он базовый
    if tab == 1 {
        return Err("Cannot close tab 1".to_string());
    }
    
    let label = format!("claude_{}", tab);
    
    // Закрываем webview
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    
    // Определяем на какой таб переключиться
    let current_active = ACTIVE_TAB.load(Ordering::SeqCst);
    let new_active = if current_active == tab {
        // Если закрыли активный - переключаемся на таб 1 (он всегда есть)
        1
    } else {
        current_active
    };
    
    ACTIVE_TAB.store(new_active, Ordering::SeqCst);
    resize_webviews(&app)?;
    
    Ok(new_active)
}

#[tauri::command]
async fn reset_claude_state(app: AppHandle) -> Result<(), String> {
    // Закрываем все Claude webviews
    for i in 1u8..=3 {
        let label = format!("claude_{}", i);
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.close();
        }
    }
    
    // Закрываем toolbar и downloads
    if let Some(toolbar) = app.get_webview("toolbar") {
        let _ = toolbar.close();
    }
    if let Some(downloads) = app.get_webview("downloads") {
        let _ = downloads.close();
    }
    
    // Сбрасываем состояние
    CLAUDE_VISIBLE.store(false, Ordering::SeqCst);
    ACTIVE_TAB.store(1, Ordering::SeqCst);
    PANEL_RATIO.store(50, Ordering::SeqCst);
    
    // Ресайзим (UI на всю ширину)
    resize_webviews(&app)?;
    
    Ok(())
}

#[tauri::command]
async fn set_panel_ratio(app: AppHandle, ratio: u32) -> Result<(), String> {
    let clamped = ratio.clamp(35, 65); // Минимум 35%, максимум 65%
    PANEL_RATIO.store(clamped, Ordering::SeqCst);
    resize_webviews(&app)?;
    Ok(())
}

#[tauri::command]
async fn get_panel_ratio() -> u32 {
    PANEL_RATIO.load(Ordering::SeqCst)
}

#[tauri::command]
async fn get_window_width(app: AppHandle) -> Result<f64, String> {
    let (width, _, _) = get_dimensions(&app)?;
    Ok(width)
}

#[tauri::command]
async fn set_window_background(app: AppHandle, dark: bool) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Window not found")?;
    // Цвета фона UI темы
    let color = if dark {
        Color(30, 30, 30, 255)  // #1e1e1e - тёмная тема UI
    } else {
        Color(243, 244, 246, 255)  // #f3f4f6 - светлая тема UI
    };
    window.set_background_color(Some(color)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn insert_text_to_claude(app: AppHandle, tab: u8, text: String, auto_send: bool) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        // Экранируем текст для JS
        let escaped_text = text
            .replace("\\", "\\\\")
            .replace("`", "\\`")
            .replace("$", "\\$");
        
        let auto_send_js = if auto_send { "true" } else { "false" };
        
        let script = format!(r#"
            (function() {{
                const AUTO_SEND = {};
                const text = `{}`;
                
                // Ищем ProseMirror элемент
                const pmElement = document.querySelector('.ProseMirror');
                
                if (!pmElement) {{
                    return false;
                }}
                
                const editor = pmElement.editor;
                
                if (editor && editor.commands && typeof editor.commands.insertContent === 'function') {{
                    // Tiptap способ - вставляем как plain text чтобы HTML-теги не парсились
                    editor.commands.focus();
                    editor.commands.clearContent();
                    editor.commands.insertContent({{ type: 'text', text: text }});
                    
                }} else if (editor && editor.editorView) {{
                    // Прямой ProseMirror способ
                    const view = editor.editorView;
                    const tr = view.state.tr;
                    tr.delete(0, view.state.doc.content.size);
                    tr.insertText(text, 0);
                    view.dispatch(tr);
                    
                }} else {{
                    // Fallback через innerHTML
                    pmElement.focus();
                    pmElement.innerHTML = '';
                    const p = document.createElement('p');
                    p.textContent = text;
                    pmElement.appendChild(p);
                    pmElement.dispatchEvent(new Event('input', {{ bubbles: true }}));
                }}
                
                // Auto-send если включено
                if (AUTO_SEND) {{
                    let attempts = 0;
                    const maxAttempts = 50;
                    let sent = false;
                    
                    // Запоминаем начальное содержимое редактора для проверки что отправка прошла
                    const initialContent = pmElement.textContent?.trim() || '';
                    
                    const tryToSend = () => {{
                        // Если уже отправили — выходим
                        if (sent) return;
                        
                        attempts++;
                        
                        // Проверяем что сообщение ещё не отправлено:
                        // 1) Редактор пустой — значит сообщение ушло
                        // 2) Появился индикатор генерации
                        const currentContent = pmElement.textContent?.trim() || '';
                        const isGenerating = document.querySelector('button[aria-label="Stop Response"]') ||
                                           document.querySelector('button[aria-label="Stop"]') ||
                                           document.querySelector('[data-is-streaming="true"]');
                        
                        if ((initialContent && !currentContent) || isGenerating) {{
                            // Сообщение уже отправлено
                            sent = true;
                            return;
                        }}
                        
                        // Ищем кнопку отправки по разным селекторам
                        let sendBtn = document.querySelector('button[aria-label="Send message"]') ||
                                     document.querySelector('button[aria-label="Send Message"]') ||
                                     document.querySelector('button[aria-label="Send"]') ||
                                     document.querySelector('[data-testid="send-button"]');
                        
                        // Fallback: ищем кнопку с SVG внутри fieldset рядом с редактором
                        if (!sendBtn) {{
                            const fieldset = pmElement.closest('fieldset') || pmElement.closest('form') || pmElement.parentElement?.parentElement;
                            if (fieldset) {{
                                const btns = fieldset.querySelectorAll('button');
                                for (const btn of btns) {{
                                    // Кнопка должна иметь SVG и не быть disabled
                                    // Также проверяем что это не кнопка прикрепления файла
                                    const svg = btn.querySelector('svg');
                                    const isAttachBtn = btn.getAttribute('aria-label')?.toLowerCase().includes('attach');
                                    if (svg && !btn.disabled && !isAttachBtn) {{
                                        // Проверяем что кнопка справа (кнопка отправки обычно справа)
                                        const rect = btn.getBoundingClientRect();
                                        const pmRect = pmElement.getBoundingClientRect();
                                        if (rect.left > pmRect.left + pmRect.width / 2) {{
                                            sendBtn = btn;
                                        }}
                                    }}
                                }}
                            }}
                        }}
                        
                        // Проверяем что кнопка найдена и не disabled
                        if (sendBtn && !sendBtn.disabled) {{
                            sendBtn.click();
                            sent = true;  // Помечаем что клик сделан
                            
                            // Проверяем через 500мс что отправка действительно прошла
                            setTimeout(() => {{
                                // Если был текст и он остался — возможно клик не сработал
                                const stillHasContent = pmElement.textContent?.trim();
                                if (initialContent && stillHasContent && stillHasContent === initialContent) {{
                                    // Контент остался — возможно клик не сработал, сбрасываем флаг
                                    sent = false;
                                }}
                                // Если текста не было изначально — проверяем по isGenerating
                                // (эта проверка уже есть в начале tryToSend)
                            }}, 500);
                            
                        }} else if (attempts < maxAttempts) {{
                            // Увеличиваем интервал после нескольких попыток (вложения могут грузиться)
                            const delay = attempts < 10 ? 200 : 300;
                            setTimeout(tryToSend, delay);
                        }}
                    }};
                    
                    // Первая попытка через 200мс чтобы UI успел обновиться
                    setTimeout(tryToSend, 200);
                }}
                
                return true;
            }})();
        "#, auto_send_js, escaped_text);
        
        webview.eval(&script).map_err(|e| e.to_string())?;
    } else {
        return Err("Claude tab not found".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn inject_generation_monitor(app: AppHandle, tab: u8) -> Result<(), String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        let script = format!(r#"
            (function() {{
                if (window.__generationMonitorActive) return;
                window.__generationMonitorActive = true;
                
                // Загружаем общие функции
                {helpers}
                
                let lastState = null;
                
                // Инициализация UI
                initClaudeUI();
                
                // Мониторинг генерации
                function checkGenerating() {{
                    const stopBtn = document.querySelector('button[aria-label="Stop Response"]') ||
                                   document.querySelector('button[aria-label="Stop"]') ||
                                   document.querySelector('[data-testid="stop-button"]');
                    
                    const streamingEl = document.querySelector('[data-is-streaming="true"]');
                    const thinkingEl = document.querySelector('[class*="thinking"]');
                    
                    const isGenerating = !!(stopBtn || streamingEl || thinkingEl);
                    
                    if (isGenerating !== lastState) {{
                        lastState = isGenerating;
                        
                        const currentUrl = new URL(window.location.href);
                        if (isGenerating) {{
                            currentUrl.hash = 'generating';
                        }} else {{
                            currentUrl.hash = '';
                        }}
                        history.replaceState(null, '', currentUrl.toString());
                    }}
                }}
                
                setInterval(checkGenerating, 300);
                checkGenerating();
            }})()
        "#, helpers = CLAUDE_HELPERS_JS);
        
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn check_generation_status(app: AppHandle, tab: u8) -> Result<bool, String> {
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        if let Ok(url) = webview.url() {
            let url_str = url.to_string();
            return Ok(url_str.contains("#generating"));
        }
    }
    Ok(false)
}

#[derive(serde::Serialize)]
struct FileData {
    name: String,
    mime_type: String,
    data: String, // base64
}

/// Определяет MIME-тип по расширению файла
fn get_mime_type(extension: Option<&str>) -> &'static str {
    match extension {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("pdf") => "application/pdf",
        Some("txt") => "text/plain",
        Some("md") => "text/markdown",
        Some("html") | Some("htm") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("py") => "text/x-python",
        Some("json") => "application/json",
        Some("xml") => "application/xml",
        Some("zip") => "application/zip",
        Some("doc") => "application/msword",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xls") => "application/vnd.ms-excel",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("csv") => "text/csv",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
async fn read_file_for_attachment(path: String) -> Result<FileData, String> {
    use base64::Engine;
    
    let path = std::path::Path::new(&path);
    
    // Проверяем существование файла
    if !path.exists() {
        return Err(format!("Файл не найден: {}", path.display()));
    }
    
    // Читаем файл
    let data = fs::read(path).map_err(|e| format!("Ошибка чтения файла: {}", e))?;
    
    // Определяем MIME-тип по расширению
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

#[tauri::command]
async fn write_temp_file(app: AppHandle, filename: String, content: String) -> Result<String, String> {
    // Получаем директорию для временных файлов
    let temp_dir = app.path().temp_dir()
        .map_err(|e| format!("Cannot get temp dir: {}", e))?;
    
    // Создаём поддиректорию для наших скриптов
    let scripts_dir = temp_dir.join("ai-prompts-manager-scripts");
    fs::create_dir_all(&scripts_dir)
        .map_err(|e| format!("Cannot create scripts dir: {}", e))?;
    
    // Полный путь к файлу
    let file_path = scripts_dir.join(&filename);
    
    // Записываем содержимое
    fs::write(&file_path, &content)
        .map_err(|e| format!("Cannot write file: {}", e))?;
    
    // Возвращаем путь как строку
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn attach_file_to_claude(app: AppHandle, tab: u8, path: String) -> Result<(), String> {
    use base64::Engine;
    
    let file_path = std::path::Path::new(&path);
    
    // Проверяем существование файла
    if !file_path.exists() {
        return Err(format!("Файл не найден: {}", file_path.display()));
    }
    
    // Читаем файл
    let data = fs::read(file_path).map_err(|e| format!("Ошибка чтения файла: {}", e))?;
    
    // Определяем MIME-тип по расширению
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
                // Ждём готовности страницы — появления input[type="file"]
                const waitForInput = async (timeout = 15000) => {{
                    const start = Date.now();
                    while (Date.now() - start < timeout) {{
                        const input = document.querySelector('input[type="file"]');
                        if (input) return input;
                        await new Promise(r => setTimeout(r, 200));
                    }}
                    return null;
                }};
                
                let fileInput = await waitForInput();
                
                if (!fileInput) {{
                    
                    return;
                }}
                
                // Декодируем base64
                const base64 = "{}";
                const binaryString = atob(base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {{
                    bytes[i] = binaryString.charCodeAt(i);
                }}
                
                // Создаём File объект
                const blob = new Blob([bytes], {{ type: "{}" }});
                const file = new File([blob], "{}", {{ type: "{}" }});
                
                // Создаём DataTransfer и устанавливаем файлы
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                
                // Триггерим событие change
                fileInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
                
            }} catch (e) {{
                
            }}
        }})();
    "#, base64_data, mime_type, file_name, mime_type);
    
    // Инжектим в webview
    let label = format!("claude_{}", tab);
    if let Some(webview) = app.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())?;
    } else {
        return Err(format!("Webview {} not found", label));
    }
    
    Ok(())
}

// === Команды для тулбара навигации ===

#[tauri::command]
fn toolbar_back(app: AppHandle) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        webview.eval("history.back()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toolbar_forward(app: AppHandle) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        webview.eval("history.forward()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toolbar_reload(app: AppHandle) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        webview.eval("location.reload()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Показывает downloads popup
#[tauri::command]
fn show_downloads(app: AppHandle) -> Result<(), String> {
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
        let downloads_width = 320.0;
        let downloads_height = 360.0;
        let toolbar_height = 44.0;
        let toolbar_bottom_offset = 10.0;
        let margin = 8.0;  // Отступ между toolbar и downloads
        
        // Центрируем по горизонтали в области Claude
        let downloads_x = claude_x + (claude_width - downloads_width) / 2.0;
        // Позиционируем над toolbar
        let downloads_y = height - toolbar_height - toolbar_bottom_offset - margin - downloads_height;
        
        downloads.set_position(LogicalPosition::new(downloads_x, downloads_y)).map_err(|e| e.to_string())?;
        
        // Обновляем список при каждом показе
        let _ = app.emit("refresh-downloads", ());
    }
    Ok(())
}

/// Скрывает downloads popup
#[tauri::command]
fn hide_downloads(app: AppHandle) -> Result<(), String> {
    if let Some(downloads) = app.get_webview("downloads") {
        downloads.set_position(LogicalPosition::new(-500.0, 0.0)).map_err(|e| e.to_string())?;
    }
    // Уведомляем toolbar что popup закрылся
    let _ = app.emit("downloads-closed", ());
    Ok(())
}

/// Пробрасывает scroll из toolbar в активный Claude webview
#[tauri::command]
fn forward_scroll(app: AppHandle, delta_y: f64) -> Result<(), String> {
    let tab = ACTIVE_TAB.load(Ordering::SeqCst);
    let label = format!("claude_{}", tab);
    
    if let Some(webview) = app.get_webview(&label) {
        let script = format!(r#"
            (function() {{
                const delta = {delta};
                
                // Основной scrollable контейнер Claude.ai
                const el = document.querySelector('.overflow-y-scroll.flex-1') 
                        || document.querySelector('[class*="overflow-y-scroll"][class*="flex-1"]');
                
                if (el && el.scrollHeight > el.clientHeight) {{
                    el.scrollTop += delta;
                    return;
                }}
                
                // Fallback - перебор всех элементов
                const all = document.querySelectorAll('*');
                for (const item of all) {{
                    const style = getComputedStyle(item);
                    const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll') 
                                         && item.scrollHeight > item.clientHeight
                                         && style.pointerEvents !== 'none';
                    if (isScrollable) {{
                        item.scrollTop += delta;
                        return;
                    }}
                }}
                
                window.scrollBy(0, delta);
            }})();
        "#, delta = delta_y);
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Пробрасывает клик из toolbar в активный Claude webview
#[tauri::command]
fn forward_click(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
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
    
    // Позиция toolbar
    let toolbar_width = 320.0;
    let toolbar_height = 420.0;
    let toolbar_x = claude_x + (claude_width - toolbar_width) / 2.0;
    let toolbar_y = height - toolbar_height - 10.0;
    
    // Координаты клика относительно Claude webview
    // Claude webview начинается с claude_x, toolbar начинается с toolbar_x
    // Клик в toolbar (x, y) -> клик в Claude (toolbar_x - claude_x + x, toolbar_y + y)
    let claude_click_x = toolbar_x - claude_x + x;
    let claude_click_y = toolbar_y + y;
    
    if let Some(webview) = app.get_webview(&label) {
        let script = format!(r#"
            (function() {{
                const el = document.elementFromPoint({x}, {y});
                if (el) {{
                    el.click();
                }}
            }})();
        "#, x = claude_click_x, y = claude_click_y);
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            reset_app_data,
            open_app_data_dir,
            reset_claude_state,
            preload_claude,
            toggle_claude,
            switch_claude_tab,
            switch_claude_tab_with_url,
            get_active_tab,
            get_tab_url,
            close_claude_tab,
            get_claude_state,
            new_chat_in_tab,
            reload_claude_tab,
            navigate_claude_tab,
            notify_url_change,
            eval_in_claude,
            eval_in_claude_with_result,
            set_panel_ratio,
            get_panel_ratio,
            get_window_width,
            set_window_background,
            insert_text_to_claude,
            inject_generation_monitor,
            check_generation_status,
            read_file_for_attachment,
            write_temp_file,
            attach_file_to_claude,
            get_archive_log,
            clear_archive_log,
            delete_all_downloads,
            delete_download,
            open_file,
            add_archive_log_entry,
            get_downloads_log,
            add_download_entry,
            get_downloads_path,
            set_downloads_path,
            pick_downloads_folder,
            toolbar_back,
            toolbar_forward,
            toolbar_reload,
            show_downloads,
            hide_downloads,
            forward_scroll,
            forward_click
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
            set_window_icon_from_exe(&window);
            
            window.add_child(
                WebviewBuilder::new("ui", WebviewUrl::App("index.html".into())),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(1000.0, 600.0),
            )?;
            
            // Тулбар создаётся лениво в ensure_toolbar() при первом показе claude
            
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(100));
                let _ = resize_webviews(&app_handle);
                
                // Загружаем первый чат Claude в фоне (невидимый)
                // Это ускоряет первую отправку промпта
                std::thread::sleep(std::time::Duration::from_millis(500));
                let _ = ensure_claude_webview(&app_handle, 1, None);
            });
            
            let app_handle2 = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Resized(_) = event {
                    let _ = resize_webviews(&app_handle2);
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
