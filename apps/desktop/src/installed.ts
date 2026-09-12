// Tracks which mods are installed where, purely locally (localStorage) —
// the server has no concept of "installed", that's entirely a desktop-app
// state. One entry per mod: the version currently on disk and the exact
// absolute paths that were written, so uninstall knows precisely what to
// remove without having to re-derive it from current Settings (which may
// have changed since install time).

export interface InstalledEntry {
  modId: string;
  modName: string;
  version: string;
  installedFiles: string[]; // absolute paths
  installedAt: string; // ISO 8601
}

const KEY = "owmm.installed";

function readAll(): Record<string, InstalledEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeAll(entries: Record<string, InstalledEntry>): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function getInstalled(modId: string): InstalledEntry | null {
  return readAll()[modId] ?? null;
}

export function setInstalled(entry: InstalledEntry): void {
  const all = readAll();
  all[entry.modId] = entry;
  writeAll(all);
}

export function clearInstalled(modId: string): void {
  const all = readAll();
  delete all[modId];
  writeAll(all);
}

export function listInstalled(): InstalledEntry[] {
  return Object.values(readAll());
}

// Files an orphan-scan found but the user chose to leave alone (their own
// unrelated script sitting in the same folder, say) — remembered so they
// don't keep resurfacing on every future scan. Separate localStorage key
// from the installed-entries map above since these were deliberately never
// "installed" by this app and never will be.
const IGNORED_ORPHANS_KEY = "owmm.ignoredOrphans";

export function getIgnoredOrphans(): string[] {
  try {
    return JSON.parse(localStorage.getItem(IGNORED_ORPHANS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function ignoreOrphan(path: string): void {
  const all = new Set(getIgnoredOrphans());
  all.add(path);
  localStorage.setItem(IGNORED_ORPHANS_KEY, JSON.stringify([...all]));
}
