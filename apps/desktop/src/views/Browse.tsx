import { useEffect, useState } from "react";
import type { ModWithVersions } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG, GAME_VERSIONS } from "@openwf-mod-manager/shared";
import { fetchModList } from "../api";
import { canAutoInstall, downloadVersion, installVersion, uninstallMod } from "../modActions";
import { getInstalled } from "../installed";
import { CheckCircleIcon, GridIcon, ListIcon, RefreshIcon, TrashIcon } from "../icons";
import ModDetail from "../components/ModDetail";

type ActionState = { status: "idle" | "working" | "done" | "error"; message?: string };
type ViewMode = "list" | "grid";

const CATEGORY_LABELS: Record<string, string> = {
  "metadata-patch": "Metadata Patch",
  "pluto-script": "Pluto Script",
  other: "Other",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);
const VIEW_MODE_KEY = "owmm.browseViewMode";

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
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [versionFilter, setVersionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [openModId, setOpenModId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? "list"
  );
  // Bumped after every install/uninstall so installed-state badges re-read
  // localStorage instead of going stale after an action.
  const [installedVersion, setInstalledVersion] = useState(0);

  useEffect(() => {
    fetchModList()
      .then(setMods)
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  function toggleCategory(cat: string) {
    setActiveCategories((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

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
    if (activeCategories.size > 0 && !activeCategories.has(m.category)) return false;
    if (versionFilter) {
      const versions = m.versions[0]?.gameVersions ?? [];
      if (!versions.includes(ALL_VERSIONS_TAG) && !versions.includes(versionFilter)) return false;
    }
    if (query && !`${m.name} ${m.description} ${m.author}`.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <div className="browse-layout">
      <aside className="browse-sidebar">
        <div className="sidebar-section">
          <h4 className="sidebar-section__title">Type</h4>
          {CATEGORIES.map((cat) => (
            <label key={cat} className="sidebar-checkbox">
              <input type="checkbox" checked={activeCategories.has(cat)} onChange={() => toggleCategory(cat)} />
              {CATEGORY_LABELS[cat]}
            </label>
          ))}
        </div>

        <div className="sidebar-section">
          <h4 className="sidebar-section__title">Game version</h4>
          <input
            type="text"
            list="browse-version-options"
            className="version-picker__search"
            placeholder="Any version"
            value={versionFilter}
            onChange={(e) => setVersionFilter(e.target.value)}
          />
          <datalist id="browse-version-options">
            {GAME_VERSIONS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          {versionFilter && (
            <button className="tag-filter__chip" onClick={() => setVersionFilter("")}>
              Clear
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="sidebar-section">
            <h4 className="sidebar-section__title">Tags</h4>
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
          </div>
        )}
      </aside>

      <div className="browse-main">
        <div className="browse-toolbar">
          <input
            type="text"
            className="version-picker__search browse-search"
            placeholder="Search mods…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="view-toggle">
            <button
              className={`view-toggle__btn ${viewMode === "list" ? "view-toggle__btn--active" : ""}`}
              onClick={() => changeViewMode("list")}
              title="List view"
            >
              <ListIcon className="btn-icon" />
            </button>
            <button
              className={`view-toggle__btn ${viewMode === "grid" ? "view-toggle__btn--active" : ""}`}
              onClick={() => changeViewMode("grid")}
              title="Grid view"
            >
              <GridIcon className="btn-icon" />
            </button>
          </div>
        </div>

        {visibleMods.length === 0 ? (
          <p className="muted fade-in">No mods match.</p>
        ) : (
          <ul className={`mod-list ${viewMode === "grid" ? "mod-list--grid" : ""}`}>
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
                <li
                  key={mod.id}
                  className={`mod-card fade-in ${viewMode === "grid" ? "mod-card--grid" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                >
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
                        {isUpToDate && (
                          <span className="badge badge--installed">
                            <CheckCircleIcon className="btn-icon" /> Installed
                          </span>
                        )}
                        {version && (
                          <button
                            className={`button ${isUpToDate ? "button--reinstall" : ""}`}
                            disabled={action.status === "working"}
                            onClick={() => (autoInstallable ? handleInstall(mod) : handleDownload(mod))}
                          >
                            {action.status === "working" && <span className="spinner" />}
                            {action.status !== "working" && isUpToDate && <RefreshIcon className="btn-icon" />}
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
                          <button
                            className="button button--danger"
                            disabled={action.status === "working"}
                            onClick={() => handleUninstall(mod)}
                          >
                            <TrashIcon className="btn-icon" /> Uninstall
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
      </div>
    </div>
  );
}
