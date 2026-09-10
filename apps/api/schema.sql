-- D1 schema for the OpenWF Mod Manager.
-- Apply with `npm run db:init` (local) or `npm run db:init:remote` (deployed DB).

-- api_key_hash is nullable so self-service accounts (username+password,
-- authenticated via the sessions table below) don't need one — it only
-- exists for the older out-of-band-issued keys (scripts/create-modder.mjs).
-- Both auth styles resolve to the same modder row; see auth.ts.
-- is_admin/is_banned are never settable via any HTTP route — only through
-- scripts/grant-admin.mjs's printed SQL, run directly against D1 by the
-- operator. See docs/architecture.md § Admin & moderation.
CREATE TABLE IF NOT EXISTS modders (
    id            TEXT PRIMARY KEY,       -- uuid
    name          TEXT NOT NULL,
    api_key_hash  TEXT UNIQUE,            -- sha256(api_key + UPLOAD_API_KEY_SALT), hex
    username      TEXT UNIQUE,            -- self-service account login, see routes/auth.ts
    password_hash TEXT,                   -- pbkdf2$<iterations>$<saltB64>$<hashB64>, see passwords.ts — never the plaintext
    is_admin      INTEGER NOT NULL DEFAULT 0,
    is_banned     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A logged-in session from username+password login. token_hash is checked
-- the same way api_key_hash is (see auth.ts's authenticate()), so a
-- session token works anywhere an API key does.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,   -- sha256(token + UPLOAD_API_KEY_SALT), hex
    modder_id   TEXT NOT NULL REFERENCES modders(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_modder_id ON sessions (modder_id);

CREATE TABLE IF NOT EXISTS mods (
    id              TEXT PRIMARY KEY,        -- slug, e.g. "ultimate-database"
    name            TEXT NOT NULL,
    author          TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    category        TEXT NOT NULL CHECK (category IN ('metadata-patch', 'pluto-script', 'other')),
    thumbnail_url      TEXT,                     -- external link only, never hosted here — see docs/architecture.md
    thumbnail_position TEXT NOT NULL DEFAULT '50% 50%', -- CSS object-position focal point, since the linked image can't be re-hosted/cropped
    screenshot_urls TEXT NOT NULL DEFAULT '[]', -- JSON array of external links, same reasoning
    tags            TEXT NOT NULL DEFAULT '[]', -- JSON array of free-form, user-defined tags (not validated against a fixed list)
    download_count  INTEGER NOT NULL DEFAULT 0, -- incremented via POST /api/mods/:id/download — best-effort, not a precise audit trail
    owner_id        TEXT NOT NULL REFERENCES modders(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mod_versions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id             TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    version            TEXT NOT NULL,           -- e.g. "1.2.0"
    file_name          TEXT NOT NULL,           -- original uploaded filename, e.g. "Swarm.pluto" or "my-mod.zip"
    download_url       TEXT NOT NULL,           -- GitHub release asset's browser_download_url (public, direct)
    github_release_id  INTEGER NOT NULL,        -- needed to delete/replace the release later
    file_size          INTEGER NOT NULL,        -- bytes
    checksum           TEXT NOT NULL,           -- sha256 of the file, hex
    game_versions      TEXT NOT NULL DEFAULT '["all"]', -- JSON array of GAME_VERSIONS entries, or ["all"]
    changelog          TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (mod_id, version)
);

CREATE INDEX IF NOT EXISTS idx_mod_versions_mod_id ON mod_versions (mod_id);
CREATE INDEX IF NOT EXISTS idx_mods_category ON mods (category);

CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id      TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_mod_id ON comments (mod_id);

-- One row per (mod, reviewer) — reviewer_id is a random UUID an install
-- generates once for itself (see apps/desktop/src/reviewerId.ts), not a
-- real account. Re-rating the same mod upserts this row instead of adding
-- a duplicate.
CREATE TABLE IF NOT EXISTS reviews (
    mod_id      TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL,
    rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (mod_id, reviewer_id)
);

-- Backs the D1-based rate limiter (src/rateLimit.ts) — a workers.dev
-- subdomain can't use Cloudflare's dashboard-level Rate Limiting Rules
-- (those need a zone/custom domain), so this is a plain counter table
-- instead. `bucket` scopes it per endpoint ("login", "signup",
-- "mod_upload"), `key` is whatever identifies the caller for that bucket
-- (client IP for anonymous endpoints, modder id for authenticated ones).
CREATE TABLE IF NOT EXISTS rate_limit_hits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket     TEXT NOT NULL,
    key        TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_lookup ON rate_limit_hits (bucket, key, created_at);

-- Lightweight moderation: anyone can flag a mod or a comment (see
-- routes/reports.ts). There's no in-app review queue/admin role yet — the
-- operator checks these directly (see apps/api/package.json's
-- "reports:list" script), so this table is intentionally just a mailbox,
-- not a full moderation workflow.
CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL CHECK (target_type IN ('mod', 'comment')),
    target_id   TEXT NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at);

-- Audit trail for admin actions (routes/admin.ts and the admin-bypass paths
-- in routes/mods.ts) — who did what to which mod/comment/user/report, and
-- when. Nothing reads this back in the app yet; it's there so an action can
-- be traced after the fact if a moderation call is disputed.
-- admin_id is nullable with ON DELETE SET NULL — the audit trail survives
-- the actor's account being deleted (it just loses attribution), rather
-- than blocking the deletion outright (see migration 0011).
CREATE TABLE IF NOT EXISTS moderation_actions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    TEXT REFERENCES modders(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    details     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_target ON moderation_actions (target_type, target_id);

-- Admin "oh shit" kill-switches, checked by index.ts's maintenance
-- middleware plus per-route uploads/signups/comments toggles (see
-- routes/admin.ts and appSettings.ts). key/value pairs rather than fixed
-- columns so a new switch never needs a schema change, just a new key.
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by  TEXT REFERENCES modders(id) ON DELETE SET NULL
);

-- IP-level ban, separate from modders.is_banned — abuse from an anonymous
-- or throwaway account still comes from an IP the per-account ban can't
-- touch (comments/reviews/reports have no account concept at all).
CREATE TABLE IF NOT EXISTS banned_ips (
    ip         TEXT PRIMARY KEY,
    reason     TEXT,
    banned_at  TEXT NOT NULL DEFAULT (datetime('now')),
    banned_by  TEXT REFERENCES modders(id) ON DELETE SET NULL
);
