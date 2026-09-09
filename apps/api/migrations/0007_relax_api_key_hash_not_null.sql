-- Fixes a gap in 0006_accounts.sql: adding username/password_hash as new
-- columns didn't relax modders.api_key_hash's original NOT NULL, so a
-- signup (which has no api_key_hash) failed with a constraint error.
-- SQLite can't drop a NOT NULL constraint directly, so this rebuilds the
-- table the standard way. schema.sql already reflects the fixed shape for
-- a fresh `db:init`. Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0007_relax_api_key_hash_not_null.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0007_relax_api_key_hash_not_null.sql

-- Required since mods.owner_id / sessions.modder_id reference modders(id)
-- — this is SQLite's own documented procedure for rebuilding a
-- foreign-key-referenced table (disable checking for the rebuild, verify
-- integrity after, re-enable). defer_foreign_keys alone wasn't enough
-- against the remote DB (learned the hard way — D1 rolled it back safely
-- both times, no data was ever at risk).
PRAGMA foreign_keys = OFF;

CREATE TABLE modders_new (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    api_key_hash  TEXT UNIQUE,
    username      TEXT UNIQUE,
    password_hash TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO modders_new (id, name, api_key_hash, username, password_hash, created_at)
SELECT id, name, api_key_hash, username, password_hash, created_at FROM modders;

DROP TABLE modders;
ALTER TABLE modders_new RENAME TO modders;

-- DROP TABLE takes modders' indexes with it — recreate the one from 0006.
CREATE UNIQUE INDEX IF NOT EXISTS idx_modders_username ON modders (username);

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
