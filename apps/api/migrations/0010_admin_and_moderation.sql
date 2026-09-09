-- Adds admin/ban flags to modders and an audit trail for admin actions.
-- is_admin/is_banned are never settable via any HTTP route — only through
-- scripts/grant-admin.mjs's printed SQL, run directly against D1 by the
-- operator. See docs/architecture.md § Admin & moderation.

ALTER TABLE modders ADD COLUMN is_admin  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE modders ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS moderation_actions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    TEXT NOT NULL REFERENCES modders(id),
    action      TEXT NOT NULL,   -- 'ban_user' | 'unban_user' | 'delete_user' |
                                  -- 'delete_mod' | 'delete_mod_version' | 'delete_comment' |
                                  -- 'resolve_report' | 'dismiss_report'
    target_type TEXT NOT NULL,   -- 'user' | 'mod' | 'comment' | 'report'
    target_id   TEXT NOT NULL,
    details     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_target ON moderation_actions (target_type, target_id);
