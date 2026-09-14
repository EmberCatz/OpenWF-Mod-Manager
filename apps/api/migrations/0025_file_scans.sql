-- Malware-scan tracking (TODO.md § Content safety — "Server-side file
-- content validation on upload"). Scan-after-publish, not a gate: a
-- version stays visible the moment it's uploaded exactly like before,
-- scan_status is informational (surfaced to the author, and an automated
-- report is filed for admin triage if a file comes back flagged — see
-- src/scan.ts). file_scans is keyed by the file's sha256 checksum so an
-- identical file re-uploaded elsewhere is never re-submitted to
-- VirusTotal's free-tier 4-requests/minute cap.
--
-- Apply with:
--   npx wrangler d1 execute openwf-mod-manager --local  --file=./migrations/0025_file_scans.sql
--   npx wrangler d1 execute openwf-mod-manager --remote --file=./migrations/0025_file_scans.sql

ALTER TABLE mod_versions ADD COLUMN scan_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'clean', 'flagged', 'error'));

CREATE TABLE IF NOT EXISTS file_scans (
    checksum       TEXT PRIMARY KEY,
    download_url   TEXT NOT NULL,
    vt_analysis_id TEXT,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'clean', 'flagged', 'error')),
    positives      INTEGER,
    attempts       INTEGER NOT NULL DEFAULT 0,
    submitted_at   TEXT,
    resolved_at    TEXT
);
