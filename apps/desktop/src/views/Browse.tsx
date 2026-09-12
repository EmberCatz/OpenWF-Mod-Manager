import { useEffect, useState } from "react";
import type { ModVersion, ModWithVersions } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG, DEFAULT_MOD_THEMES } from "@openwf-mod-manager/shared";
import { fetchModList } from "../api";
import { canAutoInstall, downloadVersion, installVersion, ModConflictError, uninstallMod } from "../modActions";
import { getInstalled } from "../installed";
import { CheckCircleIcon, CommentIcon, DownloadIcon, GridIcon, ListIcon, RefreshIcon, TrashIcon } from "../icons";
import { toast } from "../toast";
import ModDetail from "../components/ModDetail";
import SplitButton from "../components/SplitButton";
import { useConflictConfirm } from "../components/ConflictConfirmDialog";
import StarRating from "../components/StarRating";
import ClampedText from "../components/ClampedText";
import GameVersionPicker from "../components/GameVersionPicker";
import AuthorLink from "../components/AuthorLink";
import defaultThumbnail from "../assets/thumbnails/default-thumbnail.jpg";

type ActionState = { status: "idle" | "working" };
type ViewMode = "list" | "grid";
type SortKey = "downloads" | "name" | "new" | "updated" | "score";

const CATEGORY_LABELS: Record<string, string> = {
  "metadata-patch": "Metadata Patch",
  "pluto-script": "Pluto Script",
  other: "Other",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);
const VIEW_MODE_KEY = "owmm.browseViewMode";
const SORT_KEY_STORAGE = "owmm.browseSortKey";
const PAGE_SIZE_STORAGE = "owmm.browsePageSize";

const SORT_LABELS: Record<SortKey, string> = {
  downloads: "Most downloads",
  score: "Highest rated",
  new: "Newest",
  updated: "Recently updated",
  name: "Name (A–Z)",
};
const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

// Shown in grid view when a mod has no thumbnailUrl, so every card gets
// the same picture-above-title layout. Bundled with the app itself (see
// src/assets/README.md) — distinct from mod thumbnails, which stay
// external-link-only (see docs/architecture.md).
const DEFAULT_THUMBNAIL_URL = defaultThumbnail;

function formatGameVersions(tags: string[]): string {
  if (tags.length === 0 || tags.includes(ALL_VERSIONS_TAG)) return "All Versions";
  if (tags.length <= 3) return tags.join(", ");
  return `${tags.slice(0, 3).join(", ")} +${tags.length - 3} more`;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

// Shows the update date once a mod has actually been changed since its
// initial upload, otherwise the original upload date.
function formatModDate(mod: ModWithVersions): string {
  const updated = new Date(mod.updatedAt).getTime();
  const created = new Date(mod.createdAt).getTime();
  const isUpdated = updated > created;
  const label = isUpdated ? "Updated" : "Uploaded";
  const date = new Date(isUpdated ? mod.updatedAt : mod.createdAt).toLocaleDateString();
  return `${label} ${date}`;
}

function sortMods(mods: ModWithVersions[], key: SortKey): ModWithVersions[] {
  const sorted = [...mods];
  switch (key) {
    case "downloads":
      return sorted.sort((a, b) => b.downloadCount - a.downloadCount);
    case "score":
      return sorted.sort((a, b) => b.averageRating - a.averageRating);
    case "new":
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case "updated":
      return sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
}

export default function Browse() {
  const [mods, setMods] = useState<ModWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [activeThemes, setActiveThemes] = useState<Set<string>>(new Set());
  const [versionFilter, setVersionFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [openModId, setOpenModId] = useState<string | null>(null);
  // Mod ids whose thumbnailUrl failed to actually load (dead link, or a
  // page URL rather than a direct image URL) — treated the same as "no
  // thumbnail" rather than showing a broken-image icon.
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? "list"
  );
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (localStorage.getItem(SORT_KEY_STORAGE) as SortKey | null) ?? "downloads"
  );
  const [pageSize, setPageSize] = useState<number>(
    () => Number(localStorage.getItem(PAGE_SIZE_STORAGE)) || 20
  );
  const [page, setPage] = useState(1);
  // Bumped after every install/uninstall so installed-state badges re-read
  // localStorage instead of going stale after an action.
  const [installedVersion, setInstalledVersion] = useState(0);
  const { requestConfirm, modal: conflictModal } = useConflictConfirm();

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

  function changeSortKey(key: SortKey) {
    setSortKey(key);
    localStorage.setItem(SORT_KEY_STORAGE, key);
    setPage(1);
  }

  function changePageSize(size: number) {
    setPageSize(size);
    localStorage.setItem(PAGE_SIZE_STORAGE, String(size));
    setPage(1);
  }

  function markThumbBroken(modId: string) {
    setBrokenThumbs((s) => (s.has(modId) ? s : new Set(s).add(modId)));
  }

  function toggleCategory(cat: string) {
    setActiveCategories((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    setPage(1);
  }

  function toggleTheme(theme: string) {
    setActiveThemes((s) => {
      const next = new Set(s);
      if (next.has(theme)) next.delete(theme);
      else next.add(theme);
      return next;
    });
    setPage(1);
  }

  async function performInstall(mod: ModWithVersions, version: ModVersion, force: boolean) {
    const message = await installVersion(mod, version, { force });
    toast.success(`${mod.name}: ${message}`);
    setInstalledVersion((v) => v + 1);
  }

  async function handleInstall(mod: ModWithVersions) {
    const version = mod.versions[0];
    if (!version) return;
    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      await performInstall(mod, version, false);
    } catch (e) {
      if (e instanceof ModConflictError) {
        if (await requestConfirm(e.conflicts)) {
          try {
            await performInstall(mod, version, true);
          } catch (e2) {
            toast.error(String(e2));
          }
        }
      } else {
        toast.error(String(e));
      }
    } finally {
      setActions((s) => ({ ...s, [mod.id]: { status: "idle" } }));
    }
  }

  async function handleDownload(mod: ModWithVersions) {
    const version = mod.versions[0];
    if (!version) return;
    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      const message = await downloadVersion(version);
      if (message) toast.success(`${mod.name}: ${message}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActions((s) => ({ ...s, [mod.id]: { status: "idle" } }));
    }
  }

  async function handleUninstall(mod: ModWithVersions) {
    setActions((s) => ({ ...s, [mod.id]: { status: "working" } }));
    try {
      await uninstallMod(mod.id);
      toast.success(`${mod.name}: Uninstalled`);
      setInstalledVersion((v) => v + 1);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActions((s) => ({ ...s, [mod.id]: { status: "idle" } }));
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
  const allThemes = [...new Set([...DEFAULT_MOD_THEMES, ...mods.map((m) => m.theme).filter(Boolean)])].sort();
  const isAnyVersion = versionFilter.length === 0 || versionFilter.includes(ALL_VERSIONS_TAG);
  const query = search.trim().toLowerCase();
  const visibleMods = mods.filter((m) => {
    if (activeTag && !m.tags.includes(activeTag)) return false;
    if (activeCategories.size > 0 && !activeCategories.has(m.category)) return false;
    if (activeThemes.size > 0 && !activeThemes.has(m.theme)) return false;
    if (!isAnyVersion) {
      const versions = m.versions[0]?.gameVersions ?? [];
      if (!versions.includes(ALL_VERSIONS_TAG) && !versions.some((v) => versionFilter.includes(v))) return false;
    }
    if (query && !`${m.name} ${m.description} ${m.author}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const sortedMods = sortMods(visibleMods, sortKey);
  const totalPages = Math.max(1, Math.ceil(sortedMods.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageMods = sortedMods.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      {conflictModal}
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
          <h4 className="sidebar-section__title">Category</h4>
          {allThemes.map((theme) => (
            <label key={theme} className="sidebar-checkbox">
              <input type="checkbox" checked={activeThemes.has(theme)} onChange={() => toggleTheme(theme)} />
              {theme}
            </label>
          ))}
        </div>

        <div className="sidebar-section">
          <h4 className="sidebar-section__title">Game version</h4>
          <GameVersionPicker
            selected={versionFilter}
            onChange={(v) => {
              setVersionFilter(v);
              setPage(1);
            }}
            allLabel="Any version"
          />
        </div>

        {allTags.length > 0 && (
          <div className="sidebar-section">
            <h4 className="sidebar-section__title">Tags</h4>
            <div className="tag-filter">
              {allTags.map((t) => (
                <button
                  key={t}
                  className={`tag-filter__chip ${activeTag === t ? "tag-filter__chip--active" : ""}`}
                  onClick={() => {
                    setActiveTag(activeTag === t ? null : t);
                    setPage(1);
                  }}
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
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <div className="browse-toolbar__controls">
            <select
              className="browse-toolbar__sort"
              value={sortKey}
              onChange={(e) => changeSortKey(e.target.value as SortKey)}
              title="Sort by"
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  Sort: {SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <select
              className="browse-toolbar__page-size"
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              title="Mods per page"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
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
        </div>

        {sortedMods.length === 0 ? (
          <p className="muted fade-in">No mods match.</p>
        ) : (
          <>
            <ul className={`mod-list ${viewMode === "grid" ? "mod-list--grid" : ""}`}>
              {pageMods.map((mod, i) => {
                const version = mod.versions[0];
                const action = actions[mod.id] ?? { status: "idle" };
                const autoInstallable = canAutoInstall(mod.category);
                // installedVersion isn't read here directly, but bumping it via
                // setInstalledVersion() after install/uninstall still triggers
                // this component to re-render, which re-reads localStorage below.
                const installedEntry = getInstalled(mod.id);
                const isUpToDate = !!installedEntry && !!version && installedEntry.version === version.version;
                const working = action.status === "working";
                const style = { animationDelay: `${Math.min(i, 8) * 35}ms` };

                const installLabel = autoInstallable
                  ? isUpToDate
                    ? "Reinstall"
                    : installedEntry
                      ? "Update"
                      : "Install"
                  : "Download";
                const onInstallOrDownload = () => (autoInstallable ? handleInstall(mod) : handleDownload(mod));
                const hasThumb = !!mod.thumbnailUrl && !brokenThumbs.has(mod.id);

                if (viewMode === "grid") {
                  return (
                    <li key={mod.id} className="mod-card mod-card--grid fade-in" style={style}>
                      <div className="mod-card__thumb-wrap">
                        <img
                          className="mod-card__thumb"
                          src={hasThumb ? mod.thumbnailUrl! : DEFAULT_THUMBNAIL_URL}
                          alt=""
                          style={{ objectPosition: hasThumb ? mod.thumbnailPosition : "50% 50%" }}
                          onError={() => mod.thumbnailUrl && markThumbBroken(mod.id)}
                        />
                        {!hasThumb && (
                          <button className="mod-card__thumb-overlay-title" onClick={() => setOpenModId(mod.id)}>
                            {mod.name}
                          </button>
                        )}
                      </div>
                      <div className="mod-card__grid-body">
                        <button className="mod-card__name mod-card__name--link" onClick={() => setOpenModId(mod.id)}>
                          {mod.name}
                        </button>
                        <span className="mod-card__author">
                          by <AuthorLink name={mod.author} accountId={mod.ownerId} />
                          {mod.subAuthor && <> · with {mod.subAuthor}</>}
                        </span>
                        <div className="mod-card__grid-meta">
                          <span className="mod-card__rating-group" title={`${mod.reviewCount ?? 0} rating${(mod.reviewCount ?? 0) === 1 ? "" : "s"}`}>
                            <StarRating value={mod.averageRating ?? 0} className="star-rating--sm" />
                            {mod.reviewCount ?? 0}
                          </span>
                          <span className="badge">{CATEGORY_LABELS[mod.category] ?? mod.category}</span>
                          {mod.theme && <span className="badge">{mod.theme}</span>}
                        </div>
                        <div className="mod-card__grid-meta">
                          <span className="mod-card__meta-stat" title={`${mod.downloadCount} downloads`}>
                            <DownloadIcon className="btn-icon" />
                            {formatCount(mod.downloadCount)}
                          </span>
                          <span className="mod-card__meta-stat" title={`${mod.commentCount ?? 0} comments`}>
                            <CommentIcon className="btn-icon" />
                            {mod.commentCount ?? 0}
                          </span>
                          <span className="mod-card__meta-date">{formatModDate(mod)}</span>
                        </div>
                        <div className="mod-card__grid-actions">
                          {version ? (
                            isUpToDate ? (
                              <SplitButton
                                mainLabel={<><TrashIcon className="btn-icon" /> Uninstall</>}
                                mainClassName="button--danger"
                                disabled={working}
                                onMain={() => handleUninstall(mod)}
                                menuItems={[
                                  {
                                    label: <><RefreshIcon className="btn-icon" /> Reinstall</>,
                                    onClick: onInstallOrDownload,
                                  },
                                ]}
                              />
                            ) : (
                              <button
                                className={`button ${installedEntry ? "button--update" : autoInstallable ? "button--install" : "button--download"}`}
                                disabled={working}
                                onClick={onInstallOrDownload}
                              >
                                {working && <span className="spinner" />}
                                {working ? "Working…" : installLabel}
                              </button>
                            )
                          ) : (
                            <span className="muted">No versions yet</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={mod.id} className="mod-card fade-in" style={style}>
                    <div className="mod-card__body">
                      {hasThumb && (
                        <img
                          className="mod-card__thumb"
                          src={mod.thumbnailUrl!}
                          alt=""
                          style={{ objectPosition: mod.thumbnailPosition }}
                          onError={() => markThumbBroken(mod.id)}
                        />
                      )}
                      <div className="mod-card__main">
                        <div className="mod-card__header">
                          <button className="mod-card__name mod-card__name--link" onClick={() => setOpenModId(mod.id)}>
                            {mod.name}
                          </button>
                          <span className="mod-card__author">
                            by <AuthorLink name={mod.author} accountId={mod.ownerId} />
                            {mod.subAuthor && <> · with {mod.subAuthor}</>}
                          </span>
                        </div>
                        <ClampedText className="mod-card__description" text={mod.description} lines={3} />
                        {mod.tags.length > 0 && (
                          <div className="mod-card__tags">
                            {mod.tags.map((t) => (
                              <button
                                key={t}
                                className="badge badge--tag"
                                onClick={() => {
                                  setActiveTag(t);
                                  setPage(1);
                                }}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mod-card__footer">
                          <span className="mod-card__rating-group" title={`${mod.reviewCount ?? 0} rating${(mod.reviewCount ?? 0) === 1 ? "" : "s"}`}>
                            <StarRating value={mod.averageRating ?? 0} className="star-rating--sm" />
                            {mod.reviewCount ?? 0}
                          </span>
                          <span className="badge">{CATEGORY_LABELS[mod.category] ?? mod.category}</span>
                          {mod.theme && <span className="badge">{mod.theme}</span>}
                          {version && <span className="muted">{formatGameVersions(version.gameVersions)}</span>}
                          <span className="mod-card__meta-stat" title={`${mod.downloadCount} downloads`}>
                            <DownloadIcon className="btn-icon" />
                            {formatCount(mod.downloadCount)}
                          </span>
                          <span className="mod-card__meta-stat" title={`${mod.commentCount ?? 0} comments`}>
                            <CommentIcon className="btn-icon" />
                            {mod.commentCount ?? 0}
                          </span>
                          <span className="mod-card__meta-date">{formatModDate(mod)}</span>
                          {isUpToDate && (
                            <span className="badge badge--installed">
                              <CheckCircleIcon className="btn-icon" /> Installed
                            </span>
                          )}
                          {version && <span className="mod-card__version">v{version.version}</span>}
                          {version && (
                            <button
                              className={`button button--lg ${
                                isUpToDate ? "button--reinstall" : installedEntry ? "button--update" : autoInstallable ? "button--install" : "button--download"
                              }`}
                              disabled={working}
                              onClick={onInstallOrDownload}
                            >
                              {working && <span className="spinner" />}
                              {!working && isUpToDate && <RefreshIcon className="btn-icon" />}
                              {working ? "Working…" : installLabel}
                            </button>
                          )}
                          {autoInstallable && installedEntry && isUpToDate && (
                            <button className="button button--lg button--danger" disabled={working} onClick={() => handleUninstall(mod)}>
                              <TrashIcon className="btn-icon" /> Uninstall
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <div className="browse-pagination">
                <button className="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  ← Prev
                </button>
                <span className="browse-pagination__pages">
                  Page {currentPage} of {totalPages} ({sortedMods.length} mods)
                </span>
                <button className="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}
