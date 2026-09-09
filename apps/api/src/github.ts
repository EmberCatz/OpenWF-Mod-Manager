import type { Env } from "./env";

const API_BASE = "https://api.github.com";
const USER_AGENT = "openwf-mod-manager-worker";

function authHeaders(env: Env, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
    ...extra,
  };
}

export interface GithubRelease {
  id: number;
  uploadUrl: string;
}

export interface GithubAsset {
  id: number;
  browserDownloadUrl: string;
}

// One GitHub Release per mod version — tag "<modId>-v<version>" keeps every
// version's release (and its asset) permanent and individually addressable.
// Storage itself costs nothing and needs no payment method on file, unlike
// R2/S3 — the right tradeoff at this project's scale (mods are sub-1MB).
export async function createRelease(env: Env, modId: string, version: string, changelog?: string): Promise<GithubRelease> {
  const res = await fetch(`${API_BASE}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/releases`, {
    method: "POST",
    headers: authHeaders(env, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      tag_name: `${modId}-v${version}`,
      name: `${modId} v${version}`,
      body: changelog ?? "",
      draft: false,
      prerelease: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub release creation failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: number; upload_url: string };
  return { id: data.id, uploadUrl: data.upload_url.replace(/\{.*\}$/, "") };
}

export async function uploadReleaseAsset(
  env: Env,
  uploadUrl: string,
  filename: string,
  content: ArrayBuffer
): Promise<GithubAsset> {
  const res = await fetch(`${uploadUrl}?name=${encodeURIComponent(filename)}`, {
    method: "POST",
    headers: authHeaders(env, { "Content-Type": "application/zip" }),
    body: content,
  });
  if (!res.ok) {
    throw new Error(`GitHub asset upload failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: number; browser_download_url: string };
  return { id: data.id, browserDownloadUrl: data.browser_download_url };
}

// Best-effort cleanup if the D1 write fails after the GitHub side already
// succeeded — there's no transaction spanning both systems, so this just
// avoids leaving an orphaned release behind. Failures here are swallowed;
// worst case is a harmless leftover release, not a broken request.
export async function deleteReleaseBestEffort(env: Env, releaseId: number): Promise<void> {
  try {
    await fetch(`${API_BASE}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/releases/${releaseId}`, {
      method: "DELETE",
      headers: authHeaders(env),
    });
  } catch {
    // swallowed — see comment above
  }
}
