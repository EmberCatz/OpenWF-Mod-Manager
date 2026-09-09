// Shared between apps/api (Worker) and apps/desktop (Tauri UI).
// Mirrors the D1 schema in apps/api/schema.sql — keep both in sync by hand.

export type ModCategory = "metadata-patch" | "pluto-script" | "other";

export interface Mod {
  id: string; // slug, e.g. "ultimate-database"
  name: string;
  author: string;
  description: string;
  category: ModCategory;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface ModVersion {
  id: number;
  modId: string;
  version: string; // e.g. "1.2.0" or a date tag
  downloadUrl: string; // GitHub release asset's browser_download_url — client fetches this directly, not through the API
  fileSize: number; // bytes
  checksum: string; // sha256 of the zip, hex-encoded
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
}

export interface ApiError {
  error: string;
}
