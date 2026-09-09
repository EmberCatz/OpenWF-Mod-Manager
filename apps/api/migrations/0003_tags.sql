-- One-off migration for DBs created before free-form mod tags existed.
-- schema.sql already has this column for a fresh `db:init`; this file is
-- only for applying the same change to an existing local/remote DB
-- without losing data. Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0003_tags.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0003_tags.sql

ALTER TABLE mods ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
