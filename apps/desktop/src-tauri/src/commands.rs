use std::fs;
use std::io::{Cursor, Write};
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

// Shows a native "open file" dialog, allowing multiple selections, and
// reads every picked file in one step — no bundling into a zip (the API
// itself now accepts several raw .pluto/.txt files per version, see
// routes/mods.ts). Returns an empty vec if the user cancelled.
#[tauri::command]
pub async fn pick_and_read_mod_files(app: tauri::AppHandle) -> Result<Vec<PickedFile>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Select mod file(s) to upload")
        .add_filter("Mod file", &["pluto", "txt"])
        .blocking_pick_files();

    let Some(file_paths) = picked else {
        return Ok(Vec::new());
    };

    let mut files = Vec::new();
    for file_path in file_paths {
        let path = file_path.into_path().map_err(|e| e.to_string())?;
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .ok_or_else(|| format!("picked file has no name: {}", path.display()))?;
        let bytes = fs::read(&path).map_err(|e| format!("failed to read '{}': {e}", path.display()))?;
        files.push(PickedFile { file_name, bytes });
    }

    Ok(files)
}

// Shared by install_mod_file and its dry-run counterpart below, so the two
// can never disagree about where a file would land — the conflict check
// only means anything if it's checking the exact path that would actually
// get written.
fn safe_dest_path(target_dir: &str, file_name: &str) -> Result<PathBuf, String> {
    let safe_name = Path::new(file_name).file_name().ok_or_else(|| format!("invalid file name: {file_name}"))?;
    Ok(PathBuf::from(target_dir).join(safe_name))
}

// Installs a single raw file (.pluto / .txt) directly into target_dir under
// its own name — the common case now that mods don't have to be zipped.
// file_name comes from the server (the original uploaded name), but it's
// still treated as untrusted input: only the bare filename component is
// used, so a crafted "../../evil.pluto" can't escape target_dir.
#[tauri::command]
pub fn install_mod_file(bytes: Vec<u8>, target_dir: String, file_name: String) -> Result<String, String> {
    let dest_path = safe_dest_path(&target_dir, &file_name)?;
    fs::create_dir_all(&target_dir).map_err(|e| format!("failed to create '{target_dir}': {e}"))?;
    fs::write(&dest_path, bytes).map_err(|e| format!("failed to write '{}': {e}", dest_path.display()))?;
    Ok(dest_path.display().to_string())
}

// Dry-run counterpart to install_mod_file — reports where the file WOULD
// land without writing anything, so the frontend can check it against
// every other mod's already-installed files (modActions.ts's conflict
// check) before committing to an install that would silently overwrite
// another mod's file.
#[tauri::command]
pub fn compute_install_file_path(target_dir: String, file_name: String) -> Result<String, String> {
    Ok(safe_dest_path(&target_dir, &file_name)?.display().to_string())
}

// Deletes a set of previously-installed files (paths as returned by
// install_mod_file). Missing files are treated as already-uninstalled,
// not an error — only real failures (permissions, a path that's actually
// a directory, etc.) are collected and reported.
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
// already uses — so the frontend can directly diff this against
// installed.ts's stored paths to find files it doesn't know about
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

// Manual "put my install back to how it was before I started modding"
// safety net (TODO.md § Ideas) — deliberately a manual action in Settings,
// not an automatic snapshot before every install: that would slow down and
// complicate the common case for a feature that's explicitly a fallback,
// not primary UX. Snapshots the *current* contents of each configured
// install folder into one timestamped zip, stored under the app's own data
// dir (not the install folders themselves, so a snapshot never shows up as
// an "orphaned file" in InstalledMods' own scan of those folders).

#[derive(serde::Deserialize, Clone)]
pub struct SnapshotFolder {
    pub label: String, // e.g. "Metadata Patches" — becomes each entry's top-level folder inside the zip
    pub path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    file_name: String,
    created_at_ms: u64, // encoded in the filename itself at creation time, not read from filesystem metadata (unreliable across copies/cloud sync) — apps/desktop formats this with Date, Rust doesn't need to
    size_bytes: u64,
}

fn snapshots_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("snapshots");
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create '{}': {e}", dir.display()))?;
    Ok(dir)
}

fn now_unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Pure zip-building step, split out from the #[tauri::command] wrapper so
// it's testable without a running app. Walks each folder with the
// existing collect_files helper and stores every file under
// `<label>/<path relative to that folder>` inside the archive, so
// apply_snapshot_zip can route each section back to wherever that label
// points at restore time — not necessarily the same absolute path it was
// snapshotted from, in case Settings changed in between.
fn build_snapshot_zip(folders: &[SnapshotFolder]) -> Result<Vec<u8>, String> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for folder in folders {
        let base = PathBuf::from(&folder.path);
        let mut abs_files = Vec::new();
        collect_files(&base, &mut abs_files)?;

        for abs in abs_files {
            let abs_path = PathBuf::from(&abs);
            let rel = abs_path.strip_prefix(&base).map_err(|e| e.to_string())?;
            let zip_name = format!("{}/{}", folder.label, rel.to_string_lossy().replace('\\', "/"));
            writer
                .start_file(&zip_name, options)
                .map_err(|e| format!("failed to add '{zip_name}' to snapshot: {e}"))?;
            let bytes = fs::read(&abs_path).map_err(|e| format!("failed to read '{}': {e}", abs_path.display()))?;
            writer.write_all(&bytes).map_err(|e| format!("failed to write '{zip_name}' into snapshot: {e}"))?;
        }
    }

    let cursor = writer.finish().map_err(|e| format!("failed to finalize snapshot archive: {e}"))?;
    Ok(cursor.into_inner())
}

// Restores a previously-built snapshot's file *contents* on top of
// `folders` — overwrites files the snapshot has, but does not delete files
// added since the snapshot was taken, since that would need a full
// before/after folder diff this feature doesn't attempt. Documented as a
// best-effort content restore, not a byte-perfect folder-state revert.
// Entries whose top-level label doesn't match any of `folders` are skipped
// rather than erroring, so restoring after a folder was removed from
// Settings just does less, not nothing.
fn apply_snapshot_zip(bytes: &[u8], folders: &[SnapshotFolder]) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("not a valid snapshot archive: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("failed to read snapshot entry: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let Some(relative_path) = entry.enclosed_name() else {
            continue;
        };

        let mut components = relative_path.components();
        let Some(label_component) = components.next() else {
            continue;
        };
        let label = label_component.as_os_str().to_string_lossy().into_owned();
        let Some(target) = folders.iter().find(|f| f.label == label) else {
            continue; // this label isn't configured (or isn't set) anymore
        };
        let rest: PathBuf = components.collect();
        if rest.as_os_str().is_empty() {
            continue;
        }

        let dest_path = PathBuf::from(&target.path).join(&rest);
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("failed to create '{}': {e}", parent.display()))?;
        }
        let mut out_file = fs::File::create(&dest_path).map_err(|e| format!("failed to create '{}': {e}", dest_path.display()))?;
        std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("failed to write '{}': {e}", dest_path.display()))?;
    }

    Ok(())
}

#[tauri::command]
pub fn snapshot_install_folders(app: tauri::AppHandle, folders: Vec<SnapshotFolder>) -> Result<String, String> {
    let bytes = build_snapshot_zip(&folders)?;
    let dir = snapshots_dir(&app)?;
    let file_name = format!("owmm-snapshot-{}.zip", now_unix_millis());
    fs::write(dir.join(&file_name), bytes).map_err(|e| format!("failed to write snapshot: {e}"))?;
    Ok(file_name)
}

#[tauri::command]
pub fn restore_snapshot(app: tauri::AppHandle, file_name: String, folders: Vec<SnapshotFolder>) -> Result<(), String> {
    let safe_name = Path::new(&file_name).file_name().ok_or_else(|| format!("invalid snapshot file name: {file_name}"))?;
    let path = snapshots_dir(&app)?.join(safe_name);
    let bytes = fs::read(&path).map_err(|e| format!("failed to read '{}': {e}", path.display()))?;
    apply_snapshot_zip(&bytes, &folders)
}

#[tauri::command]
pub fn list_snapshots(app: tauri::AppHandle) -> Result<Vec<SnapshotInfo>, String> {
    let dir = snapshots_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("failed to read '{}': {e}", dir.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("zip") {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let size_bytes = entry.metadata().map_err(|e| e.to_string())?.len();
        let created_at_ms = file_name
            .strip_prefix("owmm-snapshot-")
            .and_then(|s| s.strip_suffix(".zip"))
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);
        out.push(SnapshotInfo { file_name, created_at_ms, size_bytes });
    }
    out.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms)); // newest first
    Ok(out)
}

#[tauri::command]
pub fn delete_snapshot(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    let safe_name = Path::new(&file_name).file_name().ok_or_else(|| format!("invalid snapshot file name: {file_name}"))?;
    let path = snapshots_dir(&app)?.join(safe_name);
    fs::remove_file(&path).map_err(|e| format!("failed to delete '{}': {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

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

    // Regression test for the mod-conflict check (TODO.md): the dry-run
    // command must report the exact same path the real install command
    // would write, or the conflict check it backs is worthless.
    #[test]
    fn dry_run_path_matches_real_install_path() {
        let tmp = std::env::temp_dir().join(format!("owmm-dryruntest-{}", std::process::id()));
        let target_dir = tmp.display().to_string();

        let computed_file_path = compute_install_file_path(target_dir.clone(), "Swarm.pluto".to_string()).unwrap();
        let real_file_path = install_mod_file(b"content".to_vec(), target_dir.clone(), "Swarm.pluto".to_string()).unwrap();
        assert_eq!(computed_file_path, real_file_path);

        let _ = fs::remove_dir_all(&tmp);
    }

    // Round-trip test for the snapshot/restore safety net: two source
    // folders under different labels, snapshot both, restore into fresh
    // empty target folders, and confirm every file's content survived —
    // including that restore correctly routes each label back to its own
    // folder rather than mixing them up.
    #[test]
    fn snapshot_and_restore_round_trip_preserves_file_contents() {
        let root = std::env::temp_dir().join(format!("owmm-snapshot-test-{}", std::process::id()));
        let source_a = root.join("source-a");
        let source_b = root.join("source-b");
        fs::create_dir_all(source_a.join("nested")).unwrap();
        fs::create_dir_all(&source_b).unwrap();
        fs::write(source_a.join("top.pluto"), b"alpha top").unwrap();
        fs::write(source_a.join("nested/inner.txt"), b"alpha nested").unwrap();
        fs::write(source_b.join("beta.pluto"), b"beta content").unwrap();

        let folders = vec![
            SnapshotFolder { label: "Metadata Patches".to_string(), path: source_a.display().to_string() },
            SnapshotFolder { label: "Scripts".to_string(), path: source_b.display().to_string() },
        ];

        let zip_bytes = build_snapshot_zip(&folders).unwrap();

        // Restore into fresh, empty target folders — proves restore doesn't
        // depend on the target already looking like the source.
        let target_a = root.join("target-a");
        let target_b = root.join("target-b");
        let restore_folders = vec![
            SnapshotFolder { label: "Metadata Patches".to_string(), path: target_a.display().to_string() },
            SnapshotFolder { label: "Scripts".to_string(), path: target_b.display().to_string() },
        ];
        apply_snapshot_zip(&zip_bytes, &restore_folders).unwrap();

        assert_eq!(fs::read(target_a.join("top.pluto")).unwrap(), b"alpha top");
        assert_eq!(fs::read(target_a.join("nested/inner.txt")).unwrap(), b"alpha nested");
        assert_eq!(fs::read(target_b.join("beta.pluto")).unwrap(), b"beta content");

        let _ = fs::remove_dir_all(&root);
    }

    // A label with no matching entry in the restore-time folder list (the
    // user removed it from Settings, say) should be skipped, not error the
    // whole restore.
    #[test]
    fn restore_skips_labels_with_no_matching_target() {
        let root = std::env::temp_dir().join(format!("owmm-snapshot-test-orphan-{}", std::process::id()));
        let source = root.join("source");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("a.pluto"), b"content").unwrap();

        let zip_bytes = build_snapshot_zip(&[SnapshotFolder { label: "Scripts".to_string(), path: source.display().to_string() }]).unwrap();

        // Restore-time folders only know about a different label.
        let target = root.join("target");
        let result = apply_snapshot_zip(
            &zip_bytes,
            &[SnapshotFolder { label: "Metadata Patches".to_string(), path: target.display().to_string() }],
        );

        assert!(result.is_ok(), "an unmatched label should be skipped, not fail the restore");
        assert!(!target.exists(), "nothing should have been written for the unmatched label");

        let _ = fs::remove_dir_all(&root);
    }

}
