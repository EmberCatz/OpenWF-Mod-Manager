-- Closes a comment-impersonation hole: author_account_id used to be
-- resolved at *read* time by case-insensitive name matching against
-- modders.name, so anyone could type an existing modder's display name
-- as authorName and have their comment render as if posted by that
-- account. It's now a real column set once, at insert time, only when
-- the poster was actually authenticated as that modder (see
-- routes/mods.ts POST /:id/comments) — never derived from the
-- unverified authorName text.
--
-- Deliberately not backfilled from the old name-match heuristic: a
-- comment that happened to display someone's name isn't proof it was
-- them, so existing comments just start unlinked rather than carrying
-- forward an unverified guess as if it were now a verified fact.

ALTER TABLE comments ADD COLUMN author_account_id TEXT REFERENCES modders(id);
