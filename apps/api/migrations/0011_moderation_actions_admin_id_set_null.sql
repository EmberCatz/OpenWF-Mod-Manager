-- moderation_actions.admin_id originally had no ON DELETE behavior, which
-- meant an admin could never delete their own (or another admin's) account
-- once they'd logged even one action — the FK blocked it outright. The
-- audit trail should survive the actor's account being deleted; it should
-- just lose the attribution, not block the deletion. SQLite can't ALTER a
-- column's FK action in place, so this rebuilds the table (same procedure
-- as migration 0007): PRAGMA foreign_keys OFF, copy into a new table with
-- the right constraint, drop the old one, rename, re-enable.

PRAGMA foreign_keys = OFF;

CREATE TABLE moderation_actions_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    TEXT REFERENCES modders(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    details     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO moderation_actions_new (id, admin_id, action, target_type, target_id, details, created_at)
SELECT id, admin_id, action, target_type, target_id, details, created_at FROM moderation_actions;

DROP TABLE moderation_actions;
ALTER TABLE moderation_actions_new RENAME TO moderation_actions;

CREATE INDEX IF NOT EXISTS idx_moderation_actions_target ON moderation_actions (target_type, target_id);

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
