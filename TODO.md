# TODO

Running list of planned/considered work for the mod manager. This tracks
*intent* — git history and `docs/architecture.md` are the source of truth
for what's actually shipped and how it works. Check items off here as they
land, and add new ones as they come up (in conversation, in Discord, while
testing) rather than letting them evaporate.

## Recently shipped
- [x] Responsive multi-column layout for wide windows — mod detail is now
      a 2-column split (details/versions left, code preview right, which
      stretches via CSS Grid to match the left column's height); Upload
      and its Update-existing mode group fields into wrapping side-by-side
      cards instead of one long stack; Settings is a left-nav/right-panel
      split. All three collapse back to a single stacked column under
      ~860px (`.app` widened to 1400px to give this room to breathe)
- [x] Download/popularity counters per mod — `POST /api/mods/:id/download`
      pinged best-effort on install/save, shown in Browse and detail
- [x] Lightweight report/moderation flow — a Report button on mods and
      comments (`ReportButton.tsx`), landing in a `reports` table the
      operator checks directly (`npm run reports:list` in apps/api). No
      in-app review queue/admin role — intentionally just a mailbox, not
      a full moderation workflow
- [x] Editing a mod's own metadata after creation — name, description,
      thumbnail (+position), screenshots, tags via `PATCH /api/mods/:id`,
      owner-only, from a new Edit button in My Mods (`EditModForm.tsx`).
      Category and the mod's id/slug stay fixed — id is baked into every
      version and GitHub release, category drives which folder existing
      installs already went into
- [x] Rate limiting — login/signup (per IP), mod uploads (per account),
      comments/reviews (per IP), D1-backed since a `workers.dev` subdomain
      can't use Cloudflare's dashboard rate-limiting rules (`src/rateLimit.ts`)
- [x] Self-service accounts — username/password signup and login in
      Settings, replacing manually-issued API keys as the normal path
      (`routes/auth.ts`, `sessions` table). Old keys still work side by
      side. My Mods/Upload didn't need any changes — a session token just
      goes in the same slot an API key used to.
- [x] Grid view: uniform card size, thumbnail always above the title, no
      description, full-width Install button that becomes a split
      Uninstall/▾Reinstall button once installed (`SplitButton.tsx`)
- [x] List view: description clamped to 3 lines with Show more/less
      (`ClampedText.tsx`); bigger Install button paired with the version
      number at the card's right edge
- [x] Thumbnail/screenshot URL fields in Upload now preview the image and
      flag broken links before you submit (`ThumbnailPreview.tsx`,
      `ScreenshotPreviewList.tsx`)
- [x] Thumbnail focal-point picker — since linked images can't actually be
      cropped/re-hosted, dragging the preview sets an object-position
      (`thumbnail_position` column) instead
- [x] Fullscreen popup for the file preview, plus basic Pluto syntax
      highlighting (`plutoHighlight.tsx` — hand-rolled tokenizer, no dep)
- [x] "My Mods" tab — lists mods owned by whoever's logged in, with
      delete-version/delete-mod actions wired to the (already-existing)
      DELETE endpoints.
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
- [ ] Real app icon — placeholder flat-color square right now
      (`apps/desktop/src-tauri/icons/`)
- [ ] Tauri auto-updater, once builds are actually distributed as installers
      rather than launched in dev mode

## Ideas, not committed to yet
- [ ] Auto-detect a likely Warframe install path instead of requiring manual
      folder selection in Settings
- [ ] An actual in-app review queue for reports, once there's more than one
      operator or more than a handful of reports to justify it

## Known correctness gaps
- [ ] `packages/shared/src/gameVersions.ts` is a point-in-time scrape of
      about.openwf.io/versions — won't pick up new patches until someone
      re-scrapes and regenerates the file
