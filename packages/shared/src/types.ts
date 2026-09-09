// Shared between apps/api (Worker) and apps/desktop (Tauri UI).
// Mirrors the D1 schema in apps/api/schema.sql — keep both in sync by hand.

export type ModCategory = "metadata-patch" | "pluto-script" | "other";

export interface Mod {
  id: string; // slug, e.g. "ultimate-database"
  name: string;
  author: string;
  description: string;
  category: ModCategory;
  thumbnailUrl: string | null; // external link only — never hosted by this project, see docs/architecture.md
  thumbnailPosition: string; // CSS object-position, e.g. "50% 50%" — lets the uploader pick a focal point since the linked image can't actually be cropped/re-hosted
  screenshotUrls: string[]; // external links only, same reasoning
  tags: string[]; // free-form, user-defined (Notion-style) — unlike gameVersions, not validated against a fixed list
  downloadCount: number; // incremented via POST /api/mods/:id/download — best-effort, not a precise audit trail
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface ModVersion {
  id: number;
  modId: string;
  version: string; // e.g. "1.2.0" or a date tag
  fileName: string; // original uploaded filename, e.g. "Swarm.pluto" or "my-mod.zip" — determines raw-file vs zip install handling
  downloadUrl: string; // GitHub release asset's browser_download_url — client fetches this directly, not through the API
  fileSize: number; // bytes
  checksum: string; // sha256 of the file, hex-encoded
  gameVersions: string[]; // GAME_VERSIONS entries this version is tagged compatible with, or ["all"]
  changelog: string | null;
  createdAt: string; // ISO 8601
}

export interface ModWithVersions extends Mod {
  versions: ModVersion[];
}

// Request body for POST /api/mods and POST /api/mods/:id/versions.
// The zip itself travels as multipart form data alongside this JSON blob
// (field name "metadata"); see apps/api/src/routes/mods.ts.
export interface UploadMetadata {
  name: string;
  author: string;
  description: string;
  category: ModCategory;
  version: string;
  changelog?: string;
  gameVersions?: string[]; // defaults to ["all"] server-side if omitted
  thumbnailUrl?: string; // external link only — see Mod.thumbnailUrl
  thumbnailPosition?: string; // see Mod.thumbnailPosition — defaults to "50% 50%" server-side
  screenshotUrls?: string[]; // external links only — see Mod.screenshotUrls
  tags?: string[]; // free-form — see Mod.tags
}

// PATCH /api/mods/:id — partial update of a mod's own record (not its
// versions/files, see UploadMetadata for that). Owner-only. A field only
// changes if its key is present in the body — omit a key to leave it
// alone. thumbnailUrl accepts null/"" to clear it.
export interface UpdateModMetadata {
  name?: string;
  description?: string;
  thumbnailUrl?: string | null;
  thumbnailPosition?: string;
  screenshotUrls?: string[];
  tags?: string[];
}

export interface ApiError {
  error: string;
}

// A free-text comment left on a mod. No account system exists in this
// project — authorName is just whatever the commenter typed (see
// apps/desktop/src/settings.ts's commenterName), not a verified identity.
export interface Comment {
  id: number;
  modId: string;
  authorName: string;
  body: string;
  createdAt: string; // ISO 8601
}

// A single reviewer's star rating for a mod. reviewerId is a random UUID
// generated once per install (apps/desktop/src/reviewerId.ts) and persisted
// in localStorage — enough to let someone update their own rating, not a
// real identity or anti-abuse mechanism.
export interface Review {
  modId: string;
  reviewerId: string;
  rating: number; // 1-5
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// GET /api/mods/:id/reviews response — the aggregate plus (optionally)
// what this install itself rated it.
export interface ReviewSummary {
  average: number; // 0 when count is 0
  count: number;
  myRating: number | null;
}
