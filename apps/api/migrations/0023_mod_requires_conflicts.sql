-- Author-declared "requires X" / "conflicts with Y" between mods
-- (TODO.md § Ideas) — stated intent, distinct from the existing
-- client-side file-path collision *detection* (ModConflictError). JSON
-- arrays of other mods' ids, same convention as tags/screenshot_urls.
-- Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0023_mod_requires_conflicts.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0023_mod_requires_conflicts.sql

ALTER TABLE mods ADD COLUMN requires_mod_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE mods ADD COLUMN conflicts_with_mod_ids TEXT NOT NULL DEFAULT '[]';
