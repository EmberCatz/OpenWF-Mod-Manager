-- Multi-file mod versions (feature request): a version can now bundle
-- several raw .pluto/.txt files (each its own GitHub release asset)
-- instead of exactly one, and .zip uploads are no longer accepted at all
-- (see routes/mods.ts). Replaces the four single-file columns with one
-- JSON array column, same convention tags/screenshot_urls already use.
-- Existing rows' single file is wrapped into a one-entry array first, so
-- already-uploaded versions keep downloading/previewing exactly as
-- before instead of losing their file.
-- Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0024_mod_version_files.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0024_mod_version_files.sql

ALTER TABLE mod_versions ADD COLUMN files TEXT NOT NULL DEFAULT '[]';

UPDATE mod_versions
SET files = json_array(json_object('fileName', file_name, 'downloadUrl', download_url, 'fileSize', file_size, 'checksum', checksum))
WHERE files = '[]';

ALTER TABLE mod_versions DROP COLUMN file_name;
ALTER TABLE mod_versions DROP COLUMN download_url;
ALTER TABLE mod_versions DROP COLUMN file_size;
ALTER TABLE mod_versions DROP COLUMN checksum;
