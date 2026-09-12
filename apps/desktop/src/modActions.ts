import type { Mod, ModVersion } from "@openwf-mod-manager/shared";
import { downloadModFile, recordDownload } from "./api";
import {
  computeInstallFilePath,
  installModFile,
  installModZip,
  listZipInstallPaths,
  pickAndWriteFile,
  uninstallFiles,
} from "./native";
import { getMetadataPatchesPath, getScriptsPath } from "./settings";
import { clearInstalled, getInstalled, listInstalled, setInstalled, type InstalledEntry } from "./installed";

// Thrown by installVersion when installing would overwrite one or more
// files another already-installed mod owns — see its own doc comment.
// Callers catch this specifically to offer an "install anyway" retry with
// { force: true } (see components/ConflictConfirmDialog.tsx), rather than
// just surfacing it as a generic error.
export class ModConflictError extends Error {
  conflicts: { modName: string; paths: string[] }[];

  constructor(conflicts: { modName: string; paths: string[] }[]) {
    super(`Would overwrite files from: ${conflicts.map((c) => c.modName).join(", ")}`);
    this.name = "ModConflictError";
    this.conflicts = conflicts;
  }
}

// Cross-references `paths` (what a pending install is about to write)
// against every OTHER installed mod's tracked files — two cosmetic mods
// for the same slot are the realistic case, not malice, but nothing
// before this ever caught it; it just silently overwrote (TODO.md § Mod
// conflict/dependency declarations).
interface Conflict {
  entry: InstalledEntry;
  paths: string[];
}

function findConflicts(excludeModId: string, paths: string[]): Conflict[] {
  const pathSet = new Set(paths);
  const conflicts: Conflict[] = [];
  for (const entry of listInstalled()) {
    if (entry.modId === excludeModId) continue;
    const overlap = entry.installedFiles.filter((p) => pathSet.has(p));
    if (overlap.length > 0) conflicts.push({ entry, paths: overlap });
  }
  return conflicts;
}

// Called after a forced install actually overwrote one or more other mods'
// files — without this, those mods' installedFiles would still list a path
// that now belongs to the mod that just overwrote it, so uninstalling them
// later would delete the *new* mod's file too. Prunes just the overwritten
// paths from each affected mod, dropping its entry entirely if nothing it
// still owns is left.
function reconcileOverwrittenMods(conflicts: Conflict[]): void {
  for (const { entry, paths } of conflicts) {
    const overwritten = new Set(paths);
    const remainingFiles = entry.installedFiles.filter((p) => !overwritten.has(p));
    if (remainingFiles.length === 0) {
      clearInstalled(entry.modId);
    } else {
      setInstalled({ ...entry, installedFiles: remainingFiles });
    }
  }
}

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
//
// Before writing anything, checks whether the files this install is about
// to write already belong to a *different* installed mod (two cosmetic
// mods for the same slot, say) — via the Rust-side dry-run commands, which
// are guaranteed to compute the exact same paths the real install would
// (see commands.rs). Throws ModConflictError rather than proceeding,
// unless `force` is set — the caller's job is to catch that specifically
// and offer the user a choice, not to silently overwrite.
export async function installVersion(mod: Mod, version: ModVersion, options?: { force?: boolean }): Promise<string> {
  const targetFolder = targetFolderFor(mod.category);
  if (!targetFolder) throw new Error("Set the matching folder in Settings first");

  const isZip = version.fileName.toLowerCase().endsWith(".zip");
  const bytes = await downloadModFile(version.downloadUrl);

  const wouldBePaths = isZip
    ? await listZipInstallPaths(bytes, targetFolder)
    : [await computeInstallFilePath(targetFolder, version.fileName)];
  const conflicts = findConflicts(mod.id, wouldBePaths);
  if (conflicts.length > 0 && !options?.force) {
    throw new ModConflictError(conflicts.map((c) => ({ modName: c.entry.modName, paths: c.paths })));
  }

  const existing = getInstalled(mod.id);
  if (existing && existing.version !== version.version) {
    await uninstallFiles(existing.installedFiles);
  }

  recordDownload(mod.id); // best-effort popularity counter, doesn't block install
  const installedFiles = isZip ? await installModZip(bytes, targetFolder) : [await installModFile(bytes, targetFolder, version.fileName)];

  setInstalled({
    modId: mod.id,
    modName: mod.name,
    version: version.version,
    installedFiles,
    installedAt: new Date().toISOString(),
  });

  // Only reachable with conflicts.length > 0 when force was set (otherwise
  // the throw above already returned) — clean up the other side's stale
  // bookkeeping now that the overwrite has actually happened.
  if (conflicts.length > 0) reconcileOverwrittenMods(conflicts);

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
