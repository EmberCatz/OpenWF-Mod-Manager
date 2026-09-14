# TODO

Running list of planned/considered work for the mod manager. This tracks
*intent* — git history and `docs/architecture.md` are the source of truth
for what's actually shipped and how it works. Check items off here as they
land, and add new ones as they come up (in conversation, in Discord, while
testing) rather than letting them evaporate.

## Recently shipped
- [x] Admin tool for the Category/tag taxonomy — themes and tags are both
      free-form (`DEFAULT_MOD_THEMES`/`TagInput`) with no moderation at
      write time; this is the cleanup pass. New Admin tab "Taxonomy" with
      Themes (rename/merge — same UPDATE either way — and delete, which
      resets affected mods to "Uncategorized" rather than leaving the
      NOT-NULL column empty) and Tags (rename, remove, and ban/unban) sub-
      panels. New `banned_tags` D1 table blocks a banned tag from future
      uploads/edits the same way `banned_ips` blocks an IP — checked via
      `findBannedTag()` in both `POST /api/mods` and `PATCH /api/mods/:id`
      — without touching mods that already carry it (use Remove for that).
      Tag aggregation is done in JS over `SELECT id, tags FROM mods`
      (`routes/admin.ts`'s `loadModTags`) rather than SQL JSON functions,
      consistent with how the rest of the codebase already treats the
      `tags` column. Verified directly against the API (rename, merge,
      delete, ban/unban, remove, and the ban actually rejecting a `PATCH`
      while an unbanned tag still succeeds) since the Admin panel's own
      `@tauri-apps/plugin-http` calls aren't cheaply Playwright-shimmable.
- [x] Automated `gameVersions.ts` regeneration — was a one-off point-in-time
      scrape of about.openwf.io/versions that wouldn't pick up new patches
      until someone manually re-scraped it. New
      `packages/shared/scripts/scrape-game-versions.mjs` (zero deps, plain
      `fetch`) parses the version table correctly — the real signal is each
      row's `=`/`≈`/`<` comparison prefix, not the row's `id` attribute or
      "Kind" column, both of which looked plausible but silently dropped
      most real versions when tried first. A weekly GitHub Actions workflow
      (`.github/workflows/scrape-game-versions.yml`) runs it and opens a PR
      only if the output actually changed — never auto-commits, since a
      redesign of that page could otherwise ship garbled data unreviewed.
- [x] Mod Rating System Overhaul — replaced 0-5 star reviews with a single
      Like toggle. `reviews` D1 table dropped in favor of `mod_likes`
      (mod_id, reviewer_id); existing reviews were carried over 1-for-1 as
      likes in the migration so counts didn't reset to zero. New
      `GET`/`POST /api/mods/:id/likes` (toggle, same anonymous
      per-install reviewerId as before). `components/LikeButton.tsx` —
      red heart outline unliked, solid filled red liked, count beside it —
      replaces `StarRating.tsx` everywhere: Mod Detail (interactive) and
      both Browse card layouts (grid/list), positioned right after the
      comment-count icon. Cards are directly clickable too, not just Mod
      Detail — `likedMods.ts` caches this install's own liked mods in
      localStorage so a card's fill state doesn't need a per-mod request,
      self-healing from server truth whenever Mod Detail loads. Author
      analytics' "average rating" chart became "new likes" per week.
- [x] File-conflict detection before install — the first half of "nothing
      checks whether two installed mods write to the same file." New Rust
      dry-run commands (`compute_install_file_path`, `list_zip_install_paths`)
      report exactly where a pending install would write *without* writing
      anything, guaranteed byte-identical to what the real install would do
      (proven by a unit test that runs both and diffs the result).
      `installVersion` (`modActions.ts`) checks that against every *other*
      installed mod's tracked files and throws `ModConflictError` instead of
      silently overwriting; Browse, mod detail, and Installed Mods all catch
      it and show a shared confirm dialog (`ConflictConfirmDialog.tsx`,
      mirroring the reauth-prompt hook pattern) offering "Install anyway."
      Choosing to proceed anyway also prunes the overwritten paths from the
      other mod's own tracked files (dropping its entry entirely if nothing
      it still owns is left) so a later uninstall of *that* mod can't
      collateral-damage the new one. Author-declared "requires X"/"conflicts
      with Y" was the other half — see Recently shipped above.
- [x] Author reply badge on comments — turned out to need no backend work
      at all: `comments.author_account_id` (added for the comment-
      impersonation fix) was already a real, verified link set only when
      the poster was actually logged in, and the API already returned it.
      `CommentSection`/`CommentNode` just needed a `modOwnerId` prop
      (passed down from `ModDetail`'s already-in-scope `mod.ownerId`) to
      compare against, rendering a gold "Author" badge plus a left-border
      accent (`.comment--author`) when they match. Verified live against
      local wrangler dev with a seeded comment.
- [x] Author analytics — a new weekly downloads/ratings trend view per mod,
      reachable via an "Analytics" toggle in My Mods (`AuthorAnalyticsPanel.tsx`).
      `mods.download_count` was a running total only (no per-event history)
      and `POST /:id/download` never inserted a row, so a new
      `mod_download_daily` table (upserted once per download, bounded to
      one row per mod per day rather than one per download forever) backs
      the downloads side; `reviews.created_at` already supported the
      ratings side with no schema change. `GET /api/mods/:id/analytics`
      (owner or admin only) buckets both into trailing 12 fixed 7-day
      windows. Two single-hue bar charts (downloads in the app's existing
      "download" blue, rating in its accent gold — reusing established
      app colors rather than a new palette), each with a hover tooltip
      per bar, a direct label on the standout week, and a "show as a
      table" fallback for exact numbers — built following the dataviz
      skill's procedure (form choice, mark specs, hover layer, table
      view). Verified with real seeded multi-week data through both the
      raw API (bucket math checked by hand) and the live rendered chart.
- [x] Installed Mods tab (`views/InstalledMods.tsx`) — every installed mod
      in one place, cross-referencing `installed.ts`'s local state against
      one `fetchModList()` call to flag which ones have a newer version on
      the server (closes the old "nothing surfaces 3 of your installed
      mods have an update" gap — see the version history this replaces in
      "Ideas, not committed to yet"). Outdated mods sort to the top, a
      banner up top summarizes the count with a one-click "Update all", and
      each row gets Update/Reinstall/Uninstall as appropriate — including a
      "no longer available" state for a mod that's since been deleted from
      the server, which previously had no way to even be uninstalled from
      the UI once its Browse listing was gone. `listInstalled()` is the one
      new export (`installed.ts`); everything else reuses existing
      `modActions.ts` functions.

      Also folds in the separately-tracked orphan-file scan idea: a new
      Rust command (`scan_install_folder`, recursive, covered by its own
      unit tests) lists everything actually sitting in the configured
      Metadata Patches/Scripts folders, diffed against every
      `InstalledEntry.installedFiles` to surface files this app never put
      there — the old Discord-link workflow's leftovers. Each orphan gets
      matched by exact filename against every mod's latest-version
      `fileName` for a best-guess "Adopt as X v1.2.3" suggestion (only ever
      fires for raw single-file mods — a zip's own filename never matches
      what's inside it, a known, accepted gap), plus unconditional
      Remove/Ignore actions; ignored paths persist (`owmm.ignoredOrphans`)
      so they don't resurface on every scan.
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
- [x] ~~Reviews — 0-5 stars~~ replaced by the simple Like system, see
      Recently shipped above
- [x] Grid/list view toggle in Browse, remembered in localStorage
- [x] Sidebar filters in Browse — type (metadata patch / pluto script /
      other), game version, tags — replacing the old top-of-page tag bar
- [x] Installed-state tracking — Browse/detail now know what's actually on
      disk (`installed.ts`), not just what's available
- [x] Uninstall — removes exactly the files a mod's install wrote
- [x] Mod detail view — full version history, changelogs, screenshots
      (`components/ModDetail.tsx`)
- [x] Search across name/description/author, on top of the existing tag filter
- [x] Manual backup/restore of the configured install folders — new Rust
      commands (`snapshot_install_folders`/`restore_snapshot`/
      `list_snapshots`/`delete_snapshot`, `src-tauri/src/commands.rs`) zip
      the current contents of the Metadata Patches/Scripts folders into a
      timestamped archive under the app's own data dir (not the install
      folders themselves, so a snapshot never shows up as an orphaned
      file), exposed via a new Settings "Backups" section. Deliberately
      manual, not an automatic snapshot before every install — that would
      slow down/complicate the common case for what's meant to stay a
      fallback net. Restore overwrites files the snapshot has but doesn't
      delete files added since (best-effort content restore, not a
      byte-perfect folder-state revert). Core zip logic split into pure,
      testable functions the same way `extract_zip_with_cap` already is —
      covered by a round-trip test and an unmatched-label-is-skipped test.
- [x] Sanitized Markdown mod descriptions — new `src/markdown.ts` (marked +
      DOMPurify against a conservative tag allowlist, no `<img>` since
      screenshots already have their own Imgur-only field) replaces the
      old plain-text `<p>{mod.description}</p>` in `ModDetail.tsx`.
      Verified a `<script>`/`onerror` injection probe renders as nothing
      and fires no alert.
- [x] Author-declared "requires X" / "conflicts with Y" between mods — new
      `mods.requires_mod_ids`/`conflicts_with_mod_ids` JSON-array columns
      (same convention as `tags`), a new `ModPicker` chip-input component
      in Upload/EditModForm, and an install-time check in `modActions.ts`
      (`DeclaredConflictError`, surfaced via a new
      `useDeclaredConflictConfirm` dialog in `ConflictConfirmDialog.tsx`)
      alongside the existing file-path `ModConflictError`. Deliberately
      one-directional for now — only checks the mod being installed's own
      declared lists, not every other installed mod's lists against it,
      to avoid an extra fetch per install.
- [x] Code-specific mod reporting — `FilePreview.tsx` shows a "Report this
      snippet" action (toolbar and fullscreen header) whenever there's an
      active text selection, pre-filling `ReportButton`'s form with the
      quoted snippet + source file name via a new `prefill` prop. No
      schema change — `reports.reason` was already free text.
- [x] Author-authored risk/warning banner — new nullable `mods.risk_notes`
      column, purely author-declared free text ("anything to watch out
      for?"), no admin/moderation involvement. Rendered as a red-tinted
      "Before you install" block above the description on Mod Detail,
      reusing the existing `button--danger` color palette.
- [x] Optional install-instructions field per mod — new nullable
      `mods.install_instructions` column, same 4-file pattern as
      `subAuthor`. Optional textarea in Upload/EditModForm; shown on Mod
      Detail as its own "Installation Notes" section, separate from the
      general description.
- [x] Optional GitHub link on creator profiles — new nullable
      `modders.github_url` column, self-editable via `PATCH /api/auth/me`
      (which now takes a partial `{avatarKey?, githubUrl?}` body instead of
      requiring `avatarKey`), restricted to github.com URLs for the same
      reason thumbnails are restricted to Imgur. Shown in Settings (edit)
      and `Profile.tsx` (public display).
- [x] "Report a bug" link in Settings' About/Disclaimer, out to the app
      repo's GitHub Issues page — the TODO's own "simplest version," no
      new backend.
- [x] Restricted thumbnail/screenshot URLs to Imgur only — a new
      `isImgurUrl()` (server: `routes/mods.ts`; client: `src/imgur.ts`,
      shared by `ThumbnailPreview.tsx`/`ScreenshotPreviewList.tsx`)
      replaces the old bare `isHttpUrl()` check for these two fields, both
      client- and server-side.
- [x] Extended `containsLink()` to guard mod name, description, sub-author,
      theme, and each tag on both `POST /api/mods` and `PATCH /api/mods/:id`
      — previously only a comment's body/author name were checked.
- [x] Fullscreen screenshot preview on Mod Detail — click a screenshot to
      view it larger in a closable overlay, reusing `FilePreview.tsx`'s
      fullscreen-modal skeleton.
- [x] "Uninstall all" button on Installed Mods — mirrors the existing
      "Update all" banner action, gated behind an inline confirm/cancel
      toggle since it's destructive (same pattern as ModDetail's
      admin-delete confirm).
- [x] Fixed the grid-view title hit-area mismatch — `ModCard.tsx` no longer
      renders a separate full-thumbnail overlay title for mods without a
      thumbnail (it was competing with the normal inline name below it);
      the one remaining title button also no longer stretches to the
      card's full width via the flex column's default
      `align-items: stretch`, so hover/click now only responds over the
      actual visible text.
- [x] Header logo, dropped the gold accent bar — `App.tsx`'s `<h1>` now
      renders the app's own icon (exported from
      `src-tauri/icons/source.png` into the previously-empty
      `src/assets/logos/`) next to the title text instead of the old
      `border-left` bar in `styles.css`.

## Up next

Pre-production checklist for the desktop client + updater, from a full
feature/readiness brainstorm (2026-09-13). Roughly ordered — the first two
subsections are true blockers (can't ship an installer, or shouldn't open
the catalog to the public, without them); the rest is cheap insurance or
can trail the launch.

### Updater & release pipeline (blocking)
- [ ] Tauri auto-updater — `@tauri-apps/plugin-updater` + a signing keypair
      (`tauri signer generate`) + a `plugins.updater` block in
      `tauri.conf.json` pointing at a static `latest.json` manifest. Host
      the manifest as a GitHub Release asset (same pattern mod files
      already use) rather than standing up new infra, keeping the
      $0/month stack intact. Needs: an in-app check-on-launch/manual
      "Check for updates," a changelog dialog before applying (the
      manifest's `notes` field, rendered the same way
      `mod_versions.changelog` already is), and a decision on whether to
      support an update channel (stable/beta) now rather than retrofit
      one later once users are all pinned to a single manifest URL.
- [ ] Build-and-release CI — no GitHub Actions workflow builds the app at
      all today (only `scrape-game-versions.yml` exists). Add one using
      `tauri-action` to cross-compile Windows/macOS/Linux bundles and
      generate+sign the `latest.json` manifest above in the same job —
      these two are really one piece of work.
- [ ] Code signing decision — an unsigned Windows `.exe`/`.msi` gets
      flagged by SmartScreen as "Unknown publisher," and macOS needs
      notarization (Apple Developer account, $99/yr) or Gatekeeper blocks
      it outright. Both cost money, breaking the API stack's deliberate
      $0 constraint — decide explicitly which platforms get signed
      installers at launch vs. ship unsigned/dev-mode for now, rather than
      finding out from a user's screenshot of the warning.
- [ ] CI typecheck gate on PRs — `apps/api`/`apps/desktop` both already
      have working `typecheck` scripts; nothing runs them automatically,
      so a broken build can merge today.

### Content safety (blocking — highest risk given what mods can do)
- [x] Server-side file content validation on upload — malware scan via the
      free-tier VirusTotal API, `apps/api/src/scan.ts`. Deliberately
      scan-*after*-publish, not a gate: a version goes live the moment
      it's uploaded exactly like before (chosen over hiding it until
      clean — the alternative would've meant threading scan status through
      every public read path, not proportionate at this project's current
      user-base size). Uploads queue a content-addressed `file_scans` row
      (keyed by sha256, so an identical file re-uploaded anywhere is never
      re-submitted) instead of calling VT inline — a real scan takes
      15-60s+ and the free tier caps at 4 requests/minute, so a burst of
      uploads can't be scanned synchronously without either stalling or
      blowing the quota. A new Cron Trigger (`wrangler.toml`'s
      `[triggers]`, once/minute — the finest granularity crons support,
      lining up with VT's per-minute cap) drains the queue within a fixed
      budget: poll in-flight analyses first, then spend what's left
      submitting new ones (hash lookup first — an instant resolve with no
      upload needed if VT already has a verdict for that exact file).
      `mod_versions.scan_status` (pending/clean/flagged/error) is
      informational, shown to the author as a small badge in My Mods
      ("Scanning…" / "Flagged") once their version resolves off 'pending'.
      A flagged file auto-files a row in the existing `reports` table
      (target_type 'mod') so it surfaces in Admin → Reports for a human to
      pull — no parallel review UI. Needs a `VIRUSTOTAL_API_KEY` secret
      (free account at virustotal.com/gui/my-apikey) — a no-op until
      that's set, so it's safe to deploy ahead of getting the key. Also
      needs `migrations/0025_file_scans.sql` run against remote D1 (schema.sql
      already has it for fresh installs). VT's response shapes are coded
      from their documented v3 API, not live-tested against a real key yet
      — worth a first real run before trusting the flagged/clean split.
- [ ] Narrow CORS from the current wide-open `app.use("*", cors())` —
      already flagged in `docs/architecture.md` as "worth narrowing once
      a production domain exists." This is that moment.
- [ ] Terms of Use / acceptable-content policy, linked from Upload —
      separate from the existing abuse-report mailbox (`reports` table);
      this is about setting expectations up front and giving the operator
      a documented basis to act on a takedown request (copyright, game
      ToS violations), which matters more once this isn't just a small
      Discord-adjacent tool.

### Cheap insurance (bundle into the same pass)
- [x] Crash/error reporting from `ErrorBoundary.tsx` — new `crashReport.ts`
      builds a pre-filled GitHub "new issue" URL (message, component
      stack, app version from `package.json`, OS sniffed from
      `navigator.userAgent` — no new Tauri plugin needed) that a "Report
      this error" link opens next to Reload. No new backend, as planned.
- [x] Unhandled promise rejection capture — new `unhandledRejections.ts`,
      installed once from `main.tsx`, listens for `window`'s
      `unhandledrejection` event and turns it into a sticky error toast
      via the existing `toast.ts` instead of vanishing into devtools.
- [x] Real DB-backed health endpoint — `GET /api/health` in
      `apps/api/src/index.ts` runs `SELECT 1` against D1 and returns 503
      on failure. Registered *before* the CORS/IP-ban/maintenance-mode
      gate so a banned IP or deliberate maintenance mode can't produce a
      false-positive "D1 is down" reading.
- [x] Scheduled D1 backup/export — `.github/workflows/backup-d1.yml`
      (same shape as `scrape-game-versions.yml`) runs weekly, exports via
      a new `db:backup` script in `apps/api/package.json`, and uploads
      the dump as a 90-day workflow artifact rather than committing it
      (contains emails/password hashes/IPs). Needs a `CLOUDFLARE_API_TOKEN`
      repo secret added manually (Settings → Secrets and variables →
      Actions) before the first scheduled run will succeed.
### First-run polish
- [x] First-run setup flow — `components/FirstRunFolderWizard.tsx`, mounted
      in `App.tsx` next to `ToastHost`. Shows once on first launch (neither
      install folder set yet, and it hasn't already been skipped — tracked
      via `owmm.firstRunWizardDismissed` in `settings.ts`): a single
      "Browse for Warframe folder…" button, then derives and previews both
      `<root>/OpenWF/Metadata Patches` and `<root>/OpenWF/Scripts` paths for
      the user to Save or Skip. Deliberately scoped down from "detect" to
      manual-only (no Steam-library/registry scanning) and nudge-only, not
      a hard gate — Skip leaves things exactly as before, so Install can
      still hit modActions.ts's "set the matching folder in Settings first"
      error if someone skips and never visits Settings. Revisit
      auto-detection later if manual-only turns out not to be enough.

### Post-launch growth ideas (not blocking)
- [ ] Follow an author / notify on their new uploads — Profile pages and
      the comment "Author" badge already lay the groundwork.
- [ ] Notify when an installed mod has an update — ties into Installed
      Mods' existing update-detection; currently only surfaces when the
      app happens to be open.
- [ ] Site-wide changelog/"what's new" feed aggregating recent uploads
      across the whole catalog, not per-mod — useful once the catalog
      outgrows one Browse-page glance.
- [ ] Favorites/wishlist independent of installed state (browse on one
      machine, install on another, or just "check this out later").
- [ ] Public status page pointed at `GET /api/health` (now real and
      D1-backed) — cheap trust signal and deflects "is the site down for
      everyone" reports, but not worth it at the current user base size.
      Revisit once there's actually enough traffic for outages to draw
      more than a couple of confused reports; a free third-party
      monitor's built-in status page (UptimeRobot, Better Uptime) pointed
      at the endpoint is the low-effort option when it's time.

### Small fixes to bundle in
- [ ] `README.md` still advertises "0–5 star ratings" — stale since the
      Like-system migration (see "Recently shipped" above); low effort,
      but public-facing so more visible than the internal docs drift a
      prior pass already fixed.
- [ ] Confirm the CSP `connect-src`'s `http://localhost:*`/`127.0.0.1:*`
      allowance (needed for local dev + the Live tabs' Bootstrapper/
      SpaceNinjaServer iframes) is intentionally kept before shipping
      wide, not just a dev leftover.

## Ideas, not committed to yet
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
- [ ] Alpha/Beta badge with live version info — pull the version from the
      Tauri app itself (`@tauri-apps/api/app`'s `getVersion()`) rather than
      a hand-maintained string, plus a build/update date. Needs deciding
      where the date comes from — a build-time-injected constant vs.
      reading it from somewhere at runtime.


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
- [x] **Scope down `GITHUB_TOKEN`.** Turned out there were two fine-grained
      PATs on GitHub: `openwf-mod-worker` (correctly scoped to
      `EmberCatz/OpenWF-Mods`, `Contents: Read and write` +
      `Metadata: Read` only) and a decoy, `openwf-mod-manager-worker`,
      which despite its description ("Used by the Cloudflare Worker to
      create GitHub Releases for mod uploads") was actually scoped to the
      wrong repo (`EmberCatz/OpenWF-Mod-Manager`) and would have 403'd if
      ever used. The stale local `.dev.vars` value that returned "Bad
      credentials" was unrelated to either — just dead. Fixed: put the
      `openwf-mod-worker` value into `apps/api/.dev.vars`'s `GITHUB_TOKEN`,
      confirmed `200` against `GET /repos/EmberCatz/OpenWF-Mods/releases`,
      then `wrangler secret put GITHUB_TOKEN` on the Worker with the same
      value. Verified end-to-end with a real upload, which correctly
      created a release under `EmberCatz/OpenWF-Mods`.
      Still open: delete or fix the description on the decoy
      `openwf-mod-manager-worker` PAT on GitHub so it stops looking like
      the real one.
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
- [x] Edge-level rate limiting ahead of the D1-backed limiter — turned out
      not to need a custom domain at all: Workers has its own native Rate
      Limiting binding (`[[ratelimits]]` in `wrangler.toml`, stable since
      wrangler 4.36+), which attaches directly to the Worker like a D1/KV
      binding and enforces at Cloudflare's network edge. `checkEdgeRateLimit()`
      (`rateLimit.ts`) checks it before the existing D1 limiter on
      login, signup, and admin reauth — the three password-guessing-shaped
      endpoints. Its period is capped at 10 or 60 seconds (a real
      Cloudflare-side limit), too short to express the existing "8 per 5
      minutes" / "5 per hour" business rules directly, so this is a coarse
      60s/20-request pre-filter layered in *front of* those, not a
      replacement — the real value is that a genuine request flood gets
      rejected at the edge without ever reaching D1, capping D1 load
      regardless of how much volume an attacker throws at it. Verified
      against local wrangler dev: a 25-request burst still gets exactly the
      same 401→429 behavior as before, server stays healthy throughout.
      One local-only gotcha worth knowing: the local simulator reproducibly
      hangs/crashes the dev runtime if `limit` is set very low (tested with
      2) — did not chase further since it's Cloudflare's own local-sim
      quirk at an extreme value, not something the shipped 20/60s config
      hits. The zone-level Rate Limiting *Rules* product (the original
      custom-domain idea) is still on the table later as a broader WAF
      layer, but isn't needed just to close this specific gap.
