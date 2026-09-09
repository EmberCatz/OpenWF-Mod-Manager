-- One-off migration for DBs created before rate limiting existed.
-- schema.sql already has this table for a fresh `db:init`; this file is
-- only for applying the same change to an existing local/remote DB
-- without losing data. Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0008_rate_limits.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0008_rate_limits.sql

CREATE TABLE IF NOT EXISTS rate_limit_hits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket     TEXT NOT NULL,
    key        TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_lookup ON rate_limit_hits (bucket, key, created_at);
