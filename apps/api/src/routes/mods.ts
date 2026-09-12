import { Hono } from "hono";
import type { Env } from "../env";
import { authenticate } from "../auth";
import { checkRateLimit, clientIp } from "../rateLimit";
import { logModerationAction } from "../moderation";
import { getSetting } from "../appSettings";
import { createRelease, uploadReleaseAsset, deleteReleaseBestEffort } from "../github";
import { containsLink, containsProfanity } from "../contentFilters";
import { ALL_VERSIONS_TAG, GAME_VERSIONS } from "@openwf-mod-manager/shared";
import type {
  Comment,
  CommentVoteRequest,
  Mod,
  ModVersion,
  ModWithVersions,
  ReviewSummary,
  UpdateModMetadata,
  UploadMetadata,
} from "@openwf-mod-manager/shared";

export const mods = new Hono<{ Bindings: Env }>();

// OpenWF mods (metadata patches, .pluto scripts) are small text-based
// bundles — real-world examples top out well under 1 MB. This cap is
// generous headroom, not a sizing assumption; GitHub's own release-asset
// limit is 2 GB, far beyond anything this project needs.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_SCREENSHOTS = 10;
const MAX_TAGS = 15;
const MAX_TAG_LENGTH = 30;
const MAX_THEME_LENGTH = 40;
const MAX_SUB_AUTHOR_LENGTH = 60;
const MAX_COMMENT_BODY_LENGTH = 2000;
const MAX_AUTHOR_NAME_LENGTH = 40;
const MAX_COMMENTS_LISTED = 200;
const MAX_VOTER_ID_LENGTH = 100;

// 20 uploads/hour/modder — generous for legitimate iteration (pushing a
// few versions while testing), tight enough to cap a runaway script.
const UPLOAD_LIMIT = 20;
const UPLOAD_WINDOW_SECONDS = 60 * 60;
// 10 comments/10min/IP and 20 ratings/10min/IP — both anonymous, so IP is
// the only signal available; loose enough for genuine use.
const COMMENT_LIMIT = 10;
const COMMENT_WINDOW_SECONDS = 10 * 60;
const REVIEW_LIMIT = 20;
const REVIEW_WINDOW_SECONDS = 10 * 60;
// Voting is cheap to spam-click, so this is looser than comments/reviews
// but still bounded — same anonymous-per-IP model, see checkRateLimit.
const COMMENT_VOTE_LIMIT = 60;
const COMMENT_VOTE_WINDOW_SECONDS = 10 * 60;
// 60/10min/IP — generous; this is best-effort telemetry, not something
// worth ever blocking a real install/download over.
const DOWNLOAD_COUNT_LIMIT = 60;
const DOWNLOAD_COUNT_WINDOW_SECONDS = 10 * 60;

// Single-file mods (the common case) upload a raw .pluto/.txt directly —
// no zip/extraction step. .zip is still accepted for mods that need more
// than one file (e.g. a script with a companion data file, see
// docs/pluto-scripting-guide.md).
const ALLOWED_EXTENSIONS = [".zip", ".pluto", ".txt"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function sha256HexOf(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

// Extension checks alone accept any bytes as long as the filename ends in
// .zip/.pluto/.txt — a renamed binary (an .exe, say) sails straight through
// and gets redistributed via a public GitHub Release URL. This sniffs the
// actual content against what the extension claims: a real zip signature
// for .zip, valid UTF-8 text for the plain-text script extensions. Not a
// full antivirus scan — just closes the specific rename trick.
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04", the zip local-file-header signature

async function looksLikeValidUpload(file: File, extension: string): Promise<boolean> {
  if (extension === ".zip") {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return ZIP_MAGIC.every((b, i) => head[i] === b);
  }
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(await file.arrayBuffer());
    return true;
  } catch {
    return false;
  }
}

// Thumbnails/screenshots are external links only — this project never
// stores or serves the image bytes itself (see docs/architecture.md,
// "Images: external links only"). This just guards against non-http(s)
// schemes ending up in an <img src> in the desktop app.
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// A CSS object-position value like "62% 40%" — the focal point the
// uploader picked in the thumbnail positioner (Upload.tsx). Only the
// percentage-pair form is accepted; nothing here needs keywords like
// "left"/"top" or other length units.
const THUMBNAIL_POSITION_RE = /^(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/;

function validateThumbnailPosition(input: unknown): string | null {
  if (input === undefined) return "50% 50%";
  if (typeof input !== "string") return null;
  const m = THUMBNAIL_POSITION_RE.exec(input);
  if (!m) return null;
  const x = parseFloat(m[1]);
  const y = parseFloat(m[2]);
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  return input;
}

// Validates against the hardcoded GAME_VERSIONS list so a version's
// compatibility tags always mean something real. "all" is a sentinel and
// mutually exclusive with picking specific versions.
function validateGameVersions(input: unknown): string[] | null {
  if (input === undefined) return [ALL_VERSIONS_TAG];
  if (!Array.isArray(input) || input.length === 0) return null;
  if (input.length === 1 && input[0] === ALL_VERSIONS_TAG) return [ALL_VERSIONS_TAG];
  if (input.every((v) => typeof v === "string" && GAME_VERSIONS.includes(v))) return input;
  return null;
}

function validateScreenshotUrls(input: unknown): string[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > MAX_SCREENSHOTS) return null;
  if (input.every((v) => typeof v === "string" && isHttpUrl(v))) return input;
  return null;
}

// Free-form, user-defined tags (Notion-style) — unlike gameVersions,
// deliberately not validated against a fixed list. Just trimmed,
// deduplicated, and capped so nobody can stuff megabytes of text in here.
function validateTags(input: unknown): string[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > MAX_TAGS) return null;
  if (!input.every((v) => typeof v === "string")) return null;
  const cleaned = input.map((v) => v.trim()).filter((v) => v.length > 0 && v.length <= MAX_TAG_LENGTH);
  if (cleaned.length !== input.length) return null; // something was empty or too long
  return [...new Set(cleaned)];
}

// Thematic category (Gameplay, Cosmetic, ...) — free-form like tags, not
// validated against DEFAULT_MOD_THEMES, so a mod can introduce a new theme
// just by using it (same reasoning as validateTags above).
function validateTheme(input: unknown): string | null {
  if (input === undefined) return "Uncategorized";
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_THEME_LENGTH) return null;
  return trimmed;
}

// Optional co-creator/secondary-contributor credit — free text, same shape
// as validateTheme but nullable (most mods have no sub-author at all).
// undefined leaves the field untouched (PATCH) or unset (POST); null/""
// explicitly clears it.
function validateSubAuthor(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (input === undefined) return { ok: true, value: null };
  if (input === null) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false };
  const trimmed = input.trim();
  if (trimmed.length > MAX_SUB_AUTHOR_LENGTH) return { ok: false };
  return { ok: true, value: trimmed || null };
}

export function rowToVersion(row: any): ModVersion {
  return {
    id: row.id,
    modId: row.mod_id,
    version: row.version,
    fileName: row.file_name,
    downloadUrl: row.download_url,
    fileSize: row.file_size,
    checksum: row.checksum,
    gameVersions: JSON.parse(row.game_versions ?? '["all"]'),
    changelog: row.changelog,
    createdAt: row.created_at,
  };
}

function rowToComment(row: any): Comment {
  return {
    id: row.id,
    modId: row.mod_id,
    parentId: row.parent_id ?? null,
    authorName: row.author_name,
    authorAccountId: row.author_account_id ?? null,
    body: row.body,
    score: row.score ?? 0,
    myVote: (row.my_vote ?? 0) as -1 | 0 | 1,
    createdAt: row.created_at,
  };
}

export function rowToMod(row: any): Mod {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    subAuthor: row.sub_author ?? null,
    ownerId: row.owner_id,
    description: row.description,
    category: row.category,
    theme: row.theme ?? "Uncategorized",
    thumbnailUrl: row.thumbnail_url ?? null,
    thumbnailPosition: row.thumbnail_position ?? "50% 50%",
    screenshotUrls: JSON.parse(row.screenshot_urls ?? "[]"),
    tags: JSON.parse(row.tags ?? "[]"),
    downloadCount: row.download_count ?? 0,
    commentCount: row.comment_count ?? 0,
    reviewCount: row.review_count ?? 0,
    averageRating: row.avg_rating ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Appended to m.* in every mods listing query below so Browse can show a
// comment count and star rating per card without an extra request per mod.
// Exported so routes/modders.ts's public-profile mod list can reuse the
// exact same shape instead of drifting out of sync.
export const AGGREGATE_COLUMNS = `
     (SELECT COUNT(*) FROM comments c2 WHERE c2.mod_id = m.id) as comment_count,
     (SELECT COUNT(*) FROM reviews r2 WHERE r2.mod_id = m.id) as review_count,
     (SELECT AVG(rating) FROM reviews r2 WHERE r2.mod_id = m.id) as avg_rating`;

// Shared by every "mods + their latest version" listing query (GET /,
// GET /mine, and routes/modders.ts's public profile) — each row is a mod
// LEFT JOINed to just its newest version (v_id NULL when it has none yet).
export const LATEST_VERSION_JOIN_COLUMNS =
  "v.id as v_id, v.version, v.file_name, v.download_url, v.file_size, v.checksum, v.game_versions, v.changelog, v.created_at as v_created_at";

export function rowToModWithLatestVersion(row: any): ModWithVersions {
  return {
    ...rowToMod(row),
    versions: row.v_id
      ? [
          rowToVersion({
            id: row.v_id,
            mod_id: row.id,
            version: row.version,
            file_name: row.file_name,
            download_url: row.download_url,
            file_size: row.file_size,
            checksum: row.checksum,
            game_versions: row.game_versions,
            changelog: row.changelog,
            created_at: row.v_created_at,
          }),
        ]
      : [],
  };
}

// GET /api/mods — list every mod with its latest version, for the desktop
// app's browse/list view. Download URLs point straight at a GitHub release
// asset; the client never re-requests the Worker to fetch the actual file.
mods.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT m.*, ${LATEST_VERSION_JOIN_COLUMNS},
     ${AGGREGATE_COLUMNS}
     FROM mods m
     LEFT JOIN mod_versions v ON v.mod_id = m.id
     WHERE v.id = (SELECT id FROM mod_versions WHERE mod_id = m.id ORDER BY created_at DESC LIMIT 1)
        OR v.id IS NULL
     ORDER BY m.updated_at DESC`
  ).all();

  return c.json(results.map(rowToModWithLatestVersion));
});

// GET /api/mods/mine — every mod owned by the authenticated modder, for
// the "My Mods" tab. Registered ahead of GET /:id so "mine" is never
// swallowed as a mod id.
mods.get("/mine", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);

  const { results } = await c.env.DB.prepare(
    `SELECT m.*, ${LATEST_VERSION_JOIN_COLUMNS},
     ${AGGREGATE_COLUMNS}
     FROM mods m
     LEFT JOIN mod_versions v ON v.mod_id = m.id
     WHERE m.owner_id = ?
       AND (v.id = (SELECT id FROM mod_versions WHERE mod_id = m.id ORDER BY created_at DESC LIMIT 1) OR v.id IS NULL)
     ORDER BY m.updated_at DESC`
  )
    .bind(modder.id)
    .all();

  return c.json(results.map(rowToModWithLatestVersion));
});

// GET /api/mods/:id — full detail incl. every version (changelog history).
mods.get("/:id", async (c) => {
  const id = c.req.param("id");
  const modRow = await c.env.DB.prepare(`SELECT m.*, ${AGGREGATE_COLUMNS} FROM mods m WHERE m.id = ?`).bind(id).first();
  if (!modRow) return c.json({ error: "not found" }, 404);

  const { results: versionRows } = await c.env.DB.prepare(
    "SELECT * FROM mod_versions WHERE mod_id = ? ORDER BY created_at DESC"
  )
    .bind(id)
    .all();

  const result: ModWithVersions = {
    ...rowToMod(modRow),
    versions: versionRows.map((r: any) => rowToVersion(r)),
  };
  return c.json(result);
});

// PATCH /api/mods/:id — partial update of the mod's own record (name,
// description, thumbnail, screenshots, tags). Owner-only. Only fields
// present in the body are touched — the mod's id/slug never changes here
// (it's derived once at creation and every version/GitHub release is tied
// to it), and category/author aren't editable this way since category
// drives install-folder routing for every existing installed file.
mods.patch("/:id", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);

  const modId = c.req.param("id");
  const modRow = await c.env.DB.prepare("SELECT owner_id FROM mods WHERE id = ?").bind(modId).first<{
    owner_id: string;
  }>();
  if (!modRow) return c.json({ error: "not found" }, 404);
  if (modRow.owner_id !== modder.id) return c.json({ error: "forbidden — not the owner of this mod" }, 403);

  const body = await c.req.json<UpdateModMetadata>().catch(() => null);
  if (!body) return c.json({ error: "invalid JSON body" }, 400);

  const sets: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    if (!body.name.trim()) return c.json({ error: "name cannot be empty" }, 400);
    sets.push("name = ?");
    values.push(body.name.trim());
  }
  if (body.description !== undefined) {
    sets.push("description = ?");
    values.push(body.description);
  }
  if (body.thumbnailUrl !== undefined) {
    if (body.thumbnailUrl === null || body.thumbnailUrl === "") {
      sets.push("thumbnail_url = ?");
      values.push(null);
    } else if (isHttpUrl(body.thumbnailUrl)) {
      sets.push("thumbnail_url = ?");
      values.push(body.thumbnailUrl);
    } else {
      return c.json({ error: "thumbnailUrl must be an http(s) URL" }, 400);
    }
  }
  if (body.thumbnailPosition !== undefined) {
    const position = validateThumbnailPosition(body.thumbnailPosition);
    if (!position) return c.json({ error: "thumbnailPosition must look like 'NN% NN%'" }, 400);
    sets.push("thumbnail_position = ?");
    values.push(position);
  }
  if (body.screenshotUrls !== undefined) {
    const urls = validateScreenshotUrls(body.screenshotUrls);
    if (!urls) return c.json({ error: `screenshotUrls must be an array of http(s) URLs, max ${MAX_SCREENSHOTS}` }, 400);
    sets.push("screenshot_urls = ?");
    values.push(JSON.stringify(urls));
  }
  if (body.tags !== undefined) {
    const tags = validateTags(body.tags);
    if (!tags) return c.json({ error: `tags must be an array of non-empty strings, max ${MAX_TAGS}, each up to ${MAX_TAG_LENGTH} chars` }, 400);
    sets.push("tags = ?");
    values.push(JSON.stringify(tags));
  }
  if (body.theme !== undefined) {
    const theme = validateTheme(body.theme);
    if (!theme) return c.json({ error: `theme must be a non-empty string up to ${MAX_THEME_LENGTH} chars` }, 400);
    sets.push("theme = ?");
    values.push(theme);
  }
  if (body.subAuthor !== undefined) {
    const subAuthorResult = validateSubAuthor(body.subAuthor);
    if (!subAuthorResult.ok) return c.json({ error: `subAuthor must be a string up to ${MAX_SUB_AUTHOR_LENGTH} chars` }, 400);
    sets.push("sub_author = ?");
    values.push(subAuthorResult.value);
  }

  if (sets.length === 0) return c.json({ error: "no fields to update" }, 400);

  sets.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(modId);

  await c.env.DB.prepare(`UPDATE mods SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM mods WHERE id = ?").bind(modId).first();
  return c.json(rowToMod(updated));
});

// POST /api/mods/:id/download — fire-and-forget popularity counter. The
// actual file bytes are always fetched directly from GitHub's asset URL
// (see docs/architecture.md), never through the Worker — this just
// records that it happened, so Browse/detail can show a download count.
// Rate-limit failures no-op silently rather than erroring: this is
// best-effort telemetry, never worth interrupting a real install over.
mods.post("/:id/download", async (c) => {
  const allowed = await checkRateLimit(c, "download_count", clientIp(c), DOWNLOAD_COUNT_LIMIT, DOWNLOAD_COUNT_WINDOW_SECONDS);
  if (!allowed) return c.body(null, 204);

  const modId = c.req.param("id");
  const today = new Date().toISOString().slice(0, 10);
  // Same one-request batch as the rate limiter's own insert+count — see
  // rateLimit.ts for why D1's .batch() is used instead of two separate
  // awaits here (not a correctness issue in this case, just one round trip
  // instead of two for a route that already fires on every install).
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE mods SET download_count = download_count + 1 WHERE id = ?").bind(modId),
    c.env.DB.prepare(
      `INSERT INTO mod_download_daily (mod_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT (mod_id, day) DO UPDATE SET count = count + 1`
    ).bind(modId, today),
  ]);
  return c.body(null, 204);
});

// GET /api/mods/:id/analytics — owner or admin only. Weekly-bucketed
// downloads (mod_download_daily) and ratings (reviews.created_at) for the
// trailing ANALYTICS_WEEKS weeks, so an author can see whether an update
// actually moved the needle instead of only ever seeing running totals
// (mods.download_count, reviewCount/averageRating elsewhere in this file).
// Buckets count back from right now in fixed 7-day windows, not calendar
// weeks — the most recent bucket is always "the last 7 days," regardless
// of what day of the week it happens to be.
const ANALYTICS_WEEKS = 12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

mods.get("/:id/analytics", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);

  const modId = c.req.param("id");
  const modRow = await c.env.DB.prepare("SELECT owner_id FROM mods WHERE id = ?").bind(modId).first<{ owner_id: string }>();
  if (!modRow) return c.json({ error: "not found" }, 404);
  if (modRow.owner_id !== modder.id && !modder.isAdmin) {
    return c.json({ error: "forbidden — not the owner of this mod" }, 403);
  }

  const rangeStart = new Date(Date.now() - ANALYTICS_WEEKS * 7 * MS_PER_DAY);

  const [downloadResult, reviewResult] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT day, count FROM mod_download_daily WHERE mod_id = ? AND day >= ?").bind(
      modId,
      rangeStart.toISOString().slice(0, 10)
    ),
    c.env.DB.prepare("SELECT created_at, rating FROM reviews WHERE mod_id = ? AND created_at >= ?").bind(
      modId,
      rangeStart.toISOString()
    ),
  ]);
  const downloadRows = downloadResult.results as { day: string; count: number }[];
  const reviewRows = reviewResult.results as { created_at: string; rating: number }[];

  const weeks = [];
  const now = Date.now();
  for (let i = ANALYTICS_WEEKS - 1; i >= 0; i--) {
    const weekEnd = now - i * 7 * MS_PER_DAY;
    const weekStart = weekEnd - 7 * MS_PER_DAY;

    const downloads = downloadRows
      .filter((r) => new Date(r.day).getTime() >= weekStart && new Date(r.day).getTime() < weekEnd)
      .reduce((sum, r) => sum + r.count, 0);

    const weekReviews = reviewRows.filter((r) => {
      const t = new Date(r.created_at).getTime();
      return t >= weekStart && t < weekEnd;
    });
    const averageRating =
      weekReviews.length > 0 ? weekReviews.reduce((sum, r) => sum + r.rating, 0) / weekReviews.length : null;

    weeks.push({
      weekStart: new Date(weekStart).toISOString().slice(0, 10),
      downloads,
      reviewCount: weekReviews.length,
      averageRating,
    });
  }

  return c.json({ weeks });
});

// POST /api/mods — create a new mod + its first version.
// multipart/form-data: "file" (.zip, .pluto, or .txt), "metadata" (JSON
// body matching UploadMetadata). Requires a modder API key (see auth.ts)
// so uploads can't be spammed anonymously — the file is pushed to a
// GitHub Release, which has no billing surface at all, so the only real
// cost of abuse here is repo clutter, not money.
mods.post("/", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);
  if (!modder.isAdmin && (await getSetting(c.env, "uploads_disabled"))) {
    return c.json({ error: "uploads_disabled", message: "Uploads are temporarily disabled." }, 423);
  }

  const allowed = await checkRateLimit(c, "mod_upload", modder.id, UPLOAD_LIMIT, UPLOAD_WINDOW_SECONDS);
  if (!allowed) return c.json({ error: "too many uploads from this account — wait a bit and try again" }, 429);

  const form = await c.req.parseBody();
  const file = form["file"];
  const metadataRaw = form["metadata"];
  if (!(file instanceof File) || typeof metadataRaw !== "string") {
    return c.json({ error: "expected multipart fields 'file' and 'metadata'" }, 400);
  }
  if (file.size === 0) {
    return c.json({ error: "uploaded file is empty (0 bytes)" }, 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return c.json({ error: `file exceeds ${MAX_FILE_BYTES} byte limit` }, 413);
  }
  if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
    return c.json({ error: `only ${ALLOWED_EXTENSIONS.join(", ")} uploads are accepted` }, 400);
  }
  if (!(await looksLikeValidUpload(file, fileExtension(file.name)))) {
    return c.json({ error: "file content doesn't match its extension" }, 400);
  }

  let metadata: UploadMetadata;
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    return c.json({ error: "'metadata' field is not valid JSON" }, 400);
  }
  if (!metadata.name || !metadata.version || !metadata.category) {
    return c.json({ error: "metadata requires name, category, version" }, 400);
  }

  const gameVersions = validateGameVersions(metadata.gameVersions);
  if (!gameVersions) return c.json({ error: "gameVersions must be a non-empty array of known versions, or omitted" }, 400);

  if (metadata.thumbnailUrl !== undefined && !isHttpUrl(metadata.thumbnailUrl)) {
    return c.json({ error: "thumbnailUrl must be an http(s) URL" }, 400);
  }
  const thumbnailPosition = validateThumbnailPosition(metadata.thumbnailPosition);
  if (thumbnailPosition === null) {
    return c.json({ error: "thumbnailPosition must look like 'NN% NN%'" }, 400);
  }
  const screenshotUrls = validateScreenshotUrls(metadata.screenshotUrls);
  if (!screenshotUrls) return c.json({ error: `screenshotUrls must be an array of http(s) URLs, max ${MAX_SCREENSHOTS}` }, 400);

  const tags = validateTags(metadata.tags);
  if (!tags) return c.json({ error: `tags must be an array of non-empty strings, max ${MAX_TAGS}, each up to ${MAX_TAG_LENGTH} chars` }, 400);

  const theme = validateTheme(metadata.theme);
  if (!theme) return c.json({ error: `theme must be a non-empty string up to ${MAX_THEME_LENGTH} chars` }, 400);

  const subAuthorResult = validateSubAuthor(metadata.subAuthor);
  if (!subAuthorResult.ok) return c.json({ error: `subAuthor must be a string up to ${MAX_SUB_AUTHOR_LENGTH} chars` }, 400);

  const modId = slugify(metadata.name);
  if (!modId) return c.json({ error: "name produced an empty slug" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM mods WHERE id = ?").bind(modId).first();
  if (existing) {
    return c.json({ error: `mod '${modId}' already exists — use POST /api/mods/${modId}/versions` }, 409);
  }

  const buf = await file.arrayBuffer();
  const checksum = await sha256HexOf(buf);
  const assetName = `${modId}-${metadata.version}${fileExtension(file.name)}`;

  const release = await createRelease(c.env, modId, metadata.version, metadata.changelog);
  const asset = await uploadReleaseAsset(c.env, release.uploadUrl, assetName, buf);

  const now = new Date().toISOString();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO mods (id, name, author, sub_author, description, category, theme, thumbnail_url, thumbnail_position, screenshot_urls, tags, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        modId,
        metadata.name,
        // Always the uploading account's own name — never client-supplied,
        // so it can't be spoofed (see UploadMetadata.author's docstring).
        modder.name,
        subAuthorResult.value,
        metadata.description ?? "",
        metadata.category,
        theme,
        metadata.thumbnailUrl ?? null,
        thumbnailPosition,
        JSON.stringify(screenshotUrls),
        JSON.stringify(tags),
        modder.id,
        now,
        now
      ),
      c.env.DB.prepare(
        `INSERT INTO mod_versions (mod_id, version, file_name, download_url, github_release_id, file_size, checksum, game_versions, changelog, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        modId,
        metadata.version,
        file.name,
        asset.browserDownloadUrl,
        release.id,
        file.size,
        checksum,
        JSON.stringify(gameVersions),
        metadata.changelog ?? null,
        now
      ),
    ]);
  } catch (e) {
    await deleteReleaseBestEffort(c.env, release.id);
    throw e;
  }

  return c.json({ id: modId, downloadUrl: asset.browserDownloadUrl }, 201);
});

// POST /api/mods/:id/versions — add a new version to an existing mod.
// Only the mod's owner (matched by modder id) may add versions.
mods.post("/:id/versions", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);
  if (!modder.isAdmin && (await getSetting(c.env, "uploads_disabled"))) {
    return c.json({ error: "uploads_disabled", message: "Uploads are temporarily disabled." }, 423);
  }

  const allowed = await checkRateLimit(c, "mod_upload", modder.id, UPLOAD_LIMIT, UPLOAD_WINDOW_SECONDS);
  if (!allowed) return c.json({ error: "too many uploads from this account — wait a bit and try again" }, 429);

  const modId = c.req.param("id");
  const modRow = await c.env.DB.prepare("SELECT owner_id FROM mods WHERE id = ?").bind(modId).first<{
    owner_id: string;
  }>();
  if (!modRow) return c.json({ error: "not found" }, 404);
  if (modRow.owner_id !== modder.id) return c.json({ error: "forbidden — not the owner of this mod" }, 403);

  const form = await c.req.parseBody();
  const file = form["file"];
  const metadataRaw = form["metadata"];
  if (!(file instanceof File) || typeof metadataRaw !== "string") {
    return c.json({ error: "expected multipart fields 'file' and 'metadata'" }, 400);
  }
  if (file.size === 0) {
    return c.json({ error: "uploaded file is empty (0 bytes)" }, 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return c.json({ error: `file exceeds ${MAX_FILE_BYTES} byte limit` }, 413);
  }
  if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
    return c.json({ error: `only ${ALLOWED_EXTENSIONS.join(", ")} uploads are accepted` }, 400);
  }
  if (!(await looksLikeValidUpload(file, fileExtension(file.name)))) {
    return c.json({ error: "file content doesn't match its extension" }, 400);
  }

  let metadata: Pick<UploadMetadata, "version" | "changelog" | "gameVersions">;
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    return c.json({ error: "'metadata' field is not valid JSON" }, 400);
  }
  if (!metadata.version) return c.json({ error: "metadata requires version" }, 400);

  const gameVersions = validateGameVersions(metadata.gameVersions);
  if (!gameVersions) return c.json({ error: "gameVersions must be a non-empty array of known versions, or omitted" }, 400);

  const existingVersion = await c.env.DB.prepare("SELECT id FROM mod_versions WHERE mod_id = ? AND version = ?")
    .bind(modId, metadata.version)
    .first();
  if (existingVersion) {
    return c.json({ error: `version '${metadata.version}' already exists for this mod` }, 409);
  }

  const buf = await file.arrayBuffer();
  const checksum = await sha256HexOf(buf);
  const assetName = `${modId}-${metadata.version}${fileExtension(file.name)}`;

  const release = await createRelease(c.env, modId, metadata.version, metadata.changelog);
  const asset = await uploadReleaseAsset(c.env, release.uploadUrl, assetName, buf);

  const now = new Date().toISOString();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO mod_versions (mod_id, version, file_name, download_url, github_release_id, file_size, checksum, game_versions, changelog, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        modId,
        metadata.version,
        file.name,
        asset.browserDownloadUrl,
        release.id,
        file.size,
        checksum,
        JSON.stringify(gameVersions),
        metadata.changelog ?? null,
        now
      ),
      c.env.DB.prepare("UPDATE mods SET updated_at = ? WHERE id = ?").bind(now, modId),
    ]);
  } catch (e) {
    await deleteReleaseBestEffort(c.env, release.id);
    throw e;
  }

  return c.json({ id: modId, version: metadata.version, downloadUrl: asset.browserDownloadUrl }, 201);
});

// DELETE /api/mods/:id/versions/:version — remove a single version.
// The mod's owner may delete, or an admin acting as moderation (logged to
// moderation_actions when it's the admin bypass, not the owner, doing it).
// D1 row goes first so the API stops advertising it immediately; the
// GitHub release delete is best-effort after that — if it fails, the worst
// case is a harmless orphaned release with nothing in the listing pointing
// at it.
mods.delete("/:id/versions/:version", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);

  const modId = c.req.param("id");
  const version = c.req.param("version");

  const modRow = await c.env.DB.prepare("SELECT owner_id FROM mods WHERE id = ?").bind(modId).first<{
    owner_id: string;
  }>();
  if (!modRow) return c.json({ error: "not found" }, 404);
  const isOwner = modRow.owner_id === modder.id;
  if (!isOwner && !modder.isAdmin) return c.json({ error: "forbidden — not the owner of this mod" }, 403);

  const versionRow = await c.env.DB.prepare("SELECT github_release_id FROM mod_versions WHERE mod_id = ? AND version = ?")
    .bind(modId, version)
    .first<{ github_release_id: number }>();
  if (!versionRow) return c.json({ error: "version not found" }, 404);

  await c.env.DB.prepare("DELETE FROM mod_versions WHERE mod_id = ? AND version = ?").bind(modId, version).run();
  await deleteReleaseBestEffort(c.env, versionRow.github_release_id);
  if (!isOwner) await logModerationAction(c.env, modder.id, "delete_mod_version", "mod", `${modId}@${version}`);

  return c.body(null, 204);
});

// DELETE /api/mods/:id — remove a mod and every one of its versions.
// The mod's owner may delete, or an admin acting as moderation (logged).
// mod_versions rows cascade-delete via the schema's ON DELETE CASCADE;
// each version's GitHub release is then deleted best-effort.
mods.delete("/:id", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);

  const modId = c.req.param("id");
  const modRow = await c.env.DB.prepare("SELECT owner_id FROM mods WHERE id = ?").bind(modId).first<{
    owner_id: string;
  }>();
  if (!modRow) return c.json({ error: "not found" }, 404);
  const isOwner = modRow.owner_id === modder.id;
  if (!isOwner && !modder.isAdmin) return c.json({ error: "forbidden — not the owner of this mod" }, 403);

  const { results: versionRows } = await c.env.DB.prepare("SELECT github_release_id FROM mod_versions WHERE mod_id = ?")
    .bind(modId)
    .all<{ github_release_id: number }>();

  await c.env.DB.prepare("DELETE FROM mods WHERE id = ?").bind(modId).run();

  await Promise.all(versionRows.map((v) => deleteReleaseBestEffort(c.env, v.github_release_id)));
  if (!isOwner) await logModerationAction(c.env, modder.id, "delete_mod", "mod", modId);

  return c.body(null, 204);
});

// Appended to c.* wherever a comment needs its score/myVote filled in (the
// GET list below, and POST's response for the comment it just created — a
// bare INSERT...RETURNING * row has neither, so POST re-queries through
// this same shape instead of returning that row directly). The `?` is
// voterId, bound before mod_id/id in every caller. author_account_id is
// NOT computed here — it's a real column on comments, set once at insert
// time (see POST below), so `c.*` already carries it.
const COMMENT_ENRICHMENT_COLUMNS = `
     (SELECT COALESCE(SUM(value), 0) FROM comment_votes cv WHERE cv.comment_id = c.id) as score,
     (SELECT value FROM comment_votes cv2 WHERE cv2.comment_id = c.id AND cv2.voter_id = ?) as my_vote`;

// GET /api/mods/:id/comments?voterId=... — flat list (the client builds the
// reply tree from parentId, and applies its own Newest/Oldest/Top sort —
// see Browse's CommentSection). No auth required to read: this project has
// no account system for regular users, only modder API keys/sessions for
// uploads (see docs/architecture.md). authorName is whatever the commenter
// typed and is never verified; authorAccountId only links to a real
// profile when the poster was actually authenticated as that modder at
// post time (see POST below) — it is never inferred from authorName, which
// would let anyone impersonate any modder just by typing their name.
mods.get("/:id/comments", async (c) => {
  const modId = c.req.param("id");
  const mod = await c.env.DB.prepare("SELECT id FROM mods WHERE id = ?").bind(modId).first();
  if (!mod) return c.json({ error: "not found" }, 404);

  const voterId = c.req.query("voterId") ?? null;

  const { results } = await c.env.DB.prepare(
    `SELECT c.*, ${COMMENT_ENRICHMENT_COLUMNS}
     FROM comments c
     WHERE c.mod_id = ?
     ORDER BY c.created_at ASC
     LIMIT ?`
  )
    .bind(voterId, modId, MAX_COMMENTS_LISTED)
    .all();

  return c.json(results.map(rowToComment) as Comment[]);
});

// POST /api/mods/:id/comments — { authorName, body, parentId? }. Posting
// itself stays open to anyone (no login required), same billing-risk
// reasoning as the rest of this API: worst case is text spam, not money —
// see docs/architecture.md § Security & billing-risk notes. Links and
// basic profanity are rejected outright (contentFilters.ts) rather than
// silently censored, so the poster knows to edit and resubmit. Auth is
// optional and used only to decide authorAccountId (see below) — an
// invalid/missing token just means the comment posts unlinked, not a 401.
mods.post("/:id/comments", async (c) => {
  if (await getSetting(c.env, "comments_disabled")) {
    return c.json({ error: "comments_disabled", message: "Comments and ratings are temporarily disabled." }, 423);
  }

  const allowed = await checkRateLimit(c, "comment", clientIp(c), COMMENT_LIMIT, COMMENT_WINDOW_SECONDS);
  if (!allowed) return c.json({ error: "too many comments from this connection — wait a bit and try again" }, 429);

  const modId = c.req.param("id");
  const mod = await c.env.DB.prepare("SELECT id FROM mods WHERE id = ?").bind(modId).first();
  if (!mod) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{ authorName?: string; body?: string; parentId?: number | null }>().catch(() => null);
  const authorName = body?.authorName?.trim();
  const commentBody = body?.body?.trim();
  if (!authorName || authorName.length > MAX_AUTHOR_NAME_LENGTH) {
    return c.json({ error: `authorName must be 1-${MAX_AUTHOR_NAME_LENGTH} characters` }, 400);
  }
  if (!commentBody || commentBody.length > MAX_COMMENT_BODY_LENGTH) {
    return c.json({ error: `body must be 1-${MAX_COMMENT_BODY_LENGTH} characters` }, 400);
  }
  if (containsLink(commentBody)) {
    return c.json({ error: "links aren't allowed in comments" }, 400);
  }
  if (containsProfanity(authorName) || containsProfanity(commentBody)) {
    return c.json({ error: "comment contains language that isn't allowed here" }, 400);
  }

  let parentId: number | null = null;
  if (body?.parentId !== undefined && body.parentId !== null) {
    if (typeof body.parentId !== "number") return c.json({ error: "parentId must be a number" }, 400);
    const parent = await c.env.DB.prepare("SELECT id FROM comments WHERE id = ? AND mod_id = ?")
      .bind(body.parentId, modId)
      .first();
    if (!parent) return c.json({ error: "parentId does not refer to a comment on this mod" }, 400);
    parentId = body.parentId;
  }

  // Optional — a missing/invalid token just means an anonymous post, not a
  // rejection. When present, the comment is linked to the authenticated
  // modder's own account regardless of what authorName says, so a logged-in
  // user can't be impersonated by someone else typing their name, and
  // can't impersonate someone else by typing a different one either.
  const modder = await authenticate(c);
  const authorAccountId = modder?.id ?? null;

  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    "INSERT INTO comments (mod_id, parent_id, author_name, author_account_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
  )
    .bind(modId, parentId, authorName, authorAccountId, commentBody, now)
    .first<any>();

  // A brand-new comment can't have any votes yet — score/myVote are always 0.
  return c.json(rowToComment({ ...result, score: 0, my_vote: 0 }), 201);
});

// POST /api/mods/:modId/comments/:commentId/vote — { reviewerId, value }.
// value 1/-1 upserts this install's vote, 0 removes it. Same anonymous
// per-install identity reviews use (see reviewerId.ts) — voting doesn't
// require an account any more than commenting does.
mods.post("/:modId/comments/:commentId/vote", async (c) => {
  if (await getSetting(c.env, "comments_disabled")) {
    return c.json({ error: "comments_disabled", message: "Comments and ratings are temporarily disabled." }, 423);
  }

  const allowed = await checkRateLimit(c, "comment_vote", clientIp(c), COMMENT_VOTE_LIMIT, COMMENT_VOTE_WINDOW_SECONDS);
  if (!allowed) return c.json({ error: "too many votes from this connection — wait a bit and try again" }, 429);

  const modId = c.req.param("modId");
  const commentId = c.req.param("commentId");
  const comment = await c.env.DB.prepare("SELECT id FROM comments WHERE id = ? AND mod_id = ?")
    .bind(commentId, modId)
    .first();
  if (!comment) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<CommentVoteRequest>().catch(() => null);
  const voterId = body?.reviewerId?.trim();
  const value = body?.value;
  if (!voterId || voterId.length > MAX_VOTER_ID_LENGTH) {
    return c.json({ error: "reviewerId is required" }, 400);
  }
  if (value !== -1 && value !== 0 && value !== 1) {
    return c.json({ error: "value must be -1, 0, or 1" }, 400);
  }

  if (value === 0) {
    await c.env.DB.prepare("DELETE FROM comment_votes WHERE comment_id = ? AND voter_id = ?").bind(commentId, voterId).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO comment_votes (comment_id, voter_id, value, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (comment_id, voter_id) DO UPDATE SET value = excluded.value`
    )
      .bind(commentId, voterId, value, new Date().toISOString())
      .run();
  }

  const agg = await c.env.DB.prepare("SELECT COALESCE(SUM(value), 0) as score FROM comment_votes WHERE comment_id = ?")
    .bind(commentId)
    .first<{ score: number }>();

  return c.json({ score: agg?.score ?? 0, myVote: value });
});

// DELETE /api/mods/:modId/comments/:commentId — admin-only. Comments have
// no owner/account concept at all (authorName is free text), so unlike the
// mod/version deletes above this isn't a bypass of an existing owner-check
// — it's the only way this route has ever been deletable. Deletes the whole
// reply subtree: the schema declares parent_id ON DELETE CASCADE, but D1
// doesn't reliably apply FK actions in practice (see auth.ts's account
// delete for the same caveat), so this walks descendants itself via a
// recursive CTE instead of trusting the constraint.
mods.delete("/:modId/comments/:commentId", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);
  if (!modder.isAdmin) return c.json({ error: "forbidden — admin only" }, 403);

  const commentId = c.req.param("commentId");
  const exists = await c.env.DB.prepare("SELECT id FROM comments WHERE id = ?").bind(commentId).first();
  if (!exists) return c.json({ error: "not found" }, 404);

  const { results: descendants } = await c.env.DB.prepare(
    `WITH RECURSIVE subtree(id) AS (
       SELECT id FROM comments WHERE id = ?
       UNION ALL
       SELECT c.id FROM comments c JOIN subtree s ON c.parent_id = s.id
     )
     SELECT id FROM subtree`
  )
    .bind(commentId)
    .all<{ id: number }>();

  const ids = descendants.map((d) => d.id);
  const placeholders = ids.map(() => "?").join(", ");
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM comment_votes WHERE comment_id IN (${placeholders})`).bind(...ids),
    c.env.DB.prepare(`DELETE FROM comments WHERE id IN (${placeholders})`).bind(...ids),
  ]);

  await logModerationAction(c.env, modder.id, "delete_comment", "comment", `${commentId} (+${ids.length - 1} repl${ids.length - 1 === 1 ? "y" : "ies"})`);
  return c.body(null, 204);
});

// GET /api/mods/:id/reviews?reviewerId=... — aggregate rating, plus the
// caller's own rating if it sent its reviewerId (a per-install random UUID,
// see apps/desktop/src/reviewerId.ts — not a real account).
mods.get("/:id/reviews", async (c) => {
  const modId = c.req.param("id");
  const mod = await c.env.DB.prepare("SELECT id FROM mods WHERE id = ?").bind(modId).first();
  if (!mod) return c.json({ error: "not found" }, 404);

  const agg = await c.env.DB.prepare("SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE mod_id = ?")
    .bind(modId)
    .first<{ avg: number | null; count: number }>();

  let myRating: number | null = null;
  const reviewerId = c.req.query("reviewerId");
  if (reviewerId) {
    const mine = await c.env.DB.prepare("SELECT rating FROM reviews WHERE mod_id = ? AND reviewer_id = ?")
      .bind(modId, reviewerId)
      .first<{ rating: number }>();
    myRating = mine?.rating ?? null;
  }

  const summary: ReviewSummary = { average: agg?.avg ?? 0, count: agg?.count ?? 0, myRating };
  return c.json(summary);
});

// POST /api/mods/:id/reviews — { reviewerId, rating }. Upserts: rating the
// same mod again from the same install updates the existing row instead of
// adding a duplicate (see the reviews table's PRIMARY KEY in schema.sql).
mods.post("/:id/reviews", async (c) => {
  if (await getSetting(c.env, "comments_disabled")) {
    return c.json({ error: "comments_disabled", message: "Comments and ratings are temporarily disabled." }, 423);
  }

  const allowed = await checkRateLimit(c, "review", clientIp(c), REVIEW_LIMIT, REVIEW_WINDOW_SECONDS);
  if (!allowed) return c.json({ error: "too many ratings from this connection — wait a bit and try again" }, 429);

  const modId = c.req.param("id");
  const mod = await c.env.DB.prepare("SELECT id FROM mods WHERE id = ?").bind(modId).first();
  if (!mod) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{ reviewerId?: string; rating?: number }>().catch(() => null);
  const reviewerId = body?.reviewerId?.trim();
  const rating = body?.rating;
  if (!reviewerId || reviewerId.length > 100) {
    return c.json({ error: "reviewerId is required" }, 400);
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return c.json({ error: "rating must be an integer 1-5" }, 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO reviews (mod_id, reviewer_id, rating, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (mod_id, reviewer_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`
  )
    .bind(modId, reviewerId, rating, now, now)
    .run();

  const agg = await c.env.DB.prepare("SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE mod_id = ?")
    .bind(modId)
    .first<{ avg: number | null; count: number }>();

  const summary: ReviewSummary = { average: agg?.avg ?? 0, count: agg?.count ?? 0, myRating: rating };
  return c.json(summary, 201);
});
