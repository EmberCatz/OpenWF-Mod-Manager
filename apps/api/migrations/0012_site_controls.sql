-- Admin "oh shit" kill-switches: a global site_settings flag table (checked
-- by index.ts's maintenance middleware, plus per-route uploads/signups/
-- comments toggles) and an IP ban list (separate from the existing
-- per-account ban, since abuse from an anonymous/throwaway account still
-- comes from an IP the per-account ban can't touch). See
-- docs/architecture.md § Admin & moderation.

CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by  TEXT REFERENCES modders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS banned_ips (
    ip         TEXT PRIMARY KEY,
    reason     TEXT,
    banned_at  TEXT NOT NULL DEFAULT (datetime('now')),
    banned_by  TEXT REFERENCES modders(id) ON DELETE SET NULL
);
