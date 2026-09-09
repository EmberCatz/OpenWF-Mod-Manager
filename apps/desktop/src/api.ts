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

// Downloads a mod version's file (.pluto, .txt, or .zip) straight from its
// GitHub release asset URL — this never touches the Worker API. Uses the
// Tauri HTTP plugin rather than the webview's fetch so it isn't subject to
// browser CORS restrictions against GitHub's asset-hosting origin.
export async function downloadModFile(downloadUrl: string): Promise<ArrayBuffer> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const res = await tauriFetch(downloadUrl);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return res.arrayBuffer();
}

async function postMultipart<T>(path: string, metadata: unknown, fileBytes: Uint8Array, fileName: string, apiKey: string): Promise<T> {
  const form = new FormData();
  form.append("file", new Blob([fileBytes as BlobPart], { type: "application/octet-stream" }), fileName);
  form.append("metadata", JSON.stringify(metadata));

  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const res = await tauriFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  // The server always replies JSON on purpose (see index.ts's onError), but
  // this stays defensive anyway — a non-JSON body (a Cloudflare edge error
  // page, a network proxy, anything outside the Worker's own control)
  // should surface as a readable error, not a confusing JSON-parse crash.
  const rawBody = await res.text();
  let body: { error?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error(res.ok ? "unexpected non-JSON response" : `request failed: ${res.status} ${rawBody.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(body.error ?? `request failed: ${res.status}`);
  return body as T;
}

// Creates a new mod + its first version. Fails 409 if a mod with the same
// (slugified) name already exists — use addModVersion for that case.
export async function uploadNewMod(metadata: UploadMetadata, fileBytes: Uint8Array, fileName: string, apiKey: string): Promise<{ id: string; downloadUrl: string }> {
  return postMultipart("/api/mods", metadata, fileBytes, fileName, apiKey);
}

// Adds a new version to an existing mod. Fails 403 if apiKey doesn't
// belong to that mod's owner, 409 if the version number already exists.
export async function addModVersion(
  modId: string,
  metadata: Pick<UploadMetadata, "version" | "changelog" | "gameVersions">,
  fileBytes: Uint8Array,
  fileName: string,
  apiKey: string
): Promise<{ id: string; version: string; downloadUrl: string }> {
  return postMultipart(`/api/mods/${modId}/versions`, metadata, fileBytes, fileName, apiKey);
}
