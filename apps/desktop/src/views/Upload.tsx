import { useEffect, useState } from "react";
import type { ModCategory, ModWithVersions } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG, DEFAULT_MOD_THEMES } from "@openwf-mod-manager/shared";
import { addModVersion, fetchModList, uploadNewMod } from "../api";
import { pickModFileToUpload, readFileBytes } from "../native";
import { getApiKey } from "../settings";
import { useAccount } from "../useAccount";
import { toast } from "../toast";
import TagInput from "../components/TagInput";
import ThumbnailPreview from "../components/ThumbnailPreview";
import ScreenshotPreviewList from "../components/ScreenshotPreviewList";
import GameVersionPicker from "../components/GameVersionPicker";

type Mode = "new" | "update";

// Top N tags (by how many existing mods use them) shown as one-click chips
// above the free-form TagInput, so an uploader can reach for a popular tag
// without having to already know its exact spelling.
const TOP_TAGS_SHOWN = 10;

const initialNewModForm = {
  name: "",
  subAuthor: "",
  description: "",
  category: "metadata-patch" as ModCategory,
  theme: "",
  version: "1.0.0",
  changelog: "",
  thumbnailUrl: "",
  thumbnailPosition: "50% 50%",
  screenshotUrls: "",
  tags: [] as string[],
};

export default function Upload() {
  const { account } = useAccount();
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
    // Fetched once regardless of mode: "update" needs it for the mod
    // picker, "new" needs it for tag autocomplete suggestions.
    if (existingMods.length === 0) {
      fetchModList().then((mods) => {
        setExistingMods(mods);
        if (mods.length > 0) setSelectedModId(mods[0].id);
      });
    }
  }, []);

  const existingTags = [...new Set(existingMods.flatMap((m) => m.tags))].sort();
  const themeSuggestions = [...new Set([...DEFAULT_MOD_THEMES, ...existingMods.map((m) => m.theme)])].sort();

  const tagCounts = new Map<string, number>();
  for (const m of existingMods) for (const t of m.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TAGS_SHOWN)
    .map(([t]) => t);

  const previewScreenshotUrls = newModForm.screenshotUrls
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  async function pickFile() {
    const path = await pickModFileToUpload();
    if (path) setFilePath(path);
  }

  async function submit() {
    const apiKey = await getApiKey();
    if (!apiKey) {
      toast.error("Set your API key in Settings first");
      return;
    }
    if (!filePath) {
      toast.error("Pick a mod file first");
      return;
    }

    setStatus({ kind: "working" });
    try {
      const bytes = await readFileBytes(filePath);
      if (bytes.length === 0) {
        toast.error(`'${filePath}' is empty (0 bytes) — pick a different file`);
        setStatus({ kind: "idle" });
        return;
      }
      const fileName = filePath.split(/[\\/]/).pop() ?? "mod";

      if (mode === "new") {
        if (!newModForm.name || !newModForm.version || !newModForm.theme) {
          toast.error("Name, version, and category are required");
          setStatus({ kind: "idle" });
          return;
        }
        const screenshotUrls = newModForm.screenshotUrls
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        const result = await uploadNewMod(
          {
            name: newModForm.name,
            // Ignored server-side (always the logged-in account's own
            // name) — see UploadMetadata.author's docstring.
            author: account?.username ?? "",
            subAuthor: newModForm.subAuthor || undefined,
            description: newModForm.description,
            category: newModForm.category,
            theme: newModForm.theme,
            version: newModForm.version,
            changelog: newModForm.changelog || undefined,
            gameVersions,
            thumbnailUrl: newModForm.thumbnailUrl || undefined,
            thumbnailPosition: newModForm.thumbnailUrl ? newModForm.thumbnailPosition : undefined,
            screenshotUrls: screenshotUrls.length > 0 ? screenshotUrls : undefined,
            tags: newModForm.tags,
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
          toast.error("Pick a mod and a version number");
          setStatus({ kind: "idle" });
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
      toast.error(String(e));
      setStatus({ kind: "idle" });
    }
  }

  return (
    <div className="upload-form">
      <div className="tabs tabs--sub">
        <button className={`tab ${mode === "new" ? "tab--active" : ""}`} onClick={() => setMode("new")}>New mod</button>
        <button className={`tab ${mode === "update" ? "tab--active" : ""}`} onClick={() => setMode("update")}>Update existing</button>
      </div>

      <div className="upload-grid">
        {mode === "new" ? (
          <>
            <div className="upload-card">
              <h4 className="upload-card__title">Basic Info</h4>
              <label className="field">
                <span>Name</span>
                <input type="text" value={newModForm.name} onChange={(e) => setNewModForm({ ...newModForm, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Author</span>
                <span className="hint">Always your own account — not editable here.</span>
                <input type="text" value={account?.username ?? "Log in first"} disabled />
              </label>
              <label className="field">
                <span>Sub-Author (optional)</span>
                <span className="hint">Credit a co-creator or secondary contributor.</span>
                <input
                  type="text"
                  value={newModForm.subAuthor}
                  onChange={(e) => setNewModForm({ ...newModForm, subAuthor: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea value={newModForm.description} onChange={(e) => setNewModForm({ ...newModForm, description: e.target.value })} rows={3} />
              </label>
              <label className="field">
                <span>Type</span>
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
            </div>

            <div className="upload-card">
              <h4 className="upload-card__title">Media</h4>
              <label className="field">
                <span>Thumbnail URL (optional)</span>
                <span className="hint">A link to an image already hosted elsewhere (Discord, Imgur, etc.) — not uploaded through this app.</span>
                <input type="text" value={newModForm.thumbnailUrl} onChange={(e) => setNewModForm({ ...newModForm, thumbnailUrl: e.target.value })} placeholder="https://..." />
                <ThumbnailPreview
                  url={newModForm.thumbnailUrl}
                  position={newModForm.thumbnailPosition}
                  onPositionChange={(thumbnailPosition) => setNewModForm({ ...newModForm, thumbnailPosition })}
                />
              </label>
              <label className="field">
                <span>Screenshot URLs (optional)</span>
                <span className="hint">One link per line, same as above.</span>
                <textarea value={newModForm.screenshotUrls} onChange={(e) => setNewModForm({ ...newModForm, screenshotUrls: e.target.value })} rows={3} placeholder="https://...&#10;https://..." />
                <ScreenshotPreviewList urls={previewScreenshotUrls} />
              </label>
            </div>

            <div className="upload-card">
              <h4 className="upload-card__title">Category, Tags &amp; Compatibility</h4>
              <label className="field">
                <span>Category</span>
                <span className="hint">The mod's main category — pick one from the list.</span>
                <select
                  value={newModForm.theme}
                  onChange={(e) => setNewModForm({ ...newModForm, theme: e.target.value })}
                >
                  <option value="" disabled>Select a category…</option>
                  {themeSuggestions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tags (optional)</span>
                <span className="hint">Free-form — type and press Enter. Suggestions are pulled from tags other mods already use.</span>
                {topTags.length > 0 && (
                  <div className="tag-filter">
                    {topTags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="tag-filter__chip"
                        disabled={newModForm.tags.includes(t)}
                        onClick={() => setNewModForm({ ...newModForm, tags: [...new Set([...newModForm.tags, t])] })}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                <TagInput tags={newModForm.tags} onChange={(tags) => setNewModForm({ ...newModForm, tags })} suggestions={existingTags} />
              </label>
              <label className="field">
                <span>Compatible game versions</span>
                <GameVersionPicker selected={gameVersions} onChange={setGameVersions} />
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="upload-card">
              <h4 className="upload-card__title">Mod &amp; Version</h4>
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
            </div>

            <div className="upload-card">
              <h4 className="upload-card__title">Compatibility</h4>
              <label className="field">
                <span>Compatible game versions</span>
                <GameVersionPicker selected={gameVersions} onChange={setGameVersions} />
              </label>
            </div>
          </>
        )}

        <div className="upload-card">
          <h4 className="upload-card__title">File</h4>
          <div className="field__row">
            <button className="button" onClick={pickFile}>Choose file…</button>
            <button className="button button--primary" onClick={submit} disabled={status.kind === "working"}>
              {status.kind === "working" && <span className="spinner" />}
              {status.kind === "working" ? "Uploading…" : "Upload"}
            </button>
          </div>
          <span className="muted">{filePath ? filePath.split(/[\\/]/).pop() : "No file chosen"}</span>
          {status.kind === "done" && status.message && <p className="fade-in muted">{status.message}</p>}
        </div>
      </div>
    </div>
  );
}
