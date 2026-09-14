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
    avatar_key    TEXT NOT NULL DEFAULT 'amber', -- one of shared's AVATAR_KEYS — a fixed palette, not a custom upload, see routes/modders.ts
    github_url    TEXT,                   -- optional, self-editable via PATCH /api/auth/me, shown on views/Profile.tsx
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

-- Step-up re-authentication for the handful of admin actions where a
-- stolen-but-valid token does the most damage (kill-all-sessions, site-wide
-- kill-switches, hard-deleting an account) — see TODO.md § Security. A
-- short-lived, single-use token proving the caller just re-entered the
-- account's password, checked by routes/admin.ts's requireReauth() on top
-- of the normal requireAdmin() check.
CREATE TABLE IF NOT EXISTS reauth_tokens (
    token_hash  TEXT PRIMARY KEY,
    modder_id   TEXT NOT NULL REFERENCES modders(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reauth_tokens_modder ON reauth_tokens(modder_id);

CREATE TABLE IF NOT EXISTS mods (
    id              TEXT PRIMARY KEY,        -- slug, e.g. "ultimate-database"
    name            TEXT NOT NULL,
    author          TEXT NOT NULL,          -- always the owning account's own name, set server-side — see routes/mods.ts's POST /
    sub_author      TEXT,                   -- optional free-text co-creator/secondary-contributor credit
    description     TEXT NOT NULL DEFAULT '',
    install_instructions TEXT,             -- optional, mod-specific install steps, separate from description
    risk_notes      TEXT,                  -- optional author-authored warning block (what could break) — no admin involvement
    category        TEXT NOT NULL CHECK (category IN ('metadata-patch', 'pluto-script', 'other')),
    theme           TEXT NOT NULL DEFAULT 'Uncategorized', -- thematic category (Gameplay, Cosmetic, ...), not a fixed enum — see DEFAULT_MOD_THEMES
    thumbnail_url      TEXT,                     -- external link only, never hosted here — see docs/architecture.md
    thumbnail_position TEXT NOT NULL DEFAULT '50% 50%', -- CSS object-position focal point, since the linked image can't be re-hosted/cropped
    screenshot_urls TEXT NOT NULL DEFAULT '[]', -- JSON array of external links, same reasoning
    tags            TEXT NOT NULL DEFAULT '[]', -- JSON array of free-form, user-defined tags (not validated against a fixed list)
    requires_mod_ids       TEXT NOT NULL DEFAULT '[]', -- JSON array of other mods.id — author-declared "works best with", not enforced at install
    conflicts_with_mod_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of other mods.id — author-declared, distinct from the client-side file-path collision *detection*
    download_count  INTEGER NOT NULL DEFAULT 0, -- incremented via POST /api/mods/:id/download — best-effort, not a precise audit trail
    owner_id        TEXT NOT NULL REFERENCES modders(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mod_versions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id             TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    version            TEXT NOT NULL,           -- e.g. "1.2.0"
    files              TEXT NOT NULL,           -- JSON array of {fileName, downloadUrl, fileSize, checksum} — one or more raw .pluto/.txt files, each its own GitHub release asset (never a zip — see routes/mods.ts)
    github_release_id  INTEGER NOT NULL,        -- needed to delete/replace the release later
    game_versions      TEXT NOT NULL DEFAULT '["all"]', -- JSON array of GAME_VERSIONS entries, or ["all"]
    changelog          TEXT,
    -- Informational only, never a visibility gate (this version is public
    -- the moment it's uploaded, same as before) — see src/scan.ts. Worst-of
    -- across this version's files' file_scans.status, recomputed by the
    -- scheduled scan cycle as each file resolves.
    scan_status        TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'flagged', 'error')),
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (mod_id, version)
);

CREATE INDEX IF NOT EXISTS idx_mod_versions_mod_id ON mod_versions (mod_id);
CREATE INDEX IF NOT EXISTS idx_mods_category ON mods (category);
CREATE INDEX IF NOT EXISTS idx_mods_theme ON mods (theme);

-- Content-addressed VirusTotal scan state, one row per distinct uploaded
-- file (keyed by the same sha256 checksum mod_versions.files[].checksum
-- already carries) — see src/scan.ts. Keying by checksum instead of by
-- version/file means an identical file re-uploaded under a different mod
-- or version is never re-submitted to VT, which matters a lot against the
-- free tier's 4-requests/minute cap. download_url is whichever copy's
-- GitHub release asset URL was seen first, used only to fetch bytes to
-- submit — it doesn't need to stay in sync with every mod that happens to
-- reference this checksum.
CREATE TABLE IF NOT EXISTS file_scans (
    checksum       TEXT PRIMARY KEY,
    download_url   TEXT NOT NULL,
    vt_analysis_id TEXT,                    -- set once submitted to VT, while awaiting a completed analysis
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'clean', 'flagged', 'error')),
    positives      INTEGER,                 -- engines that flagged it, once resolved
    attempts       INTEGER NOT NULL DEFAULT 0, -- capped in src/scan.ts — repeated failures land on 'error' instead of retrying forever
    submitted_at   TEXT,
    resolved_at    TEXT
);

-- Backs the author-analytics downloads-over-time trend (TODO.md § Author
-- analytics). mods.download_count (above) is a running total only —
-- POST /:id/download never recorded a per-event row, so there was no way
-- to reconstruct "how many downloads did this mod get last week" after the
-- fact. A daily rollup (upserted once per download, see routes/mods.ts)
-- keeps that answerable while bounding growth to one row per mod per day
-- it's actually downloaded, rather than one row per download forever.
CREATE TABLE IF NOT EXISTS mod_download_daily (
    mod_id  TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    day     TEXT NOT NULL, -- YYYY-MM-DD, UTC
    count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (mod_id, day)
);

CREATE TABLE IF NOT EXISTS comments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id            TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    parent_id         INTEGER REFERENCES comments(id) ON DELETE CASCADE, -- NULL = top-level; a reply otherwise (Reddit-style nesting). D1 doesn't reliably enforce ON DELETE actions (see routes/auth.ts's account-delete comment) — the admin delete route walks + deletes descendants itself, this is documentation of intent
    author_name       TEXT NOT NULL,
    author_account_id TEXT REFERENCES modders(id), -- set at insert time only when the poster was actually authenticated as this modder (see routes/mods.ts POST /:id/comments) — never derived from author_name, which is unverified free text anyone can type
    body              TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_mod_id ON comments (mod_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments (parent_id);

-- One vote per (comment, voter) — voter_id is the same per-install random
-- id reviews use (reviewerId.ts), not a real account; anonymous and
-- best-effort, same trust model as reviews. value 1/-1 only; "removing"
-- a vote deletes the row rather than storing 0.
CREATE TABLE IF NOT EXISTS comment_votes (
    comment_id  INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    voter_id    TEXT NOT NULL,
    value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (comment_id, voter_id)
);

-- One row per (mod, reviewer) that has liked it — reviewer_id is a random
-- UUID an install generates once for itself (see
-- apps/desktop/src/reviewerId.ts), not a real account. Liking again toggles
-- the row off (see POST /api/mods/:id/likes) rather than ever stacking
-- duplicates.
CREATE TABLE IF NOT EXISTS mod_likes (
    mod_id      TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
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

-- Blocks specific tag strings from future upload/edit use — same model as
-- banned_ips above, but for tags/theme taxonomy (see routes/admin.ts §
-- Category/tag taxonomy). Existing mods keep a banned tag until an admin
-- explicitly removes it; banning only blocks new use.
CREATE TABLE IF NOT EXISTS banned_tags (
    tag        TEXT PRIMARY KEY,
    reason     TEXT,
    banned_at  TEXT NOT NULL DEFAULT (datetime('now')),
    banned_by  TEXT REFERENCES modders(id) ON DELETE SET NULL
);
