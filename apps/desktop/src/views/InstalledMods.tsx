import { useEffect, useState } from "react";
import type { ModVersion, ModWithVersions } from "@openwf-mod-manager/shared";
import { fetchModList } from "../api";
import { installVersion, uninstallMod } from "../modActions";
import { getIgnoredOrphans, ignoreOrphan, listInstalled, setInstalled, type InstalledEntry } from "../installed";
import { getMetadataPatchesPath, getScriptsPath } from "../settings";
import { scanInstallFolder, uninstallFiles } from "../native";
import { CheckCircleIcon, RefreshIcon, TrashIcon } from "../icons";
import { toast } from "../toast";

type ActionState = { status: "idle" | "working" };

interface Row {
  entry: InstalledEntry;
  // null once a mod has been deleted from the server since it was installed
  // — still listed (so it can be uninstalled), just with no update path.
  mod: ModWithVersions | null;
  isOutdated: boolean;
}

interface OrphanFile {
  path: string;
  folderLabel: string;
  // Best-effort guess at what this file actually is, by matching its exact
  // filename against every known mod's latest-version fileName. Only ever
  // finds raw single-file mods this way (a zip's own fileName is the zip's
  // name, not the names of what's inside it, so extracted zip contents
  // never match) — good enough for the common case, see modActions.ts.
  match: { mod: ModWithVersions; version: ModVersion } | null;
}

type OrphanState = "idle" | "scanning" | { files: OrphanFile[] };

// The one place that answers "what am I running, and is any of it stale" —
// installed.ts and each mod's own version history both already existed,
// but nothing before this cross-referenced them across every installed mod
// at once (see TODO.md § Update notifications for installed mods).
export default function InstalledMods() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [modsById, setModsById] = useState<Map<string, ModWithVersions>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [orphanState, setOrphanState] = useState<OrphanState>("idle");
  const [orphanBusy, setOrphanBusy] = useState<string | null>(null);

  function load() {
    setError(null);
    fetchModList()
      .then((mods) => {
        const byId = new Map(mods.map((m) => [m.id, m]));
        setModsById(byId);
        const built = listInstalled().map((entry): Row => {
          const mod = byId.get(entry.modId) ?? null;
          const latest = mod?.versions[0];
          return { entry, mod, isOutdated: !!latest && latest.version !== entry.version };
        });
        // Outdated first (the whole point of surfacing this view), then
        // alphabetical within each group.
        built.sort((a, b) => Number(b.isOutdated) - Number(a.isOutdated) || a.entry.modName.localeCompare(b.entry.modName));
        setRows(built);
      })
      .catch((e) => setError(String(e)));
  }

  useEffect(load, [refreshKey]);

  async function handleUpdateOrReinstall(row: Row) {
    const version = row.mod?.versions[0];
    if (!row.mod || !version) return;
    setActions((s) => ({ ...s, [row.entry.modId]: { status: "working" } }));
    try {
      const message = await installVersion(row.mod, version);
      toast.success(`${row.mod.name}: ${message}`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActions((s) => ({ ...s, [row.entry.modId]: { status: "idle" } }));
    }
  }

  async function handleUninstall(row: Row) {
    setActions((s) => ({ ...s, [row.entry.modId]: { status: "working" } }));
    try {
      await uninstallMod(row.entry.modId);
      toast.success(`${row.entry.modName}: Uninstalled`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActions((s) => ({ ...s, [row.entry.modId]: { status: "idle" } }));
    }
  }

  async function handleUpdateAll() {
    if (!rows) return;
    setBulkBusy(true);
    try {
      // Sequential, not parallel — same reasoning as one-at-a-time installs
      // elsewhere: several concurrent downloads+extractions competing for
      // the same install folder isn't worth the speedup.
      for (const row of rows) {
        if (row.isOutdated && row.mod) await handleUpdateOrReinstall(row);
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleScanOrphans() {
    const folders = [
      { path: getMetadataPatchesPath(), label: "Metadata Patches" },
      { path: getScriptsPath(), label: "Scripts" },
    ].filter((f): f is { path: string; label: string } => !!f.path);

    if (folders.length === 0) {
      toast.error("Set your install folders in Settings first");
      return;
    }

    setOrphanState("scanning");
    try {
      const tracked = new Set(listInstalled().flatMap((e) => e.installedFiles));
      const ignored = new Set(getIgnoredOrphans());

      const perFolder = await Promise.all(
        folders.map(async (f) => ({ label: f.label, paths: await scanInstallFolder(f.path) }))
      );

      const files: OrphanFile[] = perFolder
        .flatMap((f) => f.paths.map((path) => ({ path, folderLabel: f.label })))
        .filter((f) => !tracked.has(f.path) && !ignored.has(f.path))
        .map((f) => {
          const baseName = f.path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
          let match: OrphanFile["match"] = null;
          for (const mod of modsById.values()) {
            const version = mod.versions[0];
            if (version && version.fileName.toLowerCase() === baseName) {
              match = { mod, version };
              break;
            }
          }
          return { ...f, match };
        });

      setOrphanState({ files });
    } catch (e) {
      toast.error(String(e));
      setOrphanState("idle");
    }
  }

  function removeOrphanFromView(path: string) {
    setOrphanState((s) => (typeof s === "object" ? { files: s.files.filter((f) => f.path !== path) } : s));
  }

  async function handleAdoptOrphan(file: OrphanFile) {
    if (!file.match) return;
    setOrphanBusy(file.path);
    try {
      setInstalled({
        modId: file.match.mod.id,
        modName: file.match.mod.name,
        version: file.match.version.version,
        installedFiles: [file.path],
        installedAt: new Date().toISOString(),
      });
      toast.success(`Adopted as ${file.match.mod.name} v${file.match.version.version}`);
      removeOrphanFromView(file.path);
      setRefreshKey((k) => k + 1);
    } finally {
      setOrphanBusy(null);
    }
  }

  async function handleRemoveOrphan(file: OrphanFile) {
    setOrphanBusy(file.path);
    try {
      await uninstallFiles([file.path]);
      toast.success("File removed");
      removeOrphanFromView(file.path);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setOrphanBusy(null);
    }
  }

  function handleIgnoreOrphan(file: OrphanFile) {
    ignoreOrphan(file.path);
    removeOrphanFromView(file.path);
  }

  if (rows === null && !error) {
    return (
      <p>
        <span className="spinner" /> Checking installed mods…
      </p>
    );
  }
  if (error) return <p className="error">{error}</p>;
  if (!rows) return null;

  const outdatedCount = rows.filter((r) => r.isOutdated).length;

  return (
    <div className="fade-in">
      {rows.length === 0 && <p className="muted">Nothing installed yet — head to Browse to find something.</p>}

      {outdatedCount > 0 && (
        <div className="installed-mods__banner">
          <span>
            {outdatedCount} of {rows.length} installed mod{rows.length === 1 ? "" : "s"}{" "}
            {outdatedCount === 1 ? "has" : "have"} an update available.
          </span>
          <button className="button button--update" disabled={bulkBusy} onClick={handleUpdateAll}>
            {bulkBusy && <span className="spinner" />} Update all
          </button>
        </div>
      )}

      {rows.length > 0 && (
      <ul className="mod-list">
        {rows.map((row) => {
          const working = actions[row.entry.modId]?.status === "working";
          const latest = row.mod?.versions[0];
          return (
            <li key={row.entry.modId} className="mod-card fade-in">
              <div className="mod-card__header">
                <span className="mod-card__name">{row.entry.modName}</span>
                {row.isOutdated ? (
                  <span className="badge badge--update">Update available</span>
                ) : row.mod ? (
                  <span className="badge badge--installed">
                    <CheckCircleIcon className="btn-icon" /> Up to date
                  </span>
                ) : (
                  <span className="badge">No longer available</span>
                )}
              </div>
              <p className="hint">
                Installed v{row.entry.version}
                {row.isOutdated && latest && ` — latest v${latest.version}`} · installed{" "}
                {new Date(row.entry.installedAt).toLocaleDateString()}
              </p>
              <div className="field__row">
                {row.isOutdated && latest ? (
                  <>
                    <button className="button button--update" disabled={working} onClick={() => handleUpdateOrReinstall(row)}>
                      {working && <span className="spinner" />} Update
                    </button>
                    <button className="button button--danger" disabled={working} onClick={() => handleUninstall(row)}>
                      <TrashIcon className="btn-icon" /> Uninstall
                    </button>
                  </>
                ) : latest ? (
                  <>
                    <button className="button" disabled={working} onClick={() => handleUpdateOrReinstall(row)}>
                      {working && <span className="spinner" />} <RefreshIcon className="btn-icon" /> Reinstall
                    </button>
                    <button className="button button--danger" disabled={working} onClick={() => handleUninstall(row)}>
                      <TrashIcon className="btn-icon" /> Uninstall
                    </button>
                  </>
                ) : (
                  <button className="button button--danger" disabled={working} onClick={() => handleUninstall(row)}>
                    {working && <span className="spinner" />} <TrashIcon className="btn-icon" /> Uninstall
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      )}

      <div className="installed-mods__orphans">
        <h4 className="sidebar-section__title">Orphaned files</h4>
        <p className="hint">
          Files sitting in your Metadata Patches/Scripts folders that this app didn't install — dropped in manually
          before you started using it, say. Scan to find them, then adopt (if a known mod matches by filename),
          remove, or ignore each one.
        </p>
        <button className="button" disabled={orphanState === "scanning"} onClick={handleScanOrphans}>
          {orphanState === "scanning" && <span className="spinner" />}{" "}
          {typeof orphanState === "object" ? "Scan again" : "Scan for orphaned files"}
        </button>

        {typeof orphanState === "object" &&
          (orphanState.files.length === 0 ? (
            <p className="muted">No orphaned files found.</p>
          ) : (
            <ul className="mod-list">
              {orphanState.files.map((file) => {
                const busy = orphanBusy === file.path;
                const baseName = file.path.split(/[\\/]/).pop() ?? file.path;
                return (
                  <li key={file.path} className="mod-card fade-in">
                    <div className="mod-card__header">
                      <span className="mod-card__name" title={file.path}>
                        {baseName}
                      </span>
                      <span className="badge">{file.folderLabel}</span>
                    </div>
                    {file.match && (
                      <p className="hint">
                        Looks like <strong>{file.match.mod.name}</strong> v{file.match.version.version} (best guess
                        by filename — double-check before relying on it).
                      </p>
                    )}
                    <div className="field__row">
                      {file.match && (
                        <button className="button button--install" disabled={busy} onClick={() => handleAdoptOrphan(file)}>
                          {busy && <span className="spinner" />} Adopt
                        </button>
                      )}
                      <button className="button button--danger" disabled={busy} onClick={() => handleRemoveOrphan(file)}>
                        {busy && <span className="spinner" />} <TrashIcon className="btn-icon" /> Remove
                      </button>
                      <button className="button" disabled={busy} onClick={() => handleIgnoreOrphan(file)}>
                        Ignore
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </div>
  );
}
