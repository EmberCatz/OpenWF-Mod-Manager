import type { Mod, ModVersion } from "@openwf-mod-manager/shared";
import { downloadModFile, recordDownload } from "./api";
import { installModFile, installModZip, pickAndWriteFile, uninstallFiles } from "./native";
import { getMetadataPatchesPath, getScriptsPath } from "./settings";
import { clearInstalled, getInstalled, setInstalled } from "./installed";

// Shared between Browse and ModDetail so install/uninstall/download logic
// (and the installed-state bookkeeping that goes with it) lives in one place.

export function canAutoInstall(category: string): boolean {
  return category === "metadata-patch" || category === "pluto-script";
}

export function targetFolderFor(category: string): string | null {
  if (category === "metadata-patch") return getMetadataPatchesPath();
  if (category === "pluto-script") return getScriptsPath();
  return null;
}

// Downloads + installs the given version, updating the installed-state
// tracker. If a different version of this mod is already installed, its
// old files are removed first so switching versions doesn't leave stale
// files from the previous one sitting alongside the new ones.
export async function installVersion(mod: Mod, version: ModVersion): Promise<string> {
  const targetFolder = targetFolderFor(mod.category);
  if (!targetFolder) throw new Error("Set the matching folder in Settings first");

  const existing = getInstalled(mod.id);
  if (existing && existing.version !== version.version) {
    await uninstallFiles(existing.installedFiles);
  }

  const bytes = await downloadModFile(version.downloadUrl);
  recordDownload(mod.id); // best-effort popularity counter, doesn't block install
  const installedFiles = version.fileName.toLowerCase().endsWith(".zip")
    ? await installModZip(bytes, targetFolder)
    : [await installModFile(bytes, targetFolder, version.fileName)];

  setInstalled({
    modId: mod.id,
    modName: mod.name,
    version: version.version,
    installedFiles,
    installedAt: new Date().toISOString(),
  });

  return `Installed ${installedFiles.length} file(s)`;
}

// Plain save-to-location download, no install bookkeeping — for "other"
// category mods (no defined install location) or deliberately grabbing
// the raw file. Returns null if the user cancelled the save dialog.
export async function downloadVersion(version: ModVersion): Promise<string | null> {
  const bytes = await downloadModFile(version.downloadUrl);
  const savedPath = await pickAndWriteFile(version.fileName, bytes);
  if (!savedPath) return null;
  recordDownload(version.modId); // best-effort popularity counter, doesn't block the save
  return "Saved";
}

export async function uninstallMod(modId: string): Promise<void> {
  const entry = getInstalled(modId);
  if (!entry) return;
  await uninstallFiles(entry.installedFiles);
  clearInstalled(modId);
}
