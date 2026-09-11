-- Adds the new thematic Category system (Gameplay, Cosmetic, Cheat Tool,
-- ...) — deliberately a separate column from the existing `category`
-- (which is really a content *type*: metadata-patch/pluto-script/other,
-- see docs/architecture.md and shared/src/types.ts's ModCategory). Not a
-- fixed enum, same reasoning as `tags`: the set of themes in use can grow
-- past DEFAULT_MOD_THEMES as mods are uploaded.

ALTER TABLE mods ADD COLUMN theme TEXT NOT NULL DEFAULT 'Uncategorized';

CREATE INDEX IF NOT EXISTS idx_mods_theme ON mods (theme);
