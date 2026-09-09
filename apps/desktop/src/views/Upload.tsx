import { useEffect, useRef, useState } from "react";
import type { ModCategory, ModWithVersions } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG, GAME_VERSION_GROUPS } from "@openwf-mod-manager/shared";
import type { GameVersionGroup } from "@openwf-mod-manager/shared";
import { addModVersion, fetchModList, uploadNewMod } from "../api";
import { pickModFileToUpload, readFileBytes } from "../native";
import { getApiKey } from "../settings";

type Mode = "new" | "update";

const initialNewModForm = {
  name: "",
  author: "",
  description: "",
  category: "metadata-patch" as ModCategory,
  version: "1.0.0",
  changelog: "",
  thumbnailUrl: "",
  screenshotUrls: "",
};

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
          disabled={isAll}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleGroup(group)}
        />
        <span className="version-picker__group-title">{group.title}</span>
        <span className="muted">({group.versions.length})</span>
      </summary>
      <div className="version-picker__group-versions">
        {group.versions.map((v) => (
          <label key={v} className="version-picker__row">
            <input type="checkbox" checked={!isAll && selected.includes(v)} disabled={isAll} onChange={() => onToggleVersion(v)} />
            <span>{v}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function GameVersionPicker({ selected, onChange }: { selected: string[]; onChange: (tags: string[]) => void }) {
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
        <span>All Versions</span>
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

export default function Upload() {
  const [mode, setMode] = useState<Mode>("new");
  const [existingMods, setExistingMods] = useState<ModWithVersions[]>([]);
  const [selectedModId, setSelectedModId] = useState("");

  const [newModForm, setNewModForm] = useState(initialNewModForm);
  const [updateVersion, setUpdateVersion] = useState("1.0.0");
  const [updateChangelog, setUpdateChangelog] = useState("");
  const [gameVersions, setGameVersions] = useState<string[]>([ALL_VERSIONS_TAG]);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "working" | "done" | "error"; message?: string }>({ kind: "idle" });

  useEffect(() => {
    if (mode === "update" && existingMods.length === 0) {
      fetchModList().then((mods) => {
        setExistingMods(mods);
        if (mods.length > 0) setSelectedModId(mods[0].id);
      });
    }
  }, [mode]);

  async function pickFile() {
    const path = await pickModFileToUpload();
    if (path) setFilePath(path);
  }

  async function submit() {
    const apiKey = getApiKey();
    if (!apiKey) {
      setStatus({ kind: "error", message: "Set your API key in Settings first" });
      return;
    }
    if (!filePath) {
      setStatus({ kind: "error", message: "Pick a mod file first" });
      return;
    }

    setStatus({ kind: "working" });
    try {
      const bytes = await readFileBytes(filePath);
      const fileName = filePath.split(/[\\/]/).pop() ?? "mod";

      if (mode === "new") {
        if (!newModForm.name || !newModForm.author || !newModForm.version) {
          setStatus({ kind: "error", message: "Name, author, and version are required" });
          return;
        }
        const screenshotUrls = newModForm.screenshotUrls
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        const result = await uploadNewMod(
          {
            name: newModForm.name,
            author: newModForm.author,
            description: newModForm.description,
            category: newModForm.category,
            version: newModForm.version,
            changelog: newModForm.changelog || undefined,
            gameVersions,
            thumbnailUrl: newModForm.thumbnailUrl || undefined,
            screenshotUrls: screenshotUrls.length > 0 ? screenshotUrls : undefined,
          },
          bytes,
          fileName,
          apiKey
        );
        setStatus({ kind: "done", message: `Uploaded as '${result.id}'` });
        setNewModForm(initialNewModForm);
        setGameVersions([ALL_VERSIONS_TAG]);
        setFilePath(null);
      } else {
        if (!selectedModId || !updateVersion) {
          setStatus({ kind: "error", message: "Pick a mod and a version number" });
          return;
        }
        const result = await addModVersion(
          selectedModId,
          { version: updateVersion, changelog: updateChangelog || undefined, gameVersions },
          bytes,
          fileName,
          apiKey
        );
        setStatus({ kind: "done", message: `Added v${result.version} to '${result.id}'` });
        setUpdateVersion("1.0.0");
        setUpdateChangelog("");
        setGameVersions([ALL_VERSIONS_TAG]);
        setFilePath(null);
      }
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  }

  return (
    <div className="upload-form">
      <div className="tabs tabs--sub">
        <button className={`tab ${mode === "new" ? "tab--active" : ""}`} onClick={() => setMode("new")}>New mod</button>
        <button className={`tab ${mode === "update" ? "tab--active" : ""}`} onClick={() => setMode("update")}>Update existing</button>
      </div>

      {mode === "new" ? (
        <>
          <label className="field">
            <span>Name</span>
            <input type="text" value={newModForm.name} onChange={(e) => setNewModForm({ ...newModForm, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Author</span>
            <input type="text" value={newModForm.author} onChange={(e) => setNewModForm({ ...newModForm, author: e.target.value })} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea value={newModForm.description} onChange={(e) => setNewModForm({ ...newModForm, description: e.target.value })} rows={3} />
          </label>
          <label className="field">
            <span>Category</span>
            <select value={newModForm.category} onChange={(e) => setNewModForm({ ...newModForm, category: e.target.value as ModCategory })}>
              <option value="metadata-patch">Metadata Patch</option>
              <option value="pluto-script">Pluto Script</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field">
            <span>Version</span>
            <input type="text" value={newModForm.version} onChange={(e) => setNewModForm({ ...newModForm, version: e.target.value })} />
          </label>
          <label className="field">
            <span>Changelog (optional)</span>
            <textarea value={newModForm.changelog} onChange={(e) => setNewModForm({ ...newModForm, changelog: e.target.value })} rows={2} />
          </label>
          <label className="field">
            <span>Thumbnail URL (optional)</span>
            <span className="hint">A link to an image already hosted elsewhere (Discord, Imgur, etc.) — not uploaded through this app.</span>
            <input type="text" value={newModForm.thumbnailUrl} onChange={(e) => setNewModForm({ ...newModForm, thumbnailUrl: e.target.value })} placeholder="https://..." />
          </label>
          <label className="field">
            <span>Screenshot URLs (optional)</span>
            <span className="hint">One link per line, same as above.</span>
            <textarea value={newModForm.screenshotUrls} onChange={(e) => setNewModForm({ ...newModForm, screenshotUrls: e.target.value })} rows={3} placeholder="https://...&#10;https://..." />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span>Mod</span>
            <select value={selectedModId} onChange={(e) => setSelectedModId(e.target.value)}>
              {existingMods.length === 0 && <option value="">Loading…</option>}
              {existingMods.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>New version</span>
            <input type="text" value={updateVersion} onChange={(e) => setUpdateVersion(e.target.value)} />
          </label>
          <label className="field">
            <span>Changelog (optional)</span>
            <textarea value={updateChangelog} onChange={(e) => setUpdateChangelog(e.target.value)} rows={2} />
          </label>
        </>
      )}

      <label className="field">
        <span>Compatible game versions</span>
        <GameVersionPicker selected={gameVersions} onChange={setGameVersions} />
      </label>

      <div className="field__row">
        <button className="button" onClick={pickFile}>Choose file…</button>
        <span className="muted">{filePath ? filePath.split(/[\\/]/).pop() : "No file chosen"}</span>
      </div>

      <button className="button button--primary" onClick={submit} disabled={status.kind === "working"}>
        {status.kind === "working" && <span className="spinner" />}
        {status.kind === "working" ? "Uploading…" : "Upload"}
      </button>
      {status.message && <p className={`fade-in ${status.kind === "error" ? "error" : "muted"}`}>{status.message}</p>}
    </div>
  );
}
