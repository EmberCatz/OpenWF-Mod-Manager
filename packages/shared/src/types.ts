// Shared between apps/api (Worker) and apps/desktop (Tauri UI).
// Mirrors the D1 schema in apps/api/schema.sql — keep both in sync by hand.

export type ModCategory = "metadata-patch" | "pluto-script" | "other";

// A thematic classification (Gameplay, Cosmetic, Cheat Tool, ...) distinct
// from ModCategory above (which is really a content *type* — see how
// Browse's sidebar labels its ModCategory filter "Type"). Not a fixed enum:
// like `tags`, the set of themes in actual use can grow past this seed list
// as mods are uploaded — this is just what Upload/Browse suggest first.
export const DEFAULT_MOD_THEMES = [
  "Gameplay",
  "Cosmetic",
  "Cheat Tool",
  "Utility",
  "Quality of Life",
  "UI/HUD",
  "Audio",
  "Performance",
];

// A fixed palette of profile-picture choices — not custom uploads, see
// docs/architecture.md's "images: external links only" reasoning and
// modders.avatar_key in schema.sql. Rendered client-side as a solid-color
// circle with the account's initial (components/Avatar.tsx); the key is
// all that's actually stored.
export const AVATAR_KEYS = ["amber", "crimson", "azure", "violet", "emerald", "slate", "rose", "cyan"] as const;
export type AvatarKey = (typeof AVATAR_KEYS)[number];
export const DEFAULT_AVATAR_KEY: AvatarKey = "amber";

export interface Mod {
  id: string; // slug, e.g. "ultimate-database"
  name: string;
  author: string;
  subAuthor: string | null; // optional co-creator/secondary contributor credit, free text
  ownerId: string; // the uploading account's modder id — see routes/modders.ts's public profile lookup
  description: string;
  category: ModCategory;
  theme: string; // thematic category, e.g. "Gameplay" — see DEFAULT_MOD_THEMES
  thumbnailUrl: string | null; // external link only — never hosted by this project, see docs/architecture.md
  thumbnailPosition: string; // CSS object-position, e.g. "50% 50%" — lets the uploader pick a focal point since the linked image can't actually be cropped/re-hosted
  screenshotUrls: string[]; // external links only, same reasoning
  tags: string[]; // free-form, user-defined (Notion-style) — unlike gameVersions, not validated against a fixed list
  downloadCount: number; // incremented via POST /api/mods/:id/download — best-effort, not a precise audit trail
  commentCount: number; // COUNT(*) from comments, computed server-side on every read
  reviewCount: number; // COUNT(*) from reviews, computed server-side on every read
  averageRating: number; // AVG(rating) from reviews, 0 when reviewCount is 0
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
  // Ignored server-side — the mod's author is always set to the uploading
  // account's own name (see routes/mods.ts's POST /), never client-supplied,
  // so it can't be spoofed. Kept as a field so older callers/typed code
  // don't break; send whatever, it's overwritten.
  author: string;
  subAuthor?: string; // see Mod.subAuthor
  description: string;
  category: ModCategory;
  theme?: string; // see Mod.theme — defaults to "Uncategorized" server-side if omitted
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
  theme?: string;
  subAuthor?: string | null;
}

export interface ApiError {
  error: string;
}

// A free-text comment left on a mod — still no login required to post (see
// apps/desktop/src/settings.ts's commenterName), authorName is just
// whatever the commenter typed and isn't a verified identity. parentId
// makes it a reply (Reddit-style nesting, built into a tree client-side
// from the flat list GET /:id/comments returns). authorAccountId is set
// server-side only when the poster was actually authenticated as that
// modder at post time (see routes/mods.ts) — never derived from
// authorName, so it can't be spoofed by typing someone else's name.
export interface Comment {
  id: number;
  modId: string;
  parentId: number | null;
  authorName: string;
  authorAccountId: string | null;
  body: string;
  score: number; // net upvotes - downvotes
  myVote: -1 | 0 | 1; // this install's own vote, via reviewerId — see routes/mods.ts's vote route
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

// POST /api/mods/:modId/comments/:commentId/vote body — value 0 removes an
// existing vote (toggling an up/downvote off), same upsert-or-delete shape
// reviews already use for reviewerId.
export interface CommentVoteRequest {
  reviewerId: string;
  value: -1 | 0 | 1;
}

// GET /api/modders/:id — a creator's public profile (routes/modders.ts).
// No auth required to read; this is the page a username link opens to.
export interface ModderProfile {
  id: string;
  name: string;
  avatarKey: string;
  createdAt: string; // ISO 8601
  mods: ModWithVersions[];
}
