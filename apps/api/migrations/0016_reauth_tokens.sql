-- Step-up re-authentication for the handful of admin actions where a
-- stolen-but-valid token does the most damage (kill-all-sessions, site-wide
-- kill-switches, hard-deleting an account) — see TODO.md § Security. A
-- short-lived, single-use token proving the caller just re-entered the
-- account's password, checked by routes/admin.ts's requireReauth() on top
-- of the normal requireAdmin() check.

CREATE TABLE IF NOT EXISTS reauth_tokens (
    token_hash  TEXT PRIMARY KEY,
    modder_id   TEXT NOT NULL REFERENCES modders(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reauth_tokens_modder ON reauth_tokens(modder_id);
