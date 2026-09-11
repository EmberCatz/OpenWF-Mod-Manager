use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;

// The auth token (an API key or login session token) used to be kept in the
// webview's localStorage, trivially readable by any script that ever runs
// in that context (a supply-chain-compromised dependency, a future XSS).
// The OS keychain isn't reachable via a generic DOM API — only through
// these two named commands — so exfiltrating it requires specifically
// knowing to call get_api_key, not just grepping window.localStorage.
const KEYRING_SERVICE: &str = "io.openwf.modmanager";
const KEYRING_USER: &str = "api-key";

fn api_key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key() -> Result<Option<String>, String> {
    match api_key_entry()?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    api_key_entry()?.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_api_key() -> Result<(), String> {
    match api_key_entry()?.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// These two commands used to be read_file_bytes/write_file_bytes, taking a
// raw `path: String` argument straight from JS with no containment check —
// any script running in the webview could invoke them with an arbitrary
// path, not just one that came from a real native dialog (Tauri's IPC has
// no per-origin ACL; capabilities gate which commands exist, not who calls
// them). See docs/redteam-audit-2026-09.md §2.1. Fixed by merging "show the
// dialog" and "read/write the picked file" into one atomic Rust-side
// operation each — the picked path is used entirely on this side and never
// crosses back into JS as a free string, so there's nothing left for a
// compromised script to substitute its own value into. A script can still
// trigger these commands, but that surfaces a real, visible native OS
// dialog the user sees and can cancel, not a silent file operation.

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedFile {
    file_name: String,
    bytes: Vec<u8>,
}

// Shows a native "open file" dialog (same filters Upload.tsx always used)
// and reads the picked file in one step. Returns None if the user cancelled.
#[tauri::command]
pub async fn pick_and_read_mod_file(app: tauri::AppHandle) -> Result<Option<PickedFile>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Select a mod file to upload")
        .add_filter("Mod file", &["pluto", "txt", "zip"])
        .blocking_pick_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };

    let path = file_path.into_path().map_err(|e| e.to_string())?;
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| format!("picked file has no name: {}", path.display()))?;
    let bytes = fs::read(&path).map_err(|e| format!("failed to read '{}': {e}", path.display()))?;

    Ok(Some(PickedFile { file_name, bytes }))
}

// Shows a native "save file" dialog and writes bytes to wherever the user
// picked in one step. Returns the path actually written to (for a "Saved
// to X" confirmation), or None if the user cancelled.
#[tauri::command]
pub async fn pick_and_write_file(app: tauri::AppHandle, default_file_name: String, bytes: Vec<u8>) -> Result<Option<String>, String> {
    let picked = app.dialog().file().set_file_name(&default_file_name).blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };

    let path = file_path.into_path().map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create '{}': {e}", parent.display()))?;
    }
    fs::write(&path, bytes).map_err(|e| format!("failed to write '{}': {e}", path.display()))?;

    Ok(Some(path.display().to_string()))
}

// Installs a single raw file (.pluto / .txt) directly into target_dir under
// its own name — the common case now that mods don't have to be zipped.
// file_name comes from the server (the original uploaded name), but it's
// still treated as untrusted input: only the bare filename component is
// used, so a crafted "../../evil.pluto" can't escape target_dir.
#[tauri::command]
pub fn install_mod_file(bytes: Vec<u8>, target_dir: String, file_name: String) -> Result<String, String> {
    let safe_name = Path::new(&file_name)
        .file_name()
        .ok_or_else(|| format!("invalid file name: {file_name}"))?;

    let dir = PathBuf::from(&target_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create '{}': {e}", dir.display()))?;

    let dest_path = dir.join(safe_name);
    fs::write(&dest_path, bytes).map_err(|e| format!("failed to write '{}': {e}", dest_path.display()))?;

    Ok(dest_path.display().to_string())
}

// Extracts a zip's contents directly into target_dir (which the frontend
// has already resolved from the mod's category — see Browse.tsx). Used
// only for the minority of mods that need more than one file.
#[tauri::command]
pub fn install_mod_zip(zip_bytes: Vec<u8>, target_dir: String) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(&target_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create '{}': {e}", dir.display()))?;

    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| format!("not a valid zip: {e}"))?;
    let mut extracted = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("failed to read zip entry: {e}"))?;

        // enclosed_name() is the zip crate's zip-slip guard: it returns None
        // for any entry using ".." components or an absolute path, so this
        // is the only check needed to keep extraction inside dir.
        let Some(relative_path) = entry.enclosed_name() else {
            continue; // unsafe entry path — silently skipped, not extracted
        };

        let dest_path = dir.join(&relative_path);

        if entry.is_dir() {
            fs::create_dir_all(&dest_path).map_err(|e| format!("failed to create '{}': {e}", dest_path.display()))?;
            continue;
        }

        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("failed to create '{}': {e}", parent.display()))?;
        }

        let mut out_file = fs::File::create(&dest_path).map_err(|e| format!("failed to create '{}': {e}", dest_path.display()))?;
        std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("failed to write '{}': {e}", dest_path.display()))?;

        // Absolute path, not just the relative in-zip path — the frontend
        // stores this list verbatim to know what to delete on uninstall,
        // without needing to remember which target_dir it came from.
        extracted.push(dest_path.display().to_string());
    }

    Ok(extracted)
}

#[derive(serde::Serialize)]
pub struct ZipTextEntry {
    name: String,
    content: String,
}

// Zip entries above this size, or beyond this count, are skipped rather
// than previewed — these mods are small text bundles, so anything bigger
// is almost certainly not something worth rendering inline anyway.
const MAX_PREVIEW_ENTRIES: usize = 50;
const MAX_PREVIEW_ENTRY_BYTES: u64 = 512 * 1024;

// Lists the text-decodable entries of a zip in memory, for the mod detail
// view's file preview — no extraction to disk, nothing installed. Binary
// entries (images, etc.) are silently skipped since there's nothing sane
// to render for them here.
#[tauri::command]
pub fn list_zip_text_entries(zip_bytes: Vec<u8>) -> Result<Vec<ZipTextEntry>, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| format!("not a valid zip: {e}"))?;
    let mut out = Vec::new();

    for i in 0..archive.len() {
        if out.len() >= MAX_PREVIEW_ENTRIES {
            break;
        }

        let mut entry = archive.by_index(i).map_err(|e| format!("failed to read zip entry: {e}"))?;
        if entry.is_dir() || entry.size() > MAX_PREVIEW_ENTRY_BYTES {
            continue;
        }

        let Some(relative_path) = entry.enclosed_name() else {
            continue;
        };

        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut entry, &mut buf).map_err(|e| format!("failed to read zip entry: {e}"))?;

        let Ok(content) = String::from_utf8(buf) else {
            continue; // binary — nothing sane to preview
        };

        out.push(ZipTextEntry { name: relative_path.display().to_string(), content });
    }

    Ok(out)
}

// Deletes a set of previously-installed files (paths as returned by
// install_mod_file / install_mod_zip). Missing files are treated as
// already-uninstalled, not an error — only real failures (permissions,
// a path that's actually a directory, etc.) are collected and reported.
#[tauri::command]
pub fn uninstall_files(paths: Vec<String>) -> Result<(), String> {
    let mut errors = Vec::new();
    for path in paths {
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => errors.push(format!("'{path}': {e}")),
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}
