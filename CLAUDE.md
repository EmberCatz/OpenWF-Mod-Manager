# OpenWF Mod Manager — Agent Instructions

A Tauri desktop app + Cloudflare Worker/D1 API for browsing, uploading,
and installing OpenWF mods (metadata patches, `.pluto` scripts). Full
design/architecture is documented in [docs/architecture.md](docs/architecture.md)
and current/planned work in [TODO.md](TODO.md) — read those before
re-deriving how something works.

## Admin & moderation — keep this in mind for new work

This project has an admin/moderation layer (`apps/api/src/routes/admin.ts`,
a hidden Admin tab in the desktop app, a `moderation_actions` audit log —
see `docs/architecture.md` § Admin & moderation for the full design).
When implementing a new feature that lets users create, mutate, or delete
content or accounts, think about whether it also needs:

- An **admin bypass** on the relevant owner-check (see how mod/version
  delete in `routes/mods.ts` added `|| modder.isAdmin` next to the
  existing owner check), or a dedicated admin-only route if the thing
  being touched has no owner concept at all (see the comment-delete route).
- A **`moderation_actions` log entry** when an admin (not the resource's
  owner) is the one taking the action.
- A place in the **Admin tab**, if it's the kind of thing that needs
  listing/triaging (like Users/Reports) — but **don't build a parallel
  admin-only browsing UI for content that already has a normal view.**
  Reuse the existing view instead, gated on `account.isAdmin` (see how
  `ModDetail`/`CommentSection` grew a "Delete (admin)" button rather than
  a separate mod browser).

`is_admin` is never settable through any HTTP route — only via a script
run directly against D1 by the operator. Don't add a route that sets it,
even an "admin-only" one.

## Local test/seed data — never commit unless told

Scripts that generate or apply fake data for local scale-testing (e.g.
`apps/api/scripts/seed-test-*.sql`, `cleanup-test-data.sql` — fake mods/
accounts seeded into the local D1 for UI testing) should stay untracked.
Leave them as-is on disk (they're genuinely useful to keep around for
reuse), but don't `git add`/commit them as part of a broader commit, and
don't stage them proactively — only if the user explicitly asks for that
specific file to be committed. The same goes for any similar throwaway
local-only fixture/scaffolding script created in the future: assume it
stays out of git history unless told otherwise.
