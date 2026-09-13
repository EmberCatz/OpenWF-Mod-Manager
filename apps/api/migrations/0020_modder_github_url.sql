-- Optional GitHub link on a creator's public profile (TODO.md § Ideas).
-- Self-editable via PATCH /api/auth/me, shown on views/Profile.tsx.
-- Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0020_modder_github_url.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0020_modder_github_url.sql

ALTER TABLE modders ADD COLUMN github_url TEXT;
