-- Optional mod-specific install steps, separate from the general
-- description (TODO.md § Ideas — "Optional install-instructions field").
-- Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0021_install_instructions.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0021_install_instructions.sql

ALTER TABLE mods ADD COLUMN install_instructions TEXT;
