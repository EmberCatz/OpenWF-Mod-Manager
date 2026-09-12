-- Blocks specific tag strings from being used on any future upload/edit —
-- same "ban future use" model as banned_ips, but for tags (see
-- routes/admin.ts § Category/tag taxonomy). Existing mods that already
-- carry a banned tag keep it until an admin explicitly removes it via the
-- taxonomy tools' "remove" action; banning only blocks new use.
-- Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0019_banned_tags.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0019_banned_tags.sql

CREATE TABLE IF NOT EXISTS banned_tags (
    tag        TEXT PRIMARY KEY,
    reason     TEXT,
    banned_at  TEXT NOT NULL DEFAULT (datetime('now')),
    banned_by  TEXT REFERENCES modders(id) ON DELETE SET NULL
);
