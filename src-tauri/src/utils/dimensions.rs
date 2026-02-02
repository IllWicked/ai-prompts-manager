//! Работа с размерами и позициями окна
//!
//! Утилиты для получения размеров окна с учётом масштабирования (DPI)

use tauri::{AppHandle, Manager};

/// Получает размеры главного окна в логических пикселях
///
/// Учитывает масштабирование экрана (DPI scaling) и возвращает
/// размеры, готовые для использования в позиционировании webview.
///
/// # Arguments
/// * `app` - handle приложения Tauri
///
/// # Returns
/// Кортеж `(width, height, scale)`:
/// * `width` - ширина окна в логических пикселях
/// * `height` - высота окна в логических пикселях  
/// * `scale` - коэффициент масштабирования (1.0 = 100%, 1.5 = 150%, etc.)
///
/// # Errors
/// Возвращает ошибку если окно "main" не найдено или не удалось получить размер
pub fn get_dimensions(app: &AppHandle) -> Result<(f64, f64, f64), String> {
    let window = app.get_window("main").ok_or("Window not found")?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    
    Ok((
        size.width as f64 / scale,
        size.height as f64 / scale,
        scale
    ))
}

/// Константы для анимации панели Claude
pub mod animation {
    /// Количество шагов анимации открытия/закрытия панели
    pub const ANIMATION_STEPS: i32 = 8;
    
    /// Задержка между шагами анимации в миллисекундах
    pub const ANIMATION_DELAY_MS: u64 = 20;
}

/// Константы для размеров UI элементов
pub mod sizes {
    /// Ширина тулбара в пикселях
    pub const TOOLBAR_WIDTH: f64 = 152.0;
    
    /// Высота тулбара в пикселях
    pub const TOOLBAR_HEIGHT: f64 = 44.0;
    
    /// Отступ тулбара от нижнего края в пикселях
    pub const TOOLBAR_BOTTOM_OFFSET: f64 = 10.0;
    
    /// Ширина popup загрузок в пикселях
    pub const DOWNLOADS_WIDTH: f64 = 320.0;
    
    /// Высота popup загрузок в пикселях
    pub const DOWNLOADS_HEIGHT: f64 = 360.0;
    
    /// Отступ между toolbar и downloads popup
    pub const DOWNLOADS_MARGIN: f64 = 8.0;
}

/// Константы для ограничений
pub mod limits {
    /// Максимальный размер файла для аттачмента (50 MB)
    pub const MAX_ATTACHMENT_SIZE: u64 = 50 * 1024 * 1024;
    
    /// Максимальное количество записей в логе архивов
    pub const MAX_ARCHIVE_LOG_ENTRIES: usize = 1000;
    
    /// Максимальное количество записей в логе загрузок
    pub const MAX_DOWNLOADS_LOG_ENTRIES: usize = 500;
}
