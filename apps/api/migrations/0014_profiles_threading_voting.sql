-- Bundles four independent additions from the same round of work:
--   1. Fixed-palette avatars for the (already-existing) public profile
--      concept — modders.avatar_key, one of shared's AVATAR_KEYS.
--   2. mods.sub_author — optional co-creator/secondary-contributor credit.
--   3. Reddit-style comment threading — comments.parent_id, self-referencing.
--   4. Comment voting — a new comment_votes table, same anonymous
--      per-install voter_id reviews already use.
-- See schema.sql for the fuller reasoning on each.

ALTER TABLE modders ADD COLUMN avatar_key TEXT NOT NULL DEFAULT 'amber';

ALTER TABLE mods ADD COLUMN sub_author TEXT;

ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments (parent_id);

CREATE TABLE IF NOT EXISTS comment_votes (
    comment_id  INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    voter_id    TEXT NOT NULL,
    value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (comment_id, voter_id)
);
