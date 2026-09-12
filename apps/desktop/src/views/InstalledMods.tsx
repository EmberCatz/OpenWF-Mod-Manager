import { useEffect, useState } from "react";
import type { ModWithVersions } from "@openwf-mod-manager/shared";
import { fetchModList } from "../api";
import { installVersion, uninstallMod } from "../modActions";
import { listInstalled, type InstalledEntry } from "../installed";
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

// The one place that answers "what am I running, and is any of it stale" —
// installed.ts and each mod's own version history both already existed,
// but nothing before this cross-referenced them across every installed mod
// at once (see TODO.md § Update notifications for installed mods).
export default function InstalledMods() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function load() {
    setError(null);
    fetchModList()
      .then((mods) => {
        const byId = new Map(mods.map((m) => [m.id, m]));
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

  if (rows === null && !error) {
    return (
      <p>
        <span className="spinner" /> Checking installed mods…
      </p>
    );
  }
  if (error) return <p className="error">{error}</p>;
  if (!rows || rows.length === 0) {
    return <p className="muted fade-in">Nothing installed yet — head to Browse to find something.</p>;
  }

  const outdatedCount = rows.filter((r) => r.isOutdated).length;

  return (
    <div className="fade-in">
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
    </div>
  );
}
