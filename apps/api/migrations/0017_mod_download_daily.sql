-- Backs the author-analytics downloads-over-time trend (TODO.md § Author
-- analytics). mods.download_count (schema.sql) is a running total only —
-- POST /:id/download never recorded a per-event row, so there was no way
-- to reconstruct "how many downloads did this mod get last week" after the
-- fact. A daily rollup (upserted once per download, see routes/mods.ts)
-- keeps that answerable while bounding growth to one row per mod per day
-- it's actually downloaded, rather than one row per download forever.

CREATE TABLE IF NOT EXISTS mod_download_daily (
    mod_id  TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    day     TEXT NOT NULL, -- YYYY-MM-DD, UTC
    count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (mod_id, day)
);
