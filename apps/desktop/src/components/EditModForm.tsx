import { useState } from "react";
import type { Mod, ModWithVersions } from "@openwf-mod-manager/shared";
import { updateMod } from "../api";
import { toast } from "../toast";
import ThumbnailPreview from "./ThumbnailPreview";
import ScreenshotPreviewList from "./ScreenshotPreviewList";
import TagInput from "./TagInput";

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
  const [thumbnailUrl, setThumbnailUrl] = useState(mod.thumbnailUrl ?? "");
  const [thumbnailPosition, setThumbnailPosition] = useState(mod.thumbnailPosition);
  const [screenshotUrlsText, setScreenshotUrlsText] = useState(mod.screenshotUrls.join("\n"));
  const [tags, setTags] = useState(mod.tags);
  const [status, setStatus] = useState<{ kind: "idle" | "working" | "error" }>({ kind: "idle" });

  const previewScreenshotUrls = screenshotUrlsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  async function save() {
    if (!name.trim()) {
      toast.error("Name can't be empty");
      return;
    }
    setStatus({ kind: "working" });
    try {
      const updated = await updateMod(
        mod.id,
        {
          name: name.trim(),
          description,
          thumbnailUrl: thumbnailUrl.trim() || null,
          thumbnailPosition: thumbnailUrl.trim() ? thumbnailPosition : undefined,
          screenshotUrls: previewScreenshotUrls,
          tags,
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
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field">
        <span>Thumbnail URL</span>
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
        <span>Tags</span>
        <TagInput tags={tags} onChange={setTags} />
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
