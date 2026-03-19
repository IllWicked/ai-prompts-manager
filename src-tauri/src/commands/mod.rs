//! Tauri команды
//!
//! Этот модуль объединяет все Tauri команды, разбитые по функциональности:
//! - `app` - управление приложением (сброс данных, папка данных)
//! - `toolbar` - навигация и тулбар
//! - `downloads` - управление загрузками
//! - `logs` - работа с логами
//! - `claude` - взаимодействие с Claude (табы, навигация, eval)
//! - `attachments` - аттачменты (чтение, запись, прикрепление)
//! - `storage` - хранение вкладок (файловая система)
//! - `scraper` - автосбор данных из Google (SERP Scraper)

pub mod app;
pub mod toolbar;
pub mod downloads;
pub mod logs;
pub mod claude;
pub mod attachments;
pub mod storage;
pub mod scraper;

// Реэкспорт команд для удобной регистрации в main.rs

// App commands
pub use app::{
    reset_app_data,
    open_app_data_dir,
    set_window_background,
    get_window_width,
};

// Toolbar commands
pub use toolbar::{
    toolbar_back,
    toolbar_forward,
    toolbar_reload,
    toolbar_recreate,
    show_downloads,
    hide_downloads,
};

// Downloads commands
pub use downloads::{
    get_downloads_path,
    pick_downloads_folder,
    open_file,
    delete_download,
    delete_all_downloads,
};

// Logs commands
pub use logs::{
    get_archive_log,
    clear_archive_log,
    add_archive_log_entry,
    get_downloads_log,
    write_archive_log, // internal fn (not #[tauri::command]), used by other Rust modules
    write_diagnostic,
    export_diagnostics,
};

// Claude commands
pub use claude::{
    toggle_claude,
    get_active_tab,
    switch_claude_tab,
    switch_claude_tab_with_url,
    get_tab_url,
    get_claude_state,
    recreate_claude_tab,
    navigate_claude_tab,
    notify_url_change,
    reset_claude_state,
    set_panel_ratio,
    get_panel_ratio,
    eval_in_claude,
    eval_in_claude_with_result,
    inject_generation_monitor,
    check_generation_status,
    insert_text_to_claude,
    init_claude_webviews,
};

// Attachments commands
pub use attachments::{
    read_file_for_attachment,
    write_temp_file,
    attach_file_to_claude,
    attach_files_batch,
    get_upload_count,
    reset_upload_count,
};

// Storage commands
pub use storage::{
    save_tabs_to_file,
    load_tabs_from_file,
    delete_tabs_file,
};

// Scraper commands
pub use scraper::{
    create_scraper_webview,
    destroy_scraper_webview,
    scrape_google_serp,
};
