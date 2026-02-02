//! Платформо-зависимые функции
//!
//! Этот модуль содержит функции, реализация которых различается
//! в зависимости от операционной системы (Windows, macOS, Linux)

use std::process::Command;

/// Устанавливает иконку окна из EXE ресурса (только Windows)
///
/// На Windows извлекает иконку из текущего EXE файла и устанавливает
/// её для окна (titlebar и taskbar). Это workaround для бага Tauri.
///
/// На других платформах функция ничего не делает.
#[cfg(target_os = "windows")]
pub fn set_window_icon_from_exe(window: &tauri::Window) {
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
pub fn set_window_icon_from_exe(_window: &tauri::Window) {
    // No-op на других платформах
}

/// Открывает файл в системном приложении по умолчанию
///
/// Использует:
/// - Windows: `explorer`
/// - macOS: `open`
/// - Linux: `xdg-open`
///
/// # Arguments
/// * `file_path` - путь к файлу для открытия
///
/// # Returns
/// * `Ok(())` - файл успешно открыт
/// * `Err(String)` - ошибка (файл не найден, не удалось запустить команду)
pub fn open_file_in_system(file_path: &str) -> Result<(), String> {
    let path = std::path::Path::new(file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }
    
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Открывает директорию в файловом менеджере
///
/// Использует те же команды, что и `open_file_in_system`,
/// но предназначена для открытия папок.
///
/// # Arguments
/// * `dir_path` - путь к директории
///
/// # Returns
/// * `Ok(())` - директория успешно открыта
/// * `Err(String)` - ошибка
pub fn open_directory_in_system(dir_path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(dir_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(dir_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(dir_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}
