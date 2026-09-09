import { Hono } from "hono";
import type { Env } from "../env";
import { authenticate } from "../auth";
import { createRelease, uploadReleaseAsset, deleteReleaseBestEffort } from "../github";
import type { Mod, ModVersion, ModWithVersions, UploadMetadata } from "@openwf-mod-manager/shared";

export const mods = new Hono<{ Bindings: Env }>();

// OpenWF mods (metadata patches, .pluto scripts) are small text-based
// bundles — real-world examples top out well under 1 MB. This cap is
// generous headroom, not a sizing assumption; GitHub's own release-asset
// limit is 2 GB, far beyond anything this project needs.
const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB

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

function rowToVersion(row: any): ModVersion {
  return {
    id: row.id,
    modId: row.mod_id,
    version: row.version,
    downloadUrl: row.download_url,
    fileSize: row.file_size,
    checksum: row.checksum,
    changelog: row.changelog,
    createdAt: row.created_at,
  };
}

function rowToMod(row: any): Mod {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    description: row.description,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/mods — list every mod with its latest version, for the desktop
// app's browse/list view. Download URLs point straight at a GitHub release
// asset; the client never re-requests the Worker to fetch the actual zip.
mods.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT m.*, v.id as v_id, v.version, v.download_url, v.file_size, v.checksum, v.changelog, v.created_at as v_created_at
     FROM mods m
     LEFT JOIN mod_versions v ON v.mod_id = m.id
     WHERE v.id = (SELECT id FROM mod_versions WHERE mod_id = m.id ORDER BY created_at DESC LIMIT 1)
        OR v.id IS NULL
     ORDER BY m.updated_at DESC`
  ).all();

  const list: ModWithVersions[] = results.map((row: any) => ({
    ...rowToMod(row),
    versions: row.v_id
      ? [
          rowToVersion({
            id: row.v_id,
            mod_id: row.id,
            version: row.version,
            download_url: row.download_url,
            file_size: row.file_size,
            checksum: row.checksum,
            changelog: row.changelog,
            created_at: row.v_created_at,
          }),
        ]
      : [],
  }));

  return c.json(list);
});

// GET /api/mods/:id — full detail incl. every version (changelog history).
mods.get("/:id", async (c) => {
  const id = c.req.param("id");
  const modRow = await c.env.DB.prepare("SELECT * FROM mods WHERE id = ?").bind(id).first();
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

// POST /api/mods — create a new mod + its first version.
// multipart/form-data: "file" (the zip), "metadata" (JSON body matching
// UploadMetadata). Requires a modder API key (see auth.ts) so uploads
// can't be spammed anonymously — the zip is pushed to a GitHub Release,
// which has no billing surface at all, so the only real cost of abuse here
// is repo clutter, not money.
mods.post("/", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);

  const form = await c.req.parseBody();
  const file = form["file"];
  const metadataRaw = form["metadata"];
  if (!(file instanceof File) || typeof metadataRaw !== "string") {
    return c.json({ error: "expected multipart fields 'file' and 'metadata'" }, 400);
  }
  if (file.size > MAX_ZIP_BYTES) {
    return c.json({ error: `file exceeds ${MAX_ZIP_BYTES} byte limit` }, 413);
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return c.json({ error: "only .zip uploads are accepted" }, 400);
  }

  let metadata: UploadMetadata;
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    return c.json({ error: "'metadata' field is not valid JSON" }, 400);
  }
  if (!metadata.name || !metadata.author || !metadata.version || !metadata.category) {
    return c.json({ error: "metadata requires name, author, category, version" }, 400);
  }

  const modId = slugify(metadata.name);
  if (!modId) return c.json({ error: "name produced an empty slug" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM mods WHERE id = ?").bind(modId).first();
  if (existing) {
    return c.json({ error: `mod '${modId}' already exists — use POST /api/mods/${modId}/versions` }, 409);
  }

  const buf = await file.arrayBuffer();
  const checksum = await sha256HexOf(buf);

  const release = await createRelease(c.env, modId, metadata.version, metadata.changelog);
  const asset = await uploadReleaseAsset(c.env, release.uploadUrl, `${modId}-${metadata.version}.zip`, buf);

  const now = new Date().toISOString();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO mods (id, name, author, description, category, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(modId, metadata.name, metadata.author, metadata.description ?? "", metadata.category, modder.id, now, now),
      c.env.DB.prepare(
        `INSERT INTO mod_versions (mod_id, version, download_url, github_release_id, file_size, checksum, changelog, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(modId, metadata.version, asset.browserDownloadUrl, release.id, file.size, checksum, metadata.changelog ?? null, now),
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
  if (file.size > MAX_ZIP_BYTES) {
    return c.json({ error: `file exceeds ${MAX_ZIP_BYTES} byte limit` }, 413);
  }

  let metadata: Pick<UploadMetadata, "version" | "changelog">;
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    return c.json({ error: "'metadata' field is not valid JSON" }, 400);
  }
  if (!metadata.version) return c.json({ error: "metadata requires version" }, 400);

  const existingVersion = await c.env.DB.prepare("SELECT id FROM mod_versions WHERE mod_id = ? AND version = ?")
    .bind(modId, metadata.version)
    .first();
  if (existingVersion) {
    return c.json({ error: `version '${metadata.version}' already exists for this mod` }, 409);
  }

  const buf = await file.arrayBuffer();
  const checksum = await sha256HexOf(buf);

  const release = await createRelease(c.env, modId, metadata.version, metadata.changelog);
  const asset = await uploadReleaseAsset(c.env, release.uploadUrl, `${modId}-${metadata.version}.zip`, buf);

  const now = new Date().toISOString();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO mod_versions (mod_id, version, download_url, github_release_id, file_size, checksum, changelog, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(modId, metadata.version, asset.browserDownloadUrl, release.id, file.size, checksum, metadata.changelog ?? null, now),
      c.env.DB.prepare("UPDATE mods SET updated_at = ? WHERE id = ?").bind(now, modId),
    ]);
  } catch (e) {
    await deleteReleaseBestEffort(c.env, release.id);
    throw e;
  }

  return c.json({ id: modId, version: metadata.version, downloadUrl: asset.browserDownloadUrl }, 201);
});
