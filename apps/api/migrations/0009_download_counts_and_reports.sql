-- One-off migration for DBs created before download counters / reports
-- existed. schema.sql already has these changes for a fresh `db:init`;
-- this file is only for applying the same change to an existing
-- local/remote DB without losing data. Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0009_download_counts_and_reports.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0009_download_counts_and_reports.sql

ALTER TABLE mods ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL CHECK (target_type IN ('mod', 'comment')),
    target_id   TEXT NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at);
