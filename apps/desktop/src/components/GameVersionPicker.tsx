import { useEffect, useRef, useState } from "react";
import { ALL_VERSIONS_TAG, GAME_VERSION_GROUPS } from "@openwf-mod-manager/shared";
import type { GameVersionGroup } from "@openwf-mod-manager/shared";

// Shared by Upload (picking which versions a mod version is compatible
// with) and Browse's sidebar (filtering mods by version) — same grouped,
// searchable, "All Versions" checkbox UI either way. `selected` empty (or
// containing ALL_VERSIONS_TAG) means "All Versions"/no filter.
function GroupRow({ group, selected, isAll, onToggleGroup, onToggleVersion, forceOpen }: {
  group: GameVersionGroup;
  selected: string[];
  isAll: boolean;
  onToggleGroup: (group: GameVersionGroup) => void;
  onToggleVersion: (v: string) => void;
  forceOpen: boolean;
}) {
  const allSelected = !isAll && group.versions.every((v) => selected.includes(v));
  const someSelected = !isAll && !allSelected && group.versions.some((v) => selected.includes(v));
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <details className="version-picker__group" open={forceOpen}>
      <summary>
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleGroup(group)}
        />
        <span className="version-picker__group-title">{group.title}</span>
        <span className="muted">({group.versions.length})</span>
      </summary>
      <div className="version-picker__group-versions">
        {group.versions.map((v) => (
          <label key={v} className="version-picker__row">
            <input type="checkbox" checked={!isAll && selected.includes(v)} onChange={() => onToggleVersion(v)} />
            <span>{v}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export default function GameVersionPicker({ selected, onChange, allLabel = "All Versions" }: {
  selected: string[];
  onChange: (tags: string[]) => void;
  allLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const isAll = selected.length === 0 || selected.includes(ALL_VERSIONS_TAG);

  function toggleAll() {
    onChange(isAll ? [] : [ALL_VERSIONS_TAG]);
  }

  function toggleVersion(v: string) {
    const base = isAll ? [] : selected;
    onChange(base.includes(v) ? base.filter((x) => x !== v) : [...base, v]);
  }

  function toggleGroup(group: GameVersionGroup) {
    const base = isAll ? [] : selected;
    const allSelected = group.versions.every((v) => base.includes(v));
    onChange(allSelected ? base.filter((v) => !group.versions.includes(v)) : [...new Set([...base, ...group.versions])]);
  }

  const query = search.trim().toLowerCase();
  const filteredGroups = query
    ? GAME_VERSION_GROUPS.map((g) => ({
        ...g,
        versions: g.title.toLowerCase().includes(query) ? g.versions : g.versions.filter((v) => v.includes(query)),
      })).filter((g) => g.versions.length > 0)
    : GAME_VERSION_GROUPS;

  return (
    <div className="version-picker">
      <input
        type="text"
        className="version-picker__search"
        placeholder="Search versions or update name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <label className="version-picker__row version-picker__row--all">
        <input type="checkbox" checked={isAll} onChange={toggleAll} />
        <span>{allLabel}</span>
      </label>
      <div className="version-picker__groups">
        {filteredGroups.map((group) => (
          <GroupRow
            key={group.title}
            group={group}
            selected={selected}
            isAll={isAll}
            onToggleGroup={toggleGroup}
            onToggleVersion={toggleVersion}
            forceOpen={!!query}
          />
        ))}
      </div>
    </div>
  );
}
