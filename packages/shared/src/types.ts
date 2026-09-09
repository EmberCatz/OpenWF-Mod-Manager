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
  screenshotUrls: string[]; // external links only, same reasoning
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
  screenshotUrls?: string[]; // external links only — see Mod.screenshotUrls
}

export interface ApiError {
  error: string;
}
