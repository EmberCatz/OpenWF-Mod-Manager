import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// All filesystem work happens in Rust (src-tauri/src/commands.rs), not
// through the JS fs plugin — the dialog plugin grants access to whatever
// path the user actually picks, and a plain Rust command has normal OS
// file access from there, so there's no separate fs-scope config to keep
// in sync.

export async function pickFolder(title: string): Promise<string | null> {
  const result = await open({ directory: true, title });
  return typeof result === "string" ? result : null;
}

interface PickedFile {
  fileName: string;
  bytes: number[];
}

// Shows the native "open file" dialog (multi-select) and reads every
// picked file, both on the Rust side (see commands.rs's rationale) — the
// path never crosses back into JS as a string, so there's nothing here
// for a compromised script to redirect to an arbitrary file. No bundling
// — the API itself accepts several raw .pluto/.txt files per version.
// Returns an empty array if cancelled.
export async function pickModFiles(): Promise<{ fileName: string; bytes: Uint8Array }[]> {
  const result = await invoke<PickedFile[]>("pick_and_read_mod_files");
  return result.map((f) => ({ fileName: f.fileName, bytes: new Uint8Array(f.bytes) }));
}

// Installs a single raw file (.pluto/.txt) directly into targetDir under
// its own name. Returns the full path it was written to.
export async function installModFile(bytes: ArrayBuffer, targetDir: string, fileName: string): Promise<string> {
  return invoke<string>("install_mod_file", {
    bytes: Array.from(new Uint8Array(bytes)),
    targetDir,
    fileName,
  });
}

// Dry-run counterpart to installModFile — reports where a file would
// land without writing anything, guaranteed by the Rust side to be
// byte-identical to what the real install would produce. Used by
// modActions.ts's mod-conflict check to see whether an install would
// overwrite another mod's tracked files before actually committing to it.
export async function computeInstallFilePath(targetDir: string, fileName: string): Promise<string> {
  return invoke<string>("compute_install_file_path", { targetDir, fileName });
}

// Deletes previously-installed files (paths as returned by installModFile).
// Missing files are treated as already-gone, not an error.
export async function uninstallFiles(paths: string[]): Promise<void> {
  await invoke("uninstall_files", { paths });
}

// Recursively lists every file under `dir` as an absolute path — used to
// diff an install folder's actual contents against installed.ts and find
// files this app didn't put there (installedMods.ts's orphan-file scan). A
// folder that doesn't exist yet returns an empty list, not an error.
export async function scanInstallFolder(dir: string): Promise<string[]> {
  return invoke<string[]>("scan_install_folder", { dir });
}

export interface SnapshotFolder {
  label: string;
  path: string;
}

export interface SnapshotInfo {
  fileName: string;
  createdAtMs: number;
  sizeBytes: number;
}

// Manual "put my install back to how it was" safety net (Settings' new
// Backups section) — zips the current contents of each configured install
// folder into one timestamped archive under the app's own data dir.
// Returns the new snapshot's file name.
export async function snapshotInstallFolders(folders: SnapshotFolder[]): Promise<string> {
  return invoke<string>("snapshot_install_folders", { folders });
}

// Restores a snapshot's file contents on top of `folders` — overwrites
// matching files, but doesn't delete files added since the snapshot was
// taken (see commands.rs's apply_snapshot_zip for why).
export async function restoreSnapshot(fileName: string, folders: SnapshotFolder[]): Promise<void> {
  await invoke("restore_snapshot", { fileName, folders });
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return invoke<SnapshotInfo[]>("list_snapshots");
}

export async function deleteSnapshot(fileName: string): Promise<void> {
  await invoke("delete_snapshot", { fileName });
}

// The auth token (API key / login session token) lives in the OS keychain
// (Windows Credential Manager / macOS Keychain / Linux Secret Service),
// not localStorage — see commands.rs's rationale. There's no bulk "read
// everything" API to it the way localStorage has, only these three named
// commands.
export async function getApiKeyNative(): Promise<string | null> {
  return invoke<string | null>("get_api_key");
}

export async function setApiKeyNative(key: string): Promise<void> {
  await invoke("set_api_key", { key });
}

export async function clearApiKeyNative(): Promise<void> {
  await invoke("clear_api_key");
}
