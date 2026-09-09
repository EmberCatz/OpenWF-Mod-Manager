import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

// All filesystem work happens in Rust (src-tauri/src/commands.rs), not
// through the JS fs plugin — the dialog plugin grants access to whatever
// path the user actually picks, and a plain Rust command has normal OS
// file access from there, so there's no separate fs-scope config to keep
// in sync.

export async function pickInstallFolder(): Promise<string | null> {
  const result = await open({ directory: true, title: "Select your Warframe install folder" });
  return typeof result === "string" ? result : null;
}

export async function pickZipToUpload(): Promise<string | null> {
  const result = await open({
    directory: false,
    multiple: false,
    title: "Select a mod .zip to upload",
    filters: [{ name: "Zip", extensions: ["zip"] }],
  });
  return typeof result === "string" ? result : null;
}

export async function pickSaveLocation(defaultFileName: string): Promise<string | null> {
  const result = await save({ defaultPath: defaultFileName, filters: [{ name: "Zip", extensions: ["zip"] }] });
  return result ?? null;
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const bytes = await invoke<number[]>("read_file_bytes", { path });
  return new Uint8Array(bytes);
}

export async function writeFileBytes(path: string, bytes: ArrayBuffer): Promise<void> {
  await invoke("write_file_bytes", { path, bytes: Array.from(new Uint8Array(bytes)) });
}

// Extracts a mod zip into the correct subfolder of installRoot based on
// category (OpenWF/Metadata Patches or OpenWF/Scripts — see
// docs/metadata-patching-guide.md and docs/pluto-scripting-guide.md in the
// parent project). Returns the list of files actually extracted.
export async function installModZip(zipBytes: ArrayBuffer, installRoot: string, category: string): Promise<string[]> {
  return invoke<string[]>("install_mod_zip", {
    zipBytes: Array.from(new Uint8Array(zipBytes)),
    installRoot,
    category,
  });
}
