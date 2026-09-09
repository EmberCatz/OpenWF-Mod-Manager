-- One-off migration for DBs created before self-service username/password
-- accounts existed. schema.sql already has these changes for a fresh
-- `db:init`; this file is only for applying the same change to an
-- existing local/remote DB without losing data. Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0006_accounts.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0006_accounts.sql
--
-- Existing api_key_hash-only modders are untouched and keep working exactly
-- as before — this only adds new, nullable columns plus the sessions table.

ALTER TABLE modders ADD COLUMN username TEXT;
ALTER TABLE modders ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_modders_username ON modders (username);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    modder_id   TEXT NOT NULL REFERENCES modders(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_modder_id ON sessions (modder_id);
