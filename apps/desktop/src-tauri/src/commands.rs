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

// Where a mod's zip contents land, relative to the Warframe install root —
// per docs/openwf-bootstrapper-manual.md and docs/metadata-patching-guide.md,
// these are the two folders the Bootstrapper actually reads from.
fn target_subdir_for_category(category: &str) -> Result<&'static str, String> {
    match category {
        "metadata-patch" => Ok("OpenWF/Metadata Patches"),
        "pluto-script" => Ok("OpenWF/Scripts"),
        other => Err(format!(
            "category '{other}' has no defined install location — download it manually instead"
        )),
    }
}

#[tauri::command]
pub fn install_mod_zip(zip_bytes: Vec<u8>, install_root: String, category: String) -> Result<Vec<String>, String> {
    let subdir = target_subdir_for_category(&category)?;
    let target_dir = PathBuf::from(&install_root).join(subdir);
    fs::create_dir_all(&target_dir).map_err(|e| format!("failed to create '{}': {e}", target_dir.display()))?;

    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| format!("not a valid zip: {e}"))?;
    let mut extracted = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("failed to read zip entry: {e}"))?;

        // enclosed_name() is the zip crate's zip-slip guard: it returns None
        // for any entry using ".." components or an absolute path, so this
        // is the only check needed to keep extraction inside target_dir.
        let Some(relative_path) = entry.enclosed_name() else {
            continue; // unsafe entry path — silently skipped, not extracted
        };

        let dest_path = target_dir.join(&relative_path);

        if entry.is_dir() {
            fs::create_dir_all(&dest_path).map_err(|e| format!("failed to create '{}': {e}", dest_path.display()))?;
            continue;
        }

        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("failed to create '{}': {e}", parent.display()))?;
        }

        let mut out_file = fs::File::create(&dest_path).map_err(|e| format!("failed to create '{}': {e}", dest_path.display()))?;
        std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("failed to write '{}': {e}", dest_path.display()))?;

        extracted.push(relative_path.display().to_string());
    }

    Ok(extracted)
}
