use std::fs;
use std::io::{Cursor, Read, Write};
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

// A small download that decompresses to gigabytes (a zip bomb) can fill a
// user's disk — this caps the running total of bytes actually written
// across every entry in one archive, same spirit as MAX_FILE_BYTES on the
// upload side. Checked against real bytes copied, not each entry's
// declared/uncompressed-size header (which a crafted zip could lie about),
// so this holds even against an archive with falsified metadata.
const MAX_UNCOMPRESSED_BYTES: u64 = 500 * 1024 * 1024;
const COPY_CHUNK_BYTES: usize = 64 * 1024;

// Copies from `entry` to `out_file` in bounded chunks, adding each chunk to
// `running_total` and erroring out before writing anything that would push
// the archive's cumulative uncompressed size past `cap`.
fn copy_with_cap(entry: &mut impl Read, out_file: &mut fs::File, running_total: &mut u64, cap: u64) -> Result<(), String> {
    let mut buf = [0u8; COPY_CHUNK_BYTES];
    loop {
        let n = entry.read(&mut buf).map_err(|e| format!("failed to read zip entry: {e}"))?;
        if n == 0 {
            return Ok(());
        }
        *running_total += n as u64;
        if *running_total > cap {
            return Err(format!(
                "archive decompresses to more than the {}MB cap — refusing to extract (possible zip bomb)",
                cap / (1024 * 1024)
            ));
        }
        out_file.write_all(&buf[..n]).map_err(|e| format!("failed to write file: {e}"))?;
    }
}

// Extracts a zip's contents directly into target_dir (which the frontend
// has already resolved from the mod's category — see Browse.tsx). Used
// only for the minority of mods that need more than one file.
#[tauri::command]
pub fn install_mod_zip(zip_bytes: Vec<u8>, target_dir: String) -> Result<Vec<String>, String> {
    extract_zip_with_cap(zip_bytes, target_dir, MAX_UNCOMPRESSED_BYTES)
}

// `cap` is only a parameter (not always MAX_UNCOMPRESSED_BYTES) so the
// zip-bomb-abort behavior can be exercised in a unit test without actually
// writing hundreds of megabytes to disk.
fn extract_zip_with_cap(zip_bytes: Vec<u8>, target_dir: String, cap: u64) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(&target_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create '{}': {e}", dir.display()))?;

    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| format!("not a valid zip: {e}"))?;
    let mut extracted = Vec::new();
    let mut running_total: u64 = 0;

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
        if let Err(err) = copy_with_cap(&mut entry, &mut out_file, &mut running_total, cap) {
            drop(out_file);
            // Abort cleanly rather than leaving a half-extracted mod behind:
            // remove the file that was mid-write plus everything already
            // extracted earlier in this same call.
            let _ = fs::remove_file(&dest_path);
            for path in &extracted {
                let _ = fs::remove_file(path);
            }
            return Err(err);
        }

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

// Recursively collects every file (not directory) under `dir`, as absolute
// path strings in the same `.display().to_string()` format install_mod_file
// / install_mod_zip already use — so the frontend can directly diff this
// against installed.ts's stored paths to find files it doesn't know about
// (manually dropped in from the old Discord-link workflow this app exists
// to replace). A missing folder returns an empty list rather than an error
// — nothing installed there yet isn't a failure.
fn collect_files(dir: &Path, out: &mut Vec<String>) -> Result<(), String> {
    let read_dir = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("failed to read '{}': {e}", dir.display())),
    };
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("failed to read an entry in '{}': {e}", dir.display()))?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| format!("failed to stat '{}': {e}", path.display()))?;
        if file_type.is_dir() {
            collect_files(&path, out)?;
        } else if file_type.is_file() {
            out.push(path.display().to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn scan_install_folder(dir: String) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    collect_files(&PathBuf::from(&dir), &mut out)?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_test_zip(entry_name: &str, content: &[u8]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        writer.start_file(entry_name, options).unwrap();
        writer.write_all(content).unwrap();
        writer.finish().unwrap().into_inner()
    }

    // Regression test for the zip-bomb cap (TODO.md § Security): a tiny cap
    // stands in for MAX_UNCOMPRESSED_BYTES so the test doesn't actually need
    // to write hundreds of megabytes to prove the abort path works.
    #[test]
    fn install_mod_zip_aborts_and_cleans_up_past_the_cap() {
        let tmp = std::env::temp_dir().join(format!("owmm-ziptest-abort-{}", std::process::id()));
        let zip_bytes = build_test_zip("payload.txt", &[0u8; 2000]);

        let result = extract_zip_with_cap(zip_bytes, tmp.display().to_string(), 1000);

        assert!(result.is_err(), "a 2000-byte entry should be rejected by a 1000-byte cap");
        assert!(!tmp.join("payload.txt").exists(), "the partially-written file should be cleaned up on abort");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn install_mod_zip_extracts_normally_under_the_cap() {
        let tmp = std::env::temp_dir().join(format!("owmm-ziptest-ok-{}", std::process::id()));
        let content = vec![7u8; 500];
        let zip_bytes = build_test_zip("payload.txt", &content);

        let result = extract_zip_with_cap(zip_bytes, tmp.display().to_string(), 1000);

        assert!(result.is_ok());
        assert_eq!(fs::read(tmp.join("payload.txt")).unwrap(), content);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn scan_install_folder_finds_nested_files_and_ignores_missing_dirs() {
        let tmp = std::env::temp_dir().join(format!("owmm-scantest-{}", std::process::id()));
        let nested = tmp.join("nested");
        fs::create_dir_all(&nested).unwrap();
        fs::write(tmp.join("top.pluto"), b"a").unwrap();
        fs::write(nested.join("inner.txt"), b"b").unwrap();

        let found = scan_install_folder(tmp.display().to_string()).unwrap();
        assert_eq!(found.len(), 2, "should find both the top-level and nested file");
        assert!(found.iter().any(|p| p.ends_with("top.pluto")));
        assert!(found.iter().any(|p| p.ends_with("inner.txt")));

        let missing = tmp.join("does-not-exist");
        assert_eq!(scan_install_folder(missing.display().to_string()).unwrap(), Vec::<String>::new());

        let _ = fs::remove_dir_all(&tmp);
    }
}
