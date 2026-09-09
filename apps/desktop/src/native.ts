import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

// All filesystem work happens in Rust (src-tauri/src/commands.rs), not
// through the JS fs plugin — the dialog plugin grants access to whatever
// path the user actually picks, and a plain Rust command has normal OS
// file access from there, so there's no separate fs-scope config to keep
// in sync.

export async function pickFolder(title: string): Promise<string | null> {
  const result = await open({ directory: true, title });
  return typeof result === "string" ? result : null;
}

export async function pickModFileToUpload(): Promise<string | null> {
  const result = await open({
    directory: false,
    multiple: false,
    title: "Select a mod file to upload",
    filters: [{ name: "Mod file", extensions: ["pluto", "txt", "zip"] }],
  });
  return typeof result === "string" ? result : null;
}

export async function pickSaveLocation(defaultFileName: string): Promise<string | null> {
  const result = await save({ defaultPath: defaultFileName });
  return result ?? null;
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const bytes = await invoke<number[]>("read_file_bytes", { path });
  return new Uint8Array(bytes);
}

export async function writeFileBytes(path: string, bytes: ArrayBuffer): Promise<void> {
  await invoke("write_file_bytes", { path, bytes: Array.from(new Uint8Array(bytes)) });
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

// Extracts a zip's contents into targetDir. Returns the list of files
// actually extracted.
export async function installModZip(zipBytes: ArrayBuffer, targetDir: string): Promise<string[]> {
  return invoke<string[]>("install_mod_zip", {
    zipBytes: Array.from(new Uint8Array(zipBytes)),
    targetDir,
  });
}
