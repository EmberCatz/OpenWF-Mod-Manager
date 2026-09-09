-- D1 schema for the OpenWF Mod Manager.
-- Apply with `npm run db:init` (local) or `npm run db:init:remote` (deployed DB).

CREATE TABLE IF NOT EXISTS modders (
    id            TEXT PRIMARY KEY,       -- uuid
    name          TEXT NOT NULL,
    api_key_hash  TEXT NOT NULL UNIQUE,   -- sha256(api_key + UPLOAD_API_KEY_SALT), hex
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mods (
    id           TEXT PRIMARY KEY,        -- slug, e.g. "ultimate-database"
    name         TEXT NOT NULL,
    author       TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    category     TEXT NOT NULL CHECK (category IN ('metadata-patch', 'pluto-script', 'other')),
    owner_id     TEXT NOT NULL REFERENCES modders(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mod_versions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id             TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    version            TEXT NOT NULL,           -- e.g. "1.2.0"
    download_url       TEXT NOT NULL,           -- GitHub release asset's browser_download_url (public, direct)
    github_release_id  INTEGER NOT NULL,        -- needed to delete/replace the release later
    file_size          INTEGER NOT NULL,        -- bytes
    checksum           TEXT NOT NULL,           -- sha256 of the zip, hex
    changelog          TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (mod_id, version)
);

CREATE INDEX IF NOT EXISTS idx_mod_versions_mod_id ON mod_versions (mod_id);
CREATE INDEX IF NOT EXISTS idx_mods_category ON mods (category);
