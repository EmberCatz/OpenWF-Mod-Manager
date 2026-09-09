# TODO

Running list of planned/considered work for the mod manager. This tracks
*intent* — git history and `docs/architecture.md` are the source of truth
for what's actually shipped and how it works. Check items off here as they
land, and add new ones as they come up (in conversation, in Discord, while
testing) rather than letting them evaporate.

## Recently shipped
- [x] Installed/Uninstall/Reinstall now have color + icon cues (green
      check, red bin, blue repeat-arrow) instead of identical grey buttons
- [x] File preview in the mod detail view — the latest version's file(s),
      fixed-height scroll box, tabs to switch between a zip's entries
      (`components/FilePreview.tsx`, Rust `list_zip_text_entries`)
- [x] Comments — open, no account system, name is just remembered locally
      (`components/CommentSection.tsx`, `comments` D1 table)
- [x] Reviews — 0-5 stars, color scales red→green with the average,
      one rating per install (`components/StarRating.tsx`, `reviews` D1 table)
- [x] Grid/list view toggle in Browse, remembered in localStorage
- [x] Sidebar filters in Browse — type (metadata patch / pluto script /
      other), game version, tags — replacing the old top-of-page tag bar
- [x] Installed-state tracking — Browse/detail now know what's actually on
      disk (`installed.ts`), not just what's available
- [x] Uninstall — removes exactly the files a mod's install wrote
- [x] Mod detail view — full version history, changelogs, screenshots
      (`components/ModDetail.tsx`)
- [x] Search across name/description/author, on top of the existing tag filter

## Up next
- [ ] Rate limiting on upload endpoints (`POST /api/mods*`) — flagged since
      the earliest security pass, still open. See
      `docs/architecture.md` § Security & billing-risk notes.
- [ ] Self-service API key signup — currently fully manual
      (`apps/api/scripts/create-modder.mjs` + hand-run `wrangler d1 execute`)
- [ ] Real app icon — placeholder flat-color square right now
      (`apps/desktop/src-tauri/icons/`)
- [ ] Tauri auto-updater, once builds are actually distributed as installers
      rather than launched in dev mode

## Ideas, not committed to yet
- [ ] Download/popularity counters per mod
- [ ] Lightweight report/moderation flow for uploaded content
- [ ] Auto-detect a likely Warframe install path instead of requiring manual
      folder selection in Settings
- [ ] Editing an existing mod's own metadata (name/description/thumbnail/tags)
      after creation — today only *adding a version* is supported, not
      editing the mod record itself

## Known correctness gaps
- [ ] `packages/shared/src/gameVersions.ts` is a point-in-time scrape of
      about.openwf.io/versions — won't pick up new patches until someone
      re-scrapes and regenerates the file
