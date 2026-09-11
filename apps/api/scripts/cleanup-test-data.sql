-- Removes every row inserted by seed-test-data.sql.
-- mod_versions/comments/reviews cascade-delete via mods' ON DELETE CASCADE,
-- sessions cascade-delete via modders' ON DELETE CASCADE.
-- Delete mods before modders (mods.owner_id has no ON DELETE CASCADE).
DELETE FROM mods WHERE id LIKE 'seedtest-%';
DELETE FROM modders WHERE id LIKE 'seedtest-%';
