# TODO

Running list of planned/considered work for the mod manager. This tracks
*intent* — git history and `docs/architecture.md` are the source of truth
for what's actually shipped and how it works. Check items off here as they
land, and add new ones as they come up (in conversation, in Discord, while
testing) rather than letting them evaporate.

## Recently shipped
- [x] Real app icon — an ornate gem/flame emblem replacing the flat
      placeholder square (`apps/desktop/src-tauri/icons/`, source kept as
      `source.png` for regeneration via `tauri icon`). Also used as the
      README logo (`.github/assets/logo.png`) and a GitHub repo social
      preview banner (`.github/assets/social-preview.png` — needs manually
      uploading under repo Settings → General → Social preview, no API
      access to do that from here).
- [x] Admin & moderation interface — an `is_admin` flag (grantable only via
      `apps/api/scripts/grant-admin.mjs`, never through any route), a
      hidden Admin tab (Users: ban/unban/delete; Reports: resolve/dismiss,
      replacing manual `reports:list` checks), and a "Delete (admin)"
      button surfaced directly on `ModDetail`/`CommentSection` rather than
      a separate mod-browser. Ban (reversible, kills sessions immediately)
      is the default moderation action against accounts; hard delete is
      gated behind the account no longer owning mods. Every action logs to
      a new `moderation_actions` audit table (`routes/admin.ts`)
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
- [ ] Tauri auto-updater, once builds are actually distributed as installers
      rather than launched in dev mode
- [ ] Admin tool for the Category/tag taxonomy — mods now carry a
      free-form `theme` field (Gameplay/Cosmetic/Cheat Tool/...,
      `DEFAULT_MOD_THEMES` in `packages/shared/src/types.ts`) that expands
      the same way `tags` already does, with no moderation on either. Needs
      an Admin-tab view to rename/merge/delete a theme across every mod
      using it, and to edit/remove/ban individual tags (ban = block future
      use, like the existing IP-ban pattern in `routes/admin.ts`).

## Ideas, not committed to yet
- [ ] Auto-detect a likely Warframe install path instead of requiring manual
      folder selection in Settings
- [ ] Mod Settings tab — let players adjust exposed values in a `.pluto`
      mod (e.g. "how many enemies does this spawn") from the app instead
      of editing script source. On hold pending feedback from mod authors
      (posted to Discord for input) — full design/format spec already
      written: [docs/mod-settings-spec.md](docs/mod-settings-spec.md).
- [ ] Collection/completion tracker (à la AlecaFrame) — a new tab showing
      every Warframe/weapon/quest against what the player has actually
      unlocked, with images, scoped to a self-hosted SpaceNinjaServer
      private server only (not real DE accounts). Deliberately parked
      until core UI/mod functionality is further along, not until it's
      technically ready. Design notes from discussion:
      - Full catalog + images: don't re-derive from raw Public Export —
        reuse a maintained community dataset (WFCD's `warframe-items`,
        `warframestat.us`) for names/categories/images, hotlinked at
        runtime rather than bundled (same reasoning as not shipping
        extracted game assets).
      - Ownership data: pull from SpaceNinjaServer's own client-facing
        HTTP API (the one the real game calls, e.g. an inventory route),
        not its internal MongoDB — the API shape is what has to stay
        stable for the game to keep working, Mongo's schema is a free-to-
        change implementation detail. Needs a source-dive into
        SpaceNinjaServer's own (open-source) repo to find the actual
        endpoint name + auth flow, same kind of pass done against the
        Bootstrapper's manual before building Dev Tools.
      - Needs its own login/session step against SpaceNinjaServer,
        separate from the Server WebUI tab's iframe (can't read across
        that boundary) — same `@tauri-apps/plugin-http` + capability-
        allowlist pattern already used for Dev Tools' Bootstrapper calls.
      - Docker doesn't complicate reachability — the Server WebUI tab
        already proves the container's HTTP port is published to the
        host, same port a client-API integration would use.

## Security

Residual risk left after the two security passes (`docs/security-audit-2026-09.md`,
`docs/redteam-audit-2026-09.md`) — things that are real but weren't fixable
by an application-layer code change alone, or weren't in scope of either pass.

- [x] **Step-up re-auth for destructive admin actions.** A stolen admin
      token (phishing, a compromised dev machine, a compromised npm
      dependency reading it via `invoke("get_api_key")`) used to have full,
      legitimate admin power the moment it was used directly against the
      API — `requireAdmin()` could only check "is this a valid admin
      token," not "is this really the admin." `POST /api/admin/reauth`
      (`routes/admin.ts`) now re-checks the account's password and issues a
      short-lived (5min), single-use token; `DELETE /users/:id`,
      `PATCH /settings`, and `POST /kill-sessions` all require it via
      `X-Reauth-Token` on top of the normal admin check. Desktop side is a
      password-prompt modal (`components/ReauthPrompt.tsx`,
      `useStepUpReauth()`) that caches the token in memory for its lifetime
      so a burst of admin actions doesn't re-prompt every time. Deliberately
      left off `ban`/`unban`/reports/banned-IPs — those stay the low-
      friction default moderation actions (reversible, per the existing
      comment in `routes/admin.ts`). The "visible active sessions list in
      Settings" half of the original idea isn't built — parked as a
      separate follow-up, not required for the re-auth gate itself.
- [x] **Uncompressed-size cap on zip installs.** `install_mod_zip`
      (`src-tauri/src/commands.rs`) now tracks real bytes written across
      every entry (not each entry's declared/uncompressed-size header,
      which a crafted zip could lie about) and aborts past 500MB total,
      cleaning up whatever was partially extracted — same spirit as
      `MAX_FILE_BYTES` on the upload side. Covered by two Rust unit tests
      (`cargo test`, first tests added to this crate) exercising both the
      abort-and-cleanup path and normal extraction under the cap.
- [ ] **Scope down `GITHUB_TOKEN`.** Tried to verify this directly (the
      token is in `apps/api/.dev.vars` locally, mirroring the Worker
      secret) — it came back "Bad credentials" against the GitHub API, so
      the local copy is stale/invalid and can't be used to check the real
      production secret's scope from here. Still needs a human pass:
      log into GitHub → Settings → Developer settings → confirm it's a
      fine-grained PAT scoped to only `EmberCatz/OpenWF-Mods`'s
      `contents` (release) permission, not a broad classic token — then
      update both `.dev.vars` and the Worker's `wrangler secret put
      GITHUB_TOKEN` with a fresh one if it needs re-scoping.
- [ ] Ship the Tauri auto-updater (already tracked under "Up next") —
      directly relevant here too: without it, a compromised first-party
      dependency or any other post-release fix has no fast path to already-
      installed clients short of everyone manually redownloading. Still
      blocked on its own prerequisite (builds aren't distributed as
      installers yet), so left alone rather than half-building it here.
- [x] Periodic `npm audit` pass — re-ran it: still 3 high-severity findings,
      all the same pre-existing `sharp < 0.35.4` chain (`sharp` →
      `miniflare` → `wrangler`), dev tooling only, never shipped to users.
      `npm audit fix` has nothing to apply — the fix needs a breaking
      `wrangler` major bump, not something to do silently as part of this
      pass. Left as-is; worth another look next time `wrangler` gets
      deliberately upgraded.
- [ ] Consider a custom domain in front of the Worker once one exists, to
      unlock Cloudflare's zone-level Rate Limiting Rules — the current
      D1-backed limiter (`rateLimit.ts`) is explicitly single-IP-scoped by
      design and, per its own comment, "won't hold up against a real
      distributed attack." Needs the user to actually own/point a domain at
      the Worker first — nothing to implement here without one.

## Known correctness gaps
- [ ] `packages/shared/src/gameVersions.ts` is a point-in-time scrape of
      about.openwf.io/versions — won't pick up new patches until someone
      re-scrapes and regenerates the file
