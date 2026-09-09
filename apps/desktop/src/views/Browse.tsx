import { useEffect, useState } from "react";
import type { ModWithVersions } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG } from "@openwf-mod-manager/shared";
import { fetchModList } from "../api";
import { canAutoInstall, downloadVersion, installVersion, uninstallMod } from "../modActions";
import { getInstalled } from "../installed";
import ModDetail from "../components/ModDetail";

type ActionState = { status: "idle" | "working" | "done" | "error"; message?: string };

const CATEGORY_LABELS: Record<string, string> = {
  "metadata-patch": "Metadata Patch",
  "pluto-script": "Pluto Script",
  other: "Other",
};

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
  const [search, setSearch] = useState("");
  const [openModId, setOpenModId] = useState<string | null>(null);
  // Bumped after every install/uninstall so installed-state badges re-read
  // localStorage instead of going stale after an action.
  const [installedVersion, setInstalledVersion] = useState(0);

  useEffect(() => {
    fetchModList()
      .then(setMods)
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleInstall(mod: ModWithVersions) {
    const version = mod.versions[0];
    if (!version) return;
    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      const message = await installVersion(mod, version);
      setActions((s) => ({ ...s, [mod.id]: { status: "done", message } }));
      setInstalledVersion((v) => v + 1);
    } catch (e) {
      setActions((s) => ({ ...s, [mod.id]: { status: "error", message: String(e) } }));
    }
  }

  async function handleDownload(mod: ModWithVersions) {
    const version = mod.versions[0];
    if (!version) return;
    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      const message = await downloadVersion(version);
      setActions((s) => ({ ...s, [mod.id]: message ? { status: "done", message } : { status: "idle" } }));
    } catch (e) {
      setActions((s) => ({ ...s, [mod.id]: { status: "error", message: String(e) } }));
    }
  }

  async function handleUninstall(mod: ModWithVersions) {
    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      await uninstallMod(mod.id);
      setActions((s) => ({ ...s, [mod.id]: { status: "done", message: "Uninstalled" } }));
      setInstalledVersion((v) => v + 1);
    } catch (e) {
      setActions((s) => ({ ...s, [mod.id]: { status: "error", message: String(e) } }));
    }
  }

  if (openModId) {
    return (
      <ModDetail
        modId={openModId}
        onBack={() => setOpenModId(null)}
        onChanged={() => setInstalledVersion((v) => v + 1)}
      />
    );
  }

  if (loading) return <p><span className="spinner" /> Loading mods…</p>;
  if (loadError) return <p className="error">{loadError}</p>;
  if (mods.length === 0) return <p className="muted fade-in">No mods yet — check back soon.</p>;

  const allTags = [...new Set(mods.flatMap((m) => m.tags))].sort();
  const query = search.trim().toLowerCase();
  const visibleMods = mods.filter((m) => {
    if (activeTag && !m.tags.includes(activeTag)) return false;
    if (query && !`${m.name} ${m.description} ${m.author}`.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <>
      <input
        type="text"
        className="version-picker__search browse-search"
        placeholder="Search mods…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
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
        <p className="muted fade-in">No mods match.</p>
      ) : (
        <ul className="mod-list">
          {visibleMods.map((mod, i) => {
            const version = mod.versions[0];
            const action = actions[mod.id] ?? { status: "idle" };
            const autoInstallable = canAutoInstall(mod.category);
            // installedVersion isn't read here directly, but bumping it via
            // setInstalledVersion() after install/uninstall still triggers
            // this component to re-render, which re-reads localStorage below.
            const installedEntry = getInstalled(mod.id);
            const isUpToDate = !!installedEntry && !!version && installedEntry.version === version.version;

            return (
              <li key={mod.id} className="mod-card fade-in" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                <div className="mod-card__body">
                  {mod.thumbnailUrl && <img className="mod-card__thumb" src={mod.thumbnailUrl} alt="" />}
                  <div className="mod-card__main">
                    <div className="mod-card__header">
                      <button className="mod-card__name mod-card__name--link" onClick={() => setOpenModId(mod.id)}>
                        {mod.name}
                      </button>
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
                      {isUpToDate && <span className="badge badge--installed">Installed</span>}
                      {version && (
                        <button
                          className="button"
                          disabled={action.status === "working"}
                          onClick={() => (autoInstallable ? handleInstall(mod) : handleDownload(mod))}
                        >
                          {action.status === "working" && <span className="spinner" />}
                          {action.status === "working"
                            ? "Working…"
                            : autoInstallable
                              ? isUpToDate
                                ? "Reinstall"
                                : installedEntry
                                  ? "Update"
                                  : "Install"
                              : "Download"}
                        </button>
                      )}
                      {autoInstallable && installedEntry && (
                        <button className="button" disabled={action.status === "working"} onClick={() => handleUninstall(mod)}>
                          Uninstall
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
