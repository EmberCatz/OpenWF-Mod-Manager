-- One-off migration for DBs created before thumbnails/screenshots/game-version
-- tags/raw-file uploads existed. schema.sql already has these columns for a
-- fresh `db:init`; this file is only for applying the same change to an
-- existing local/remote DB without losing data. Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0002_versions_and_images.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0002_versions_and_images.sql

ALTER TABLE mods ADD COLUMN thumbnail_url TEXT;
ALTER TABLE mods ADD COLUMN screenshot_urls TEXT NOT NULL DEFAULT '[]';

ALTER TABLE mod_versions ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE mod_versions ADD COLUMN game_versions TEXT NOT NULL DEFAULT '["all"]';

-- Backfill file_name for rows uploaded before this column existed, using the
-- naming convention the API has always used: "<modId>-<version>.zip".
UPDATE mod_versions SET file_name = mod_id || '-' || version || '.zip' WHERE file_name = '';
