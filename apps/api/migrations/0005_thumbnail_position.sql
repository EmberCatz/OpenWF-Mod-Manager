-- One-off migration for DBs created before thumbnail focal-point
-- positioning existed. schema.sql already has this column for a fresh
-- `db:init`; this file is only for applying the same change to an
-- existing local/remote DB without losing data. Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0005_thumbnail_position.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0005_thumbnail_position.sql

ALTER TABLE mods ADD COLUMN thumbnail_position TEXT NOT NULL DEFAULT '50% 50%';
