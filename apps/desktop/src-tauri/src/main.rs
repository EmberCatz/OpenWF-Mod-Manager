// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::pick_and_read_mod_file,
            commands::pick_and_write_file,
            commands::install_mod_file,
            commands::install_mod_zip,
            commands::list_zip_text_entries,
            commands::uninstall_files,
            commands::scan_install_folder,
            commands::get_api_key,
            commands::set_api_key,
            commands::clear_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the OpenWF Mod Manager");
}
