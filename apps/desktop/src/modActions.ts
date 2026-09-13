import type { Mod, ModVersion } from "@openwf-mod-manager/shared";
import { downloadModFile, fetchModList, recordDownload } from "./api";
import { computeInstallFilePath, installModFile, uninstallFiles } from "./native";
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

// Thrown when the mod being installed declares (via Mod.conflictsWithModIds
// — author-stated intent, see Upload.tsx's ModPicker) a conflict with a
// mod that's currently installed. Distinct from ModConflictError above,
// which fires on an actual detected file-path collision — this is just
// what the author *says*, so it's a softer warning: still skippable via
// `force`, same retry shape (see components/ConflictConfirmDialog.tsx's
// useDeclaredConflictConfirm).
export class DeclaredConflictError extends Error {
  conflictModNames: string[];

  constructor(conflictModNames: string[]) {
    super(`Declared conflict with: ${conflictModNames.join(", ")}`);
    this.name = "DeclaredConflictError";
    this.conflictModNames = conflictModNames;
  }
}

// Only fetches the full mod list (for name lookups) when actually needed —
// most mods declare no requires/conflicts at all, so this stays off the
// hot path for the common case.
async function resolveModNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const all = await fetchModList();
  return new Map(all.filter((m) => ids.includes(m.id)).map((m) => [m.id, m.name]));
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

// Shared between Browse and ModDetail so install/uninstall logic (and the
// installed-state bookkeeping that goes with it) lives in one place.

// Every mod file is a raw .pluto/.txt now, so where it installs to is a
// property of the *file*, not the mod's category — a version can mix
// both extensions and have its files land in two different folders in
// one install. Returns null for anything else (shouldn't happen — the API
// only ever stores these two extensions).
export function targetFolderForFile(fileName: string): string | null {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  if (ext === ".txt") return getMetadataPatchesPath();
  if (ext === ".pluto") return getScriptsPath();
  return null;
}

// Downloads + installs every file in the given version, updating the
// installed-state tracker. If a different version of this mod is already
// installed, its old files are removed first so switching versions
// doesn't leave stale files from the previous one sitting alongside the
// new ones.
//
// Before writing anything, checks whether the files this install is about
// to write already belong to a *different* installed mod (two cosmetic
// mods for the same slot, say) — via the Rust-side dry-run command, which
// is guaranteed to compute the exact same path the real install would
// (see commands.rs). Throws ModConflictError rather than proceeding,
// unless `force` is set — the caller's job is to catch that specifically
// and offer the user a choice, not to silently overwrite.
export async function installVersion(mod: Mod, version: ModVersion, options?: { force?: boolean }): Promise<string> {
  if (version.files.length === 0) throw new Error("This version has no files");

  const targets = version.files.map((file) => {
    const folder = targetFolderForFile(file.fileName);
    if (!folder) throw new Error(`Set the matching folder in Settings first (for '${file.fileName}')`);
    return { file, folder };
  });

  if (!options?.force && mod.conflictsWithModIds.length > 0) {
    const installedIds = new Set(listInstalled().map((e) => e.modId));
    const conflictingIds = mod.conflictsWithModIds.filter((id) => installedIds.has(id));
    if (conflictingIds.length > 0) {
      const names = await resolveModNames(conflictingIds);
      throw new DeclaredConflictError(conflictingIds.map((id) => names.get(id) ?? id));
    }
  }

  const downloaded = await Promise.all(
    targets.map(async ({ file, folder }) => ({ file, folder, bytes: await downloadModFile(file.downloadUrl) }))
  );

  const wouldBePaths = await Promise.all(downloaded.map(({ file, folder }) => computeInstallFilePath(folder, file.fileName)));
  const conflicts = findConflicts(mod.id, wouldBePaths);
  if (conflicts.length > 0 && !options?.force) {
    throw new ModConflictError(conflicts.map((c) => ({ modName: c.entry.modName, paths: c.paths })));
  }

  const existing = getInstalled(mod.id);
  if (existing && existing.version !== version.version) {
    await uninstallFiles(existing.installedFiles);
  }

  recordDownload(mod.id); // best-effort popularity counter, doesn't block install
  const installedFiles = await Promise.all(
    downloaded.map(({ file, folder, bytes }) => installModFile(bytes, folder, file.fileName))
  );

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

  let requiresNote = "";
  if (mod.requiresModIds.length > 0) {
    const installedIds = new Set(listInstalled().map((e) => e.modId));
    const missingIds = mod.requiresModIds.filter((id) => !installedIds.has(id));
    if (missingIds.length > 0) {
      const names = await resolveModNames(missingIds);
      requiresNote = ` (recommended with: ${missingIds.map((id) => names.get(id) ?? id).join(", ")})`;
    }
  }

  return `Installed ${installedFiles.length} file(s)${requiresNote}`;
}

export async function uninstallMod(modId: string): Promise<void> {
  const entry = getInstalled(modId);
  if (!entry) return;
  await uninstallFiles(entry.installedFiles);
  clearInstalled(modId);
}
