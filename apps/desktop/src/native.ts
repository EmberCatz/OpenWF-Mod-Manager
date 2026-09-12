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

// Shows the native "open file" dialog and reads the picked file, both on
// the Rust side (see commands.rs's rationale) — the path never crosses
// back into JS as a string, so there's nothing here for a compromised
// script to redirect to an arbitrary file. Returns null if cancelled.
export async function pickAndReadModFile(): Promise<{ fileName: string; bytes: Uint8Array } | null> {
  const result = await invoke<PickedFile | null>("pick_and_read_mod_file");
  if (!result) return null;
  return { fileName: result.fileName, bytes: new Uint8Array(result.bytes) };
}

// Shows the native "save file" dialog and writes bytes to wherever the
// user picked, both on the Rust side, same reasoning as above. Returns the
// path actually written to, or null if cancelled.
export async function pickAndWriteFile(defaultFileName: string, bytes: ArrayBuffer): Promise<string | null> {
  return invoke<string | null>("pick_and_write_file", {
    defaultFileName,
    bytes: Array.from(new Uint8Array(bytes)),
  });
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

// Extracts a zip's contents into targetDir. Returns the absolute path of
// every file actually extracted (used to track what to remove on uninstall).
export async function installModZip(zipBytes: ArrayBuffer, targetDir: string): Promise<string[]> {
  return invoke<string[]>("install_mod_zip", {
    zipBytes: Array.from(new Uint8Array(zipBytes)),
    targetDir,
  });
}

// Dry-run counterparts to installModFile/installModZip — report where a
// file would land (or which files a zip would extract) without writing
// anything, guaranteed by the Rust side to be byte-identical to what the
// real install would produce. Used by modActions.ts's mod-conflict check
// to see whether an install would overwrite another mod's tracked files
// before actually committing to it.
export async function computeInstallFilePath(targetDir: string, fileName: string): Promise<string> {
  return invoke<string>("compute_install_file_path", { targetDir, fileName });
}

export async function listZipInstallPaths(zipBytes: ArrayBuffer, targetDir: string): Promise<string[]> {
  return invoke<string[]>("list_zip_install_paths", {
    zipBytes: Array.from(new Uint8Array(zipBytes)),
    targetDir,
  });
}

// Deletes previously-installed files (paths as returned by installModFile /
// installModZip). Missing files are treated as already-gone, not an error.
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

export interface ZipTextEntry {
  name: string;
  content: string;
}

// Lists the text-decodable entries of a zip in memory (mod detail's file
// preview) — nothing is written to disk, nothing is installed.
export async function listZipTextEntries(zipBytes: ArrayBuffer): Promise<ZipTextEntry[]> {
  return invoke<ZipTextEntry[]>("list_zip_text_entries", {
    zipBytes: Array.from(new Uint8Array(zipBytes)),
  });
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
