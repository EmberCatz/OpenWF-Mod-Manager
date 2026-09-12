import { z, type ZodType } from "zod";
import type {
  Comment,
  LikeSummary,
  Mod,
  ModAnalytics,
  ModderProfile,
  ModWithVersions,
  UpdateModMetadata,
  UploadMetadata,
} from "@openwf-mod-manager/shared";
import { CommentSchema, LikeSummarySchema, ModWithVersionsSchema, ModderProfileSchema } from "@openwf-mod-manager/shared";

// Points at the deployed Worker (apps/api). Override for local dev with a
// .env file (VITE_API_BASE_URL=http://127.0.0.1:8787) once wrangler dev is running.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://openwf-mod-manager-api.embercatdev.workers.dev";

// Reads a plain (non-authed) GET response, surfacing the server's own
// `message`/`error` field on failure — e.g. site-controls responses like
// maintenance mode or a disabled feature come with a human-readable
// message that's worth showing as-is instead of a bare status code. On
// success, validates the body against `schema` rather than trusting an
// `as T` cast — a stale/misconfigured backend sending an unexpected shape
// throws one clear error here instead of a confusing crash somewhere deep
// in a component that assumed the shape was right.
async function readJsonOrThrow<T>(res: Response, schema: ZodType<T>, fallbackMessage: string): Promise<T> {
  const rawBody = await res.text();
  if (res.ok) {
    let raw: unknown;
    try {
      raw = JSON.parse(rawBody);
    } catch {
      throw new Error(`${fallbackMessage}: response wasn't valid JSON`);
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new Error(`${fallbackMessage}: unexpected response shape (${result.error.issues[0]?.message ?? "validation failed"})`);
    }
    return result.data;
  }
  let parsed: { error?: string; message?: string } | null = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // non-JSON error body — fall back to the generic message below
  }
  throw new Error(parsed?.message ?? parsed?.error ?? `${fallbackMessage}: ${res.status}`);
}

export async function fetchModList(): Promise<ModWithVersions[]> {
  const res = await fetch(`${API_BASE_URL}/api/mods`);
  return readJsonOrThrow(res, z.array(ModWithVersionsSchema), "failed to load mod list");
}

export async function fetchMod(id: string): Promise<ModWithVersions> {
  const res = await fetch(`${API_BASE_URL}/api/mods/${id}`);
  return readJsonOrThrow(res, ModWithVersionsSchema, `failed to load mod '${id}'`);
}

// For the "My Mods" tab — every mod owned by whoever this token belongs to
// (a logged-in account or an older API key, see docs/architecture.md § Accounts).
export async function fetchMyMods(apiKey: string): Promise<ModWithVersions[]> {
  const res = await fetch(`${API_BASE_URL}/api/mods/mine`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`failed to load your mods: ${res.status}`);
  return res.json();
}

// Weekly-bucketed downloads/ratings for a mod you own (or, for an admin,
// any mod) — see routes/mods.ts's GET .../analytics for the owner-or-admin
// check and bucketing rules.
export async function fetchModAnalytics(modId: string, apiKey: string): Promise<ModAnalytics> {
  const res = await fetch(`${API_BASE_URL}/api/mods/${modId}/analytics`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`failed to load analytics: ${res.status}`);
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

async function authedDelete(path: string, apiKey: string, reauthToken?: string): Promise<void> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const res = await tauriFetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}`, ...(reauthToken ? { "X-Reauth-Token": reauthToken } : {}) },
  });
  if (res.ok) return;
  const rawBody = await res.text();
  let message = `request failed: ${res.status}`;
  try {
    const body = JSON.parse(rawBody) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // non-JSON body — fall back to the generic message above
  }
  throw new Error(message);
}

export async function deleteMod(modId: string, apiKey: string): Promise<void> {
  return authedDelete(`/api/mods/${modId}`, apiKey);
}

export async function deleteModVersion(modId: string, version: string, apiKey: string): Promise<void> {
  return authedDelete(`/api/mods/${modId}/versions/${encodeURIComponent(version)}`, apiKey);
}

// apiKey is optional here (unlike authedJson below, which requires one) —
// most POSTs through this helper (reviews, votes, reports) have no account
// concept at all. When a caller does pass one (postComment, for a logged-in
// user), it's sent via the Tauri HTTP plugin so it actually reaches the
// server as a real Authorization header the same way authed* calls do.
async function postJson<T>(path: string, body: unknown, apiKey?: string): Promise<T> {
  const doFetch = apiKey ? (await import("@tauri-apps/plugin-http")).fetch : fetch;
  const res = await doFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const rawBody = await res.text();
  let parsed: { error?: string };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error(res.ok ? "unexpected non-JSON response" : `request failed: ${res.status} ${rawBody.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(parsed.error ?? `request failed: ${res.status}`);
  return parsed as T;
}

// voterId is the same per-install reviewerId (reviewerId.ts) used for star
// ratings — passed along so the server can fill in each comment's myVote.
export async function fetchComments(modId: string, voterId: string): Promise<Comment[]> {
  const res = await fetch(`${API_BASE_URL}/api/mods/${modId}/comments?voterId=${encodeURIComponent(voterId)}`);
  return readJsonOrThrow(res, z.array(CommentSchema), "failed to load comments");
}

// apiKey is optional — pass the logged-in user's token (if any) so the
// server can link authorAccountId to their real account (see routes/mods.ts);
// omit it to post anonymously, same as before.
export async function postComment(
  modId: string,
  authorName: string,
  body: string,
  parentId: number | null,
  apiKey?: string
): Promise<Comment> {
  return postJson(`/api/mods/${modId}/comments`, { authorName, body, parentId }, apiKey);
}

// value 1/-1 sets this install's vote, 0 removes it.
export async function voteOnComment(
  modId: string,
  commentId: number,
  reviewerId: string,
  value: -1 | 0 | 1
): Promise<{ score: number; myVote: -1 | 0 | 1 }> {
  return postJson(`/api/mods/${modId}/comments/${commentId}/vote`, { reviewerId, value });
}

export async function fetchLikeSummary(modId: string, reviewerId: string): Promise<LikeSummary> {
  const res = await fetch(`${API_BASE_URL}/api/mods/${modId}/likes?reviewerId=${encodeURIComponent(reviewerId)}`);
  return readJsonOrThrow(res, LikeSummarySchema, "failed to load likes");
}

export async function toggleLike(modId: string, reviewerId: string): Promise<LikeSummary> {
  return postJson(`/api/mods/${modId}/likes`, { reviewerId });
}

export interface Account {
  id: string;
  username: string;
  avatarKey: string;
  isAdmin?: boolean;
}

export async function signup(username: string, password: string): Promise<{ token: string; username: string }> {
  return postJson("/api/auth/signup", { username, password });
}

export async function login(username: string, password: string): Promise<{ token: string; username: string }> {
  return postJson("/api/auth/login", { username, password });
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {}); // best-effort — an already-invalid token is fine to just drop locally
}

export async function fetchMe(token: string): Promise<Account> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`not logged in: ${res.status}`);
  return res.json();
}

export async function deleteAccount(token: string): Promise<void> {
  return authedDelete("/api/auth/me", token);
}

export async function updateAvatar(avatarKey: string, apiKey: string): Promise<Account> {
  return authedJson("PATCH", "/api/auth/me", { avatarKey }, apiKey);
}

// GET /api/modders/:id — a creator's public profile, opened from any
// username link across the app (see profileNav.ts / components/AuthorLink.tsx).
export async function fetchModderProfile(id: string): Promise<ModderProfile> {
  const res = await fetch(`${API_BASE_URL}/api/modders/${id}`);
  return readJsonOrThrow(res, ModderProfileSchema, "failed to load profile");
}

// Best-effort popularity-counter ping — swallows its own errors so a slow
// or unreachable API never interrupts an actual install/download, which
// works entirely independently of this (see downloadModFile above).
export async function recordDownload(modId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/mods/${modId}/download`, { method: "POST" }).catch(() => {});
}

async function authedJson<T>(method: string, path: string, body: unknown, apiKey: string, reauthToken?: string): Promise<T> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const res = await tauriFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(reauthToken ? { "X-Reauth-Token": reauthToken } : {}),
    },
    body: JSON.stringify(body),
  });
  const rawBody = await res.text();
  let parsed: { error?: string };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error(res.ok ? "unexpected non-JSON response" : `request failed: ${res.status} ${rawBody.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(parsed.error ?? `request failed: ${res.status}`);
  return parsed as T;
}

// Updates the mod's own record (not a version/file) — owner-only. Only
// the fields present in `patch` change; omit a key to leave it alone.
export async function updateMod(modId: string, patch: UpdateModMetadata, apiKey: string): Promise<Mod> {
  return authedJson("PATCH", `/api/mods/${modId}`, patch, apiKey);
}

export async function submitReport(targetType: "mod" | "comment", targetId: string, reason: string): Promise<void> {
  await postJson("/api/reports", { targetType, targetId, reason });
}

// ---- Admin (routes/admin.ts) — every function here 403s unless the
// account behind apiKey has is_admin set, which is never settable through
// any route (only apps/api/scripts/grant-admin.mjs, run by the operator).

export interface AdminUser {
  id: string;
  username: string;
  createdAt: string;
  isAdmin: boolean;
  isBanned: boolean;
  modCount: number;
}

export interface AdminReport {
  id: number;
  targetType: "mod" | "comment";
  targetId: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
}

async function authedGet<T>(path: string, apiKey: string): Promise<T> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const res = await tauriFetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const rawBody = await res.text();
  let parsed: { error?: string };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error(res.ok ? "unexpected non-JSON response" : `request failed: ${res.status} ${rawBody.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(parsed.error ?? `request failed: ${res.status}`);
  return parsed as T;
}

export async function fetchAdminUsers(apiKey: string): Promise<AdminUser[]> {
  return authedGet("/api/admin/users", apiKey);
}

export async function banUser(userId: string, apiKey: string): Promise<void> {
  await authedJson("POST", `/api/admin/users/${userId}/ban`, {}, apiKey);
}

export async function unbanUser(userId: string, apiKey: string): Promise<void> {
  await authedJson("POST", `/api/admin/users/${userId}/unban`, {}, apiKey);
}

export async function deleteUserAdmin(userId: string, apiKey: string, reauthToken: string): Promise<void> {
  return authedDelete(`/api/admin/users/${userId}`, apiKey, reauthToken);
}

// --- Step-up re-authentication (routes/admin.ts § Step-up re-authentication) ---
// Used before the handful of admin actions gated behind requireReauth()
// there: kill-sessions, the site-wide kill-switches, hard-deleting an
// account. Throws the same way authedJson does — "incorrect password" is
// the expected failure mode, shown directly in the reauth prompt.
export async function reauth(password: string, apiKey: string): Promise<{ token: string; expiresAt: string }> {
  return authedJson("POST", "/api/admin/reauth", { password }, apiKey);
}

export async function fetchAdminReports(status: "open" | "resolved" | "dismissed" | "all", apiKey: string): Promise<AdminReport[]> {
  return authedGet(`/api/admin/reports?status=${status}`, apiKey);
}

export async function resolveReport(reportId: number, apiKey: string): Promise<void> {
  await authedJson("POST", `/api/admin/reports/${reportId}/resolve`, {}, apiKey);
}

export async function dismissReport(reportId: number, apiKey: string): Promise<void> {
  await authedJson("POST", `/api/admin/reports/${reportId}/dismiss`, {}, apiKey);
}

export async function deleteCommentAdmin(modId: string, commentId: number, apiKey: string): Promise<void> {
  return authedDelete(`/api/mods/${modId}/comments/${commentId}`, apiKey);
}

// --- Site controls ("oh shit" kill-switches) — see routes/admin.ts § Site controls ---

export interface SiteSettings {
  maintenanceMode: boolean;
  uploadsDisabled: boolean;
  signupsDisabled: boolean;
  commentsDisabled: boolean;
}

export async function fetchSiteSettings(apiKey: string): Promise<SiteSettings> {
  return authedGet("/api/admin/settings", apiKey);
}

export async function updateSiteSettings(patch: Partial<SiteSettings>, apiKey: string, reauthToken: string): Promise<SiteSettings> {
  return authedJson("PATCH", "/api/admin/settings", patch, apiKey, reauthToken);
}

export async function killAllSessions(apiKey: string, reauthToken: string): Promise<{ killedCount: number }> {
  return authedJson("POST", "/api/admin/kill-sessions", {}, apiKey, reauthToken);
}

export interface BannedIp {
  ip: string;
  reason: string | null;
  bannedAt: string;
}

export async function fetchBannedIps(apiKey: string): Promise<BannedIp[]> {
  return authedGet("/api/admin/banned-ips", apiKey);
}

export async function banIp(ip: string, reason: string, apiKey: string): Promise<void> {
  await authedJson("POST", "/api/admin/banned-ips", { ip, reason }, apiKey);
}

export async function unbanIp(ip: string, apiKey: string): Promise<void> {
  return authedDelete(`/api/admin/banned-ips/${encodeURIComponent(ip)}`, apiKey);
}
