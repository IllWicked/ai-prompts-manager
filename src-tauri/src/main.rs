#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;

#[tauri::command]
fn reset_app_data() -> Result<(), String> {
    // Получаем путь к AppData/Local
    if let Some(local_app_data) = dirs::data_local_dir() {
        let app_folder = local_app_data.join("com.claude.prompts");
        if app_folder.exists() {
            fs::remove_dir_all(&app_folder).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![reset_app_data])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
