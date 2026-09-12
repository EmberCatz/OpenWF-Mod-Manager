-- Replaces the 1-5 star `reviews` table with a simple per-reviewer like/
-- unlike toggle (TODO.md § Mod Rating System Overhaul). Existing reviews
-- carry over as likes — one per (mod, reviewer) pair, same key shape as
-- before — so a mod's engagement count doesn't reset to zero on this
-- migration. Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0018_mod_likes.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0018_mod_likes.sql

CREATE TABLE IF NOT EXISTS mod_likes (
    mod_id      TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (mod_id, reviewer_id)
);

INSERT OR IGNORE INTO mod_likes (mod_id, reviewer_id, created_at)
SELECT mod_id, reviewer_id, created_at FROM reviews;

DROP TABLE reviews;
