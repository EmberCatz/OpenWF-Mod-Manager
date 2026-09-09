-- One-off migration for DBs created before comments/reviews existed.
-- schema.sql already has these tables for a fresh `db:init`; this file is
-- only for applying the same change to an existing local/remote DB
-- without losing data. Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0004_comments_and_reviews.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0004_comments_and_reviews.sql

CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id      TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_mod_id ON comments (mod_id);

CREATE TABLE IF NOT EXISTS reviews (
    mod_id      TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL,
    rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (mod_id, reviewer_id)
);
