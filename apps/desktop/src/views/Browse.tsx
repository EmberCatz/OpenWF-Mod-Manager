import { useEffect, useState } from "react";
import type { ModWithVersions } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG } from "@openwf-mod-manager/shared";
import { fetchModList, downloadModFile } from "../api";
import { installModFile, installModZip, pickSaveLocation, writeFileBytes } from "../native";
import { getMetadataPatchesPath, getScriptsPath } from "../settings";

type ActionState = { status: "idle" | "working" | "done" | "error"; message?: string };

const CATEGORY_LABELS: Record<string, string> = {
  "metadata-patch": "Metadata Patch",
  "pluto-script": "Pluto Script",
  other: "Other",
};

function targetFolderFor(category: string): string | null {
  if (category === "metadata-patch") return getMetadataPatchesPath();
  if (category === "pluto-script") return getScriptsPath();
  return null;
}

function formatGameVersions(tags: string[]): string {
  if (tags.length === 0 || tags.includes(ALL_VERSIONS_TAG)) return "All Versions";
  if (tags.length <= 3) return tags.join(", ");
  return `${tags.slice(0, 3).join(", ")} +${tags.length - 3} more`;
}

export default function Browse() {
  const [mods, setMods] = useState<ModWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    fetchModList()
      .then(setMods)
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleInstall(mod: ModWithVersions) {
    const version = mod.versions[0];
    if (!version) return;

    const targetFolder = targetFolderFor(mod.category);
    if (!targetFolder) {
      setActions((s) => ({ ...s, [mod.id]: { status: "error", message: "Set the matching folder in Settings first" } }));
      return;
    }

    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      const bytes = await downloadModFile(version.downloadUrl);
      if (version.fileName.toLowerCase().endsWith(".zip")) {
        const extracted = await installModZip(bytes, targetFolder);
        setActions((s) => ({ ...s, [mod.id]: { status: "done", message: `Installed ${extracted.length} file(s)` } }));
      } else {
        await installModFile(bytes, targetFolder, version.fileName);
        setActions((s) => ({ ...s, [mod.id]: { status: "done", message: "Installed" } }));
      }
    } catch (e) {
      setActions((s) => ({ ...s, [mod.id]: { status: "error", message: String(e) } }));
    }
  }

  async function handleDownload(mod: ModWithVersions) {
    const version = mod.versions[0];
    if (!version) return;

    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      const savePath = await pickSaveLocation(version.fileName);
      if (!savePath) {
        setActions((s) => ({ ...s, [mod.id]: { status: "idle" } }));
        return;
      }
      const bytes = await downloadModFile(version.downloadUrl);
      await writeFileBytes(savePath, bytes);
      setActions((s) => ({ ...s, [mod.id]: { status: "done", message: "Saved" } }));
    } catch (e) {
      setActions((s) => ({ ...s, [mod.id]: { status: "error", message: String(e) } }));
    }
  }

  if (loading) return <p><span className="spinner" /> Loading mods…</p>;
  if (loadError) return <p className="error">{loadError}</p>;
  if (mods.length === 0) return <p className="muted fade-in">No mods yet — check back soon.</p>;

  const allTags = [...new Set(mods.flatMap((m) => m.tags))].sort();
  const visibleMods = activeTag ? mods.filter((m) => m.tags.includes(activeTag)) : mods;

  return (
    <>
      {allTags.length > 0 && (
        <div className="tag-filter">
          {allTags.map((t) => (
            <button
              key={t}
              className={`tag-filter__chip ${activeTag === t ? "tag-filter__chip--active" : ""}`}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {visibleMods.length === 0 ? (
        <p className="muted fade-in">No mods tagged "{activeTag}".</p>
      ) : (
        <ul className="mod-list">
          {visibleMods.map((mod, i) => {
            const version = mod.versions[0];
            const action = actions[mod.id] ?? { status: "idle" };
            const canAutoInstall = mod.category === "metadata-patch" || mod.category === "pluto-script";

            return (
              <li key={mod.id} className="mod-card fade-in" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                <div className="mod-card__body">
                  {mod.thumbnailUrl && <img className="mod-card__thumb" src={mod.thumbnailUrl} alt="" />}
                  <div className="mod-card__main">
                    <div className="mod-card__header">
                      <span className="mod-card__name">{mod.name}</span>
                      <span className="mod-card__author">by {mod.author}</span>
                    </div>
                    <p className="mod-card__description">{mod.description}</p>
                    {mod.tags.length > 0 && (
                      <div className="mod-card__tags">
                        {mod.tags.map((t) => (
                          <button key={t} className="badge badge--tag" onClick={() => setActiveTag(t)}>
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mod-card__footer">
                      <span className="badge">{CATEGORY_LABELS[mod.category] ?? mod.category}</span>
                      <span className="mod-card__version">{version ? `v${version.version}` : "no versions yet"}</span>
                      {version && <span className="muted">{formatGameVersions(version.gameVersions)}</span>}
                      {version && (
                        <button
                          className="button"
                          disabled={action.status === "working"}
                          onClick={() => (canAutoInstall ? handleInstall(mod) : handleDownload(mod))}
                        >
                          {action.status === "working" && <span className="spinner" />}
                          {action.status === "working" ? "Working…" : canAutoInstall ? "Install" : "Download"}
                        </button>
                      )}
                      {action.message && (
                        <span className={`fade-in ${action.status === "error" ? "error" : "muted"}`}>{action.message}</span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
