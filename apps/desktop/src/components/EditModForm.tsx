import { useEffect, useState } from "react";
import type { Mod, ModWithVersions } from "@openwf-mod-manager/shared";
import { DEFAULT_MOD_THEMES } from "@openwf-mod-manager/shared";
import { fetchModList, updateMod } from "../api";
import { toast } from "../toast";
import ThumbnailPreview from "./ThumbnailPreview";
import ScreenshotPreviewList from "./ScreenshotPreviewList";
import TagInput from "./TagInput";
import ModPicker from "./ModPicker";

interface EditModFormProps {
  mod: ModWithVersions;
  apiKey: string;
  onSaved: (updated: Mod) => void;
  onCancel: () => void;
}

// Edits the mod's own record (name/description/thumbnail/tags) — not a
// version/file, that's still upload-only (see Upload.tsx). The mod's
// id/slug and category are deliberately not editable here: the id is
// baked into every version and GitHub release, and category drives which
// folder existing installs already went into.
export default function EditModForm({ mod, apiKey, onSaved, onCancel }: EditModFormProps) {
  const [name, setName] = useState(mod.name);
  const [description, setDescription] = useState(mod.description);
  const [installInstructions, setInstallInstructions] = useState(mod.installInstructions ?? "");
  const [riskNotes, setRiskNotes] = useState(mod.riskNotes ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(mod.thumbnailUrl ?? "");
  const [thumbnailPosition, setThumbnailPosition] = useState(mod.thumbnailPosition);
  const [screenshotUrlsText, setScreenshotUrlsText] = useState(mod.screenshotUrls.join("\n"));
  const [tags, setTags] = useState(mod.tags);
  const [theme, setTheme] = useState(mod.theme);
  const [subAuthor, setSubAuthor] = useState(mod.subAuthor ?? "");
  const [requiresModIds, setRequiresModIds] = useState(mod.requiresModIds);
  const [conflictsWithModIds, setConflictsWithModIds] = useState(mod.conflictsWithModIds);
  const [modOptions, setModOptions] = useState<ModWithVersions[]>([]);
  const [status, setStatus] = useState<{ kind: "idle" | "working" | "error" }>({ kind: "idle" });

  useEffect(() => {
    fetchModList().then(setModOptions);
  }, []);

  const previewScreenshotUrls = screenshotUrlsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  async function save() {
    if (!name.trim()) {
      toast.error("Name can't be empty");
      return;
    }
    if (!theme.trim()) {
      toast.error("Category can't be empty");
      return;
    }
    setStatus({ kind: "working" });
    try {
      const updated = await updateMod(
        mod.id,
        {
          name: name.trim(),
          description,
          installInstructions: installInstructions.trim() || null,
          riskNotes: riskNotes.trim() || null,
          thumbnailUrl: thumbnailUrl.trim() || null,
          thumbnailPosition: thumbnailUrl.trim() ? thumbnailPosition : undefined,
          screenshotUrls: previewScreenshotUrls,
          tags,
          theme: theme.trim(),
          subAuthor: subAuthor.trim() || null,
          requiresModIds,
          conflictsWithModIds,
        },
        apiKey
      );
      onSaved(updated);
    } catch (e) {
      toast.error(String(e));
      setStatus({ kind: "idle" });
    }
  }

  return (
    <div className="edit-mod-form fade-in">
      <label className="field">
        <span>Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Description</span>
        <span className="hint">Supports basic Markdown (bold, lists, links, code, headings).</span>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field">
        <span>Install Instructions</span>
        <span className="hint">Steps specific to this mod, separate from the general description.</span>
        <textarea rows={3} value={installInstructions} onChange={(e) => setInstallInstructions(e.target.value)} />
      </label>
      <label className="field">
        <span>Anything to watch out for?</span>
        <span className="hint">Things players should know before installing — what could break, known conflicts, etc.</span>
        <textarea rows={2} value={riskNotes} onChange={(e) => setRiskNotes(e.target.value)} />
      </label>
      <label className="field">
        <span>Thumbnail URL</span>
        <span className="hint">A link already hosted on imgur.com.</span>
        <input type="text" value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} placeholder="https://..." />
        <ThumbnailPreview url={thumbnailUrl} position={thumbnailPosition} onPositionChange={setThumbnailPosition} />
      </label>
      <label className="field">
        <span>Screenshot URLs</span>
        <span className="hint">One link per line.</span>
        <textarea rows={3} value={screenshotUrlsText} onChange={(e) => setScreenshotUrlsText(e.target.value)} />
        <ScreenshotPreviewList urls={previewScreenshotUrls} />
      </label>
      <label className="field">
        <span>Category</span>
        <input type="text" list="edit-theme-options" value={theme} onChange={(e) => setTheme(e.target.value)} />
        <datalist id="edit-theme-options">
          {DEFAULT_MOD_THEMES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>Sub-Author</span>
        <span className="hint">Credit a co-creator or secondary contributor.</span>
        <input type="text" value={subAuthor} onChange={(e) => setSubAuthor(e.target.value)} />
      </label>
      <label className="field">
        <span>Tags</span>
        <TagInput tags={tags} onChange={setTags} />
      </label>
      <label className="field">
        <span>Requires</span>
        <span className="hint">Other mods this one works best with — informational only, not enforced at install.</span>
        <ModPicker selectedIds={requiresModIds} onChange={setRequiresModIds} options={modOptions} excludeId={mod.id} />
      </label>
      <label className="field">
        <span>Conflicts with</span>
        <span className="hint">Other mods this one shouldn't be installed alongside.</span>
        <ModPicker selectedIds={conflictsWithModIds} onChange={setConflictsWithModIds} options={modOptions} excludeId={mod.id} />
      </label>
      <div className="field__row">
        <button className="button button--primary" disabled={status.kind === "working"} onClick={save}>
          {status.kind === "working" && <span className="spinner" />}
          Save
        </button>
        <button className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
