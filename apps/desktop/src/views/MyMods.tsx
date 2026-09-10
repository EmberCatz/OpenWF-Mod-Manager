import { useEffect, useState } from "react";
import type { Mod, ModWithVersions } from "@openwf-mod-manager/shared";
import { deleteMod, deleteModVersion, fetchMyMods } from "../api";
import { getApiKey } from "../settings";
import { TrashIcon } from "../icons";
import { toast } from "../toast";
import EditModForm from "../components/EditModForm";

// "Mine" resolves through whatever's in Settings — a self-service account
// session or an older API key, both work the same way here (see
// docs/architecture.md § Accounts).
export default function MyMods() {
  const apiKey = getApiKey();
  const [mods, setMods] = useState<ModWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingModId, setConfirmingModId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingModId, setEditingModId] = useState<string | null>(null);

  function load() {
    if (!apiKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMyMods(apiKey)
      .then(setMods)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [apiKey]);

  async function handleDeleteMod(modId: string) {
    if (!apiKey) return;
    setBusyKey(modId);
    try {
      await deleteMod(modId, apiKey);
      setMods((m) => m.filter((mod) => mod.id !== modId));
      setConfirmingModId(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyKey(null);
    }
  }

  function handleSaved(updated: Mod) {
    setMods((m) => m.map((mod) => (mod.id === updated.id ? { ...mod, ...updated } : mod)));
    setEditingModId(null);
  }

  async function handleDeleteVersion(modId: string, version: string) {
    if (!apiKey) return;
    const key = `${modId}@${version}`;
    setBusyKey(key);
    try {
      await deleteModVersion(modId, version, apiKey);
      setMods((m) => m.map((mod) => (mod.id === modId ? { ...mod, versions: mod.versions.filter((v) => v.version !== version) } : mod)));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyKey(null);
    }
  }

  if (!apiKey) {
    return <p className="muted">Set your API key in Settings to see the mods you've uploaded.</p>;
  }
  if (loading) return <p><span className="spinner" /> Loading your mods…</p>;
  if (error) return <p className="error">{error}</p>;
  if (mods.length === 0) return <p className="muted fade-in">You haven't uploaded anything yet — try the Upload tab.</p>;

  return (
    <ul className="mod-list">
      {mods.map((mod) => (
        <li key={mod.id} className="mod-card fade-in">
          <div className="mod-card__header">
            <span className="mod-card__name">{mod.name}</span>
            <span className="mod-card__author">{mod.versions.length} version{mod.versions.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="my-mods__versions">
            {mod.versions.map((v) => (
              <li key={v.id} className="my-mods__version-row">
                <span>v{v.version}</span>
                <span className="muted">{new Date(v.createdAt).toLocaleDateString()}</span>
                <button
                  className="button button--danger my-mods__version-delete"
                  disabled={busyKey === `${mod.id}@${v.version}`}
                  onClick={() => handleDeleteVersion(mod.id, v.version)}
                >
                  <TrashIcon className="btn-icon" /> Delete version
                </button>
              </li>
            ))}
          </ul>

          {editingModId === mod.id ? (
            <EditModForm mod={mod} apiKey={apiKey} onSaved={handleSaved} onCancel={() => setEditingModId(null)} />
          ) : (
            <div className="field__row">
              <button className="button" onClick={() => setEditingModId(mod.id)}>
                Edit
              </button>
              {confirmingModId === mod.id ? (
                <>
                  <span className="error">Delete '{mod.name}' and every version? This can't be undone.</span>
                  <button className="button button--danger" disabled={busyKey === mod.id} onClick={() => handleDeleteMod(mod.id)}>
                    Confirm delete
                  </button>
                  <button className="button" onClick={() => setConfirmingModId(null)}>Cancel</button>
                </>
              ) : (
                <button className="button button--danger" onClick={() => setConfirmingModId(mod.id)}>
                  <TrashIcon className="btn-icon" /> Delete mod
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
