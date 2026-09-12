import { useEffect, useState } from "react";
import type { ModWithVersions } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG, DEFAULT_MOD_THEMES } from "@openwf-mod-manager/shared";
import { fetchModList } from "../api";
import { GridIcon, ListIcon } from "../icons";
import ModDetail from "../components/ModDetail";
import ModCard, { CATEGORY_LABELS } from "../components/ModCard";
import GameVersionPicker from "../components/GameVersionPicker";

type ViewMode = "list" | "grid";
type SortKey = "downloads" | "name" | "new" | "updated" | "score";

const CATEGORIES = Object.keys(CATEGORY_LABELS);
const VIEW_MODE_KEY = "owmm.browseViewMode";
const SORT_KEY_STORAGE = "owmm.browseSortKey";
const PAGE_SIZE_STORAGE = "owmm.browsePageSize";

const SORT_LABELS: Record<SortKey, string> = {
  downloads: "Most downloads",
  score: "Most liked",
  new: "Newest",
  updated: "Recently updated",
  name: "Name (A–Z)",
};
const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

function sortMods(mods: ModWithVersions[], key: SortKey): ModWithVersions[] {
  const sorted = [...mods];
  switch (key) {
    case "downloads":
      return sorted.sort((a, b) => b.downloadCount - a.downloadCount);
    case "score":
      return sorted.sort((a, b) => b.likeCount - a.likeCount);
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
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [activeThemes, setActiveThemes] = useState<Set<string>>(new Set());
  const [versionFilter, setVersionFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [openModId, setOpenModId] = useState<string | null>(null);
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
  // Bumped after ModDetail performs an install/uninstall (its own separate
  // instance, not any of the ModCard grid/list items below) — just needs to
  // force Browse to re-render so its ModCards re-read localStorage instead
  // of showing stale installed-state; each ModCard tracks its own actions.
  const [, setInstalledVersion] = useState(0);

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
              {pageMods.map((mod, i) => (
                <ModCard
                  key={mod.id}
                  mod={mod}
                  viewMode={viewMode}
                  onOpen={() => setOpenModId(mod.id)}
                  onTagClick={(t) => {
                    setActiveTag(t);
                    setPage(1);
                  }}
                  style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                />
              ))}
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
  );
}
