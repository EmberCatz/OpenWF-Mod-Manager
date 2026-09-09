use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

// Both endpoints exist so the frontend never touches the filesystem
// directly (Tauri's fs-plugin scope rules only cover paths granted through
// its own APIs) — the user picks paths via the native dialog plugin, and
// everything after that is a plain Rust command with normal OS file access.

#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("failed to read '{path}': {e}"))
}

#[tauri::command]
pub fn write_file_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create '{}': {e}", parent.display()))?;
    }
    fs::write(&path, bytes).map_err(|e| format!("failed to write '{path}': {e}"))
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
