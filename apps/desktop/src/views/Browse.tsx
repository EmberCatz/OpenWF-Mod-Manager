import { useEffect, useState } from "react";
import type { ModWithVersions } from "@openwf-mod-manager/shared";
import { fetchModList, downloadModZip } from "../api";
import { installModZip, pickSaveLocation, writeFileBytes } from "../native";
import { getInstallRoot } from "../settings";

type ActionState = { status: "idle" | "working" | "done" | "error"; message?: string };

const CATEGORY_LABELS: Record<string, string> = {
  "metadata-patch": "Metadata Patch",
  "pluto-script": "Pluto Script",
  other: "Other",
};

export default function Browse() {
  const [mods, setMods] = useState<ModWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, ActionState>>({});

  useEffect(() => {
    fetchModList()
      .then(setMods)
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleInstall(mod: ModWithVersions) {
    const version = mod.versions[0];
    if (!version) return;

    const installRoot = getInstallRoot();
    if (!installRoot) {
      setActions((s) => ({ ...s, [mod.id]: { status: "error", message: "Set your install folder in Settings first" } }));
      return;
    }

    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      const bytes = await downloadModZip(version.downloadUrl);
      const extracted = await installModZip(bytes, installRoot, mod.category);
      setActions((s) => ({ ...s, [mod.id]: { status: "done", message: `Installed ${extracted.length} file(s)` } }));
    } catch (e) {
      setActions((s) => ({ ...s, [mod.id]: { status: "error", message: String(e) } }));
    }
  }

  async function handleDownload(mod: ModWithVersions) {
    const version = mod.versions[0];
    if (!version) return;

    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      const suggestedName = `${mod.id}-${version.version}.zip`;
      const savePath = await pickSaveLocation(suggestedName);
      if (!savePath) {
        setActions((s) => ({ ...s, [mod.id]: { status: "idle" } }));
        return;
      }
      const bytes = await downloadModZip(version.downloadUrl);
      await writeFileBytes(savePath, bytes);
      setActions((s) => ({ ...s, [mod.id]: { status: "done", message: "Saved" } }));
    } catch (e) {
      setActions((s) => ({ ...s, [mod.id]: { status: "error", message: String(e) } }));
    }
  }

  if (loading) return <p>Loading mods…</p>;
  if (loadError) return <p className="error">{loadError}</p>;
  if (mods.length === 0) return <p className="muted">No mods yet — check back soon.</p>;

  return (
    <ul className="mod-list">
      {mods.map((mod) => {
        const version = mod.versions[0];
        const action = actions[mod.id] ?? { status: "idle" };
        const canAutoInstall = mod.category === "metadata-patch" || mod.category === "pluto-script";

        return (
          <li key={mod.id} className="mod-card">
            <div className="mod-card__header">
              <span className="mod-card__name">{mod.name}</span>
              <span className="mod-card__author">by {mod.author}</span>
            </div>
            <p className="mod-card__description">{mod.description}</p>
            <div className="mod-card__footer">
              <span className="badge">{CATEGORY_LABELS[mod.category] ?? mod.category}</span>
              <span className="mod-card__version">{version ? `v${version.version}` : "no versions yet"}</span>
              {version && (
                <button
                  className="button"
                  disabled={action.status === "working"}
                  onClick={() => (canAutoInstall ? handleInstall(mod) : handleDownload(mod))}
                >
                  {action.status === "working" ? "Working…" : canAutoInstall ? "Install" : "Download"}
                </button>
              )}
              {action.message && (
                <span className={action.status === "error" ? "error" : "muted"}>{action.message}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
