// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::pick_and_read_mod_files,
            commands::install_mod_file,
            commands::compute_install_file_path,
            commands::uninstall_files,
            commands::scan_install_folder,
            commands::snapshot_install_folders,
            commands::restore_snapshot,
            commands::list_snapshots,
            commands::delete_snapshot,
            commands::get_api_key,
            commands::set_api_key,
            commands::clear_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the OpenWF Mod Manager");
}
