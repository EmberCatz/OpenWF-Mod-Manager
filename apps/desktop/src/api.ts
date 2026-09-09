import type { ModWithVersions, UploadMetadata } from "@openwf-mod-manager/shared";

// Points at the deployed Worker (apps/api). Override for local dev with a
// .env file (VITE_API_BASE_URL=http://127.0.0.1:8787) once wrangler dev is running.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://openwf-mod-manager-api.embercatdev.workers.dev";

export async function fetchModList(): Promise<ModWithVersions[]> {
  const res = await fetch(`${API_BASE_URL}/api/mods`);
  if (!res.ok) throw new Error(`failed to load mod list: ${res.status}`);
  return res.json();
}

export async function fetchMod(id: string): Promise<ModWithVersions> {
  const res = await fetch(`${API_BASE_URL}/api/mods/${id}`);
  if (!res.ok) throw new Error(`failed to load mod '${id}': ${res.status}`);
  return res.json();
}

// Downloads a mod's zip straight from its GitHub release asset URL — this
// never touches the Worker API. Uses the Tauri HTTP plugin rather than the
// webview's fetch so it isn't subject to browser CORS restrictions against
// GitHub's asset-hosting origin.
export async function downloadModZip(downloadUrl: string): Promise<ArrayBuffer> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const res = await tauriFetch(downloadUrl);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return res.arrayBuffer();
}

// Creates a new mod + its first version. Fails 409 if a mod with the same
// (slugified) name already exists — this form doesn't cover adding a
// version to an existing mod yet, see POST /api/mods/:id/versions.
export async function uploadNewMod(metadata: UploadMetadata, zipBytes: Uint8Array, fileName: string, apiKey: string): Promise<{ id: string; downloadUrl: string }> {
  const form = new FormData();
  form.append("file", new Blob([zipBytes as BlobPart], { type: "application/zip" }), fileName);
  form.append("metadata", JSON.stringify(metadata));

  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const res = await tauriFetch(`${API_BASE_URL}/api/mods`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `upload failed: ${res.status}`);
  return body;
}
