//! Определение MIME-типов по расширению файла
//!
//! Используется для корректной отправки файлов в Claude

/// Определяет MIME-тип по расширению файла
///
/// # Arguments
/// * `extension` - расширение файла без точки (например, "png", "pdf")
///
/// # Returns
/// MIME-тип как статическая строка. Для неизвестных расширений возвращает "application/octet-stream"
///
/// # Example
/// ```
/// use ai_prompts_manager::utils::mime::get_mime_type;
/// assert_eq!(get_mime_type(Some("png")), "image/png");
/// assert_eq!(get_mime_type(Some("unknown")), "application/octet-stream");
/// ```
pub fn get_mime_type(extension: Option<&str>) -> &'static str {
    match extension {
        // Изображения
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        
        // Документы
        Some("pdf") => "application/pdf",
        Some("doc") => "application/msword",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xls") => "application/vnd.ms-excel",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        
        // Текстовые
        Some("txt") => "text/plain",
        Some("md") => "text/markdown",
        Some("html") | Some("htm") => "text/html",
        Some("css") => "text/css",
        Some("csv") => "text/csv",
        
        // Код
        Some("js") => "application/javascript",
        Some("py") => "text/x-python",
        Some("json") => "application/json",
        Some("xml") => "application/xml",
        
        // Архивы
        Some("zip") => "application/zip",
        
        // По умолчанию
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_types() {
        assert_eq!(get_mime_type(Some("png")), "image/png");
        assert_eq!(get_mime_type(Some("jpg")), "image/jpeg");
        assert_eq!(get_mime_type(Some("jpeg")), "image/jpeg");
        assert_eq!(get_mime_type(Some("gif")), "image/gif");
    }

    #[test]
    fn test_document_types() {
        assert_eq!(get_mime_type(Some("pdf")), "application/pdf");
        assert_eq!(get_mime_type(Some("docx")), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    }

    #[test]
    fn test_unknown_type() {
        assert_eq!(get_mime_type(Some("xyz")), "application/octet-stream");
        assert_eq!(get_mime_type(None), "application/octet-stream");
    }
}
