import { useState } from "react";
import type { ModCategory } from "@openwf-mod-manager/shared";
import { uploadNewMod } from "../api";
import { pickZipToUpload, readFileBytes } from "../native";
import { getApiKey } from "../settings";

const initialForm = {
  name: "",
  author: "",
  description: "",
  category: "metadata-patch" as ModCategory,
  version: "1.0.0",
  changelog: "",
};

export default function Upload() {
  const [form, setForm] = useState(initialForm);
  const [zipPath, setZipPath] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "working" | "done" | "error"; message?: string }>({ kind: "idle" });

  async function pickZip() {
    const path = await pickZipToUpload();
    if (path) setZipPath(path);
  }

  async function submit() {
    const apiKey = getApiKey();
    if (!apiKey) {
      setStatus({ kind: "error", message: "Set your API key in Settings first" });
      return;
    }
    if (!zipPath) {
      setStatus({ kind: "error", message: "Pick a .zip file first" });
      return;
    }
    if (!form.name || !form.author || !form.version) {
      setStatus({ kind: "error", message: "Name, author, and version are required" });
      return;
    }

    setStatus({ kind: "working" });
    try {
      const bytes = await readFileBytes(zipPath);
      const fileName = zipPath.split(/[\\/]/).pop() ?? "mod.zip";
      const result = await uploadNewMod(form, bytes, fileName, apiKey);
      setStatus({ kind: "done", message: `Uploaded as '${result.id}'` });
      setForm(initialForm);
      setZipPath(null);
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  }

  return (
    <div className="upload-form">
      <label className="field">
        <span>Name</span>
        <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>

      <label className="field">
        <span>Author</span>
        <input type="text" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
      </label>

      <label className="field">
        <span>Category</span>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ModCategory })}>
          <option value="metadata-patch">Metadata Patch</option>
          <option value="pluto-script">Pluto Script</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className="field">
        <span>Version</span>
        <input type="text" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
      </label>

      <label className="field">
        <span>Changelog (optional)</span>
        <textarea value={form.changelog} onChange={(e) => setForm({ ...form, changelog: e.target.value })} rows={2} />
      </label>

      <div className="field__row">
        <button className="button" onClick={pickZip}>Choose .zip…</button>
        <span className="muted">{zipPath ? zipPath.split(/[\\/]/).pop() : "No file chosen"}</span>
      </div>

      <button className="button button--primary" onClick={submit} disabled={status.kind === "working"}>
        {status.kind === "working" ? "Uploading…" : "Upload"}
      </button>
      {status.message && <p className={status.kind === "error" ? "error" : "muted"}>{status.message}</p>}
    </div>
  );
}
