-- Optional author-authored warning block — things to watch out for, what
-- could break (TODO.md § Ideas — "Mod risk/warning banner"). Purely
-- author-declared, same trust level as description; no admin/moderation
-- involvement.
-- Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0022_risk_notes.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0022_risk_notes.sql

ALTER TABLE mods ADD COLUMN risk_notes TEXT;
