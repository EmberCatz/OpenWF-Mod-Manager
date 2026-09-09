# Architecture

A mod manager for OpenWF / SpaceNinjaServer: a Tauri desktop app for
browsing/uploading/downloading mods (metadata patches, `.pluto` scripts,
etc.), backed by a stack chosen so the whole thing runs for **$0/month with
no payment method required anywhere** — see "Why GitHub Releases, not R2"
below for the reasoning.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Desktop app | [Tauri v2](https://v2.tauri.app/) + React + TypeScript + Vite | Native-ish, small bundle, no Electron overhead. |
| API | [Cloudflare Workers](https://workers.cloudflare.com/) + [Hono](https://hono.dev/) | Free tier (100k req/day); on the Free plan, exceeding the cap just errors out — it does not bill. No card needed to use it. |
| Metadata DB | [Cloudflare D1](https://developers.cloudflare.com/d1/) | Serverless SQLite, free tier, zero cross-network latency from the Worker. No card needed. |
| File storage | **GitHub Releases** | Mods here are small — real OpenWF metadata patches / `.pluto` scripts are sub-1MB bundled. At that scale, object storage (R2/S3) buys nothing GitHub Releases doesn't already give for free, and GitHub Releases has **zero billing surface, period** — no payment method on the account at all. |

### Why GitHub Releases, not R2

R2 was the original pick (see git history) for its zero-egress-fee
guarantee at volume. Two things changed that:

1. **Scope reality check**: every OpenWF mod in this ecosystem is a tiny
   text-based zip. R2's advantages only matter at file sizes/volumes this
   project will never hit.
2. **R2 requires a payment method on file** to enable it at all, even to
   stay within its free tier — Cloudflare's anti-abuse measure. GitHub
   Releases requires no card, ever, on any account. Given the project
   owner's (reasonable) discomfort with usage-based billing risk, removing
   the one component that needed a card was a better trade than trying to
   mitigate around it.

GitHub Releases downsides, accepted as fine at this scale: a 2GB-per-file
cap (irrelevant here), and each upload becomes a git-independent Release
object rather than a plain object-store key (handled entirely server-side
in `src/github.ts` — the desktop client never talks to GitHub directly).

## Data flow

**Upload** (modder, authenticated with an API key):
```
Tauri app --(multipart: zip + JSON metadata, Bearer <api-key>)--> Worker
                                                                     |
                                              +----------------------+----------------------+
                                              |                                              |
                                  GitHub API: create Release                          D1 INSERT (mods, mod_versions)
                                  + upload zip as release asset
                                  (src/github.ts)
```

**Download** (any user, no auth needed):
```
Tauri app --GET /api/mods--> Worker --SELECT--> D1
Tauri app <--[{ ..., downloadUrl }]-- Worker
Tauri app --GET downloadUrl-----------------------------------> GitHub (direct, bypasses Worker entirely)
```

The list/detail response embeds each version's GitHub release asset URL
(`browser_download_url`, stored verbatim in D1 at upload time). The client
fetches that URL directly — the Worker is never in the request path for
the actual file transfer.

## Install flow (desktop app)

The point of a *mod manager* over a plain downloader is placing files
correctly, not just fetching them. Per
[docs/metadata-patching-guide.md](../../docs/metadata-patching-guide.md) and
[docs/pluto-scripting-guide.md](../../docs/pluto-scripting-guide.md) in the
parent project, the Bootstrapper reads mods from two fixed folders under
the Warframe install folder:

| `mods.category` | Installs to (Settings field) |
|---|---|
| `metadata-patch` | Metadata Patches folder — normally `<Warframe folder>/OpenWF/Metadata Patches/` |
| `pluto-script` | Scripts folder — normally `<Warframe folder>/OpenWF/Scripts/` |
| `other` | No defined location — offered as a plain "Download" (user picks a save path) instead of "Install". |

These are two independent settings (Settings tab, each its own folder
dialog), not derived from one shared root — kept explicit rather than
assumed, since not every install necessarily follows the same layout.
Stored in the webview's `localStorage` (`apps/desktop/src/settings.ts` —
local-only, never sent anywhere).

**Raw file vs. zip**: most mods here are a single `.pluto` or `.txt` file,
so uploads accept either that directly (no archive step) or a `.zip` for
the minority of mods needing more than one file (e.g. a script with a
companion data file, see the pluto-scripting guide). The desktop app picks
the install path based on the downloaded version's `fileName` extension —
`.zip` goes through extraction, anything else is placed directly under its
own name.

Both paths are Rust commands
(`apps/desktop/src-tauri/src/commands.rs`), not JS, deliberately: a plain
Tauri command has ordinary OS file access without needing to keep the
fs-plugin's scope config in sync with whatever folder the user picks, and
`install_mod_zip` uses the `zip` crate's `enclosed_name()` as its zip-slip
guard (returns `None`, entry silently skipped, for anything using `..` or
an absolute path). `install_mod_file` treats the server-supplied file name
as untrusted too — only its bare filename component is used, so a crafted
`../../evil.pluto` can't escape the target folder either. The frontend
never touches the filesystem directly — `apps/desktop/src/native.ts` is
the only bridge, wrapping four commands: `read_file_bytes` (upload form),
`write_file_bytes` (plain "Download" path), `install_mod_file`, and
`install_mod_zip`.

## Images: external links only

Thumbnails and screenshots are stored as **URLs to images already hosted
elsewhere** (Discord CDN, Imgur, etc.) — `Mod.thumbnailUrl` /
`Mod.screenshotUrls` are just strings, validated server-side to be
`http(s)` URLs and nothing else. This project never receives, stores, or
serves the actual image bytes. That was a deliberate choice over letting
modders upload image files the same way as mod files: hosting arbitrary
user-submitted images carries real liability (illegal content risk), and
external hosts already run their own moderation/abuse-detection systems.
This project just links to them. If hosted-image upload is ever wanted
instead, revisit this decision explicitly rather than adding it quietly —
it changes the risk profile.

## Game-version compatibility tags

Each mod version can be tagged with which specific OpenWF/Warframe patch
numbers it's compatible with (e.g. `38.0.7`), or the `"all"` sentinel
(`packages/shared/src/gameVersions.ts`) meaning "works everywhere,"
mutually exclusive with picking specific ones. Patch-level granularity was
a deliberate choice over just major-update names — a metadata patch or
script can break between two patches of the same update, so "works on
1999" isn't precise enough to be a useful tag.

`GAME_VERSIONS` (188 entries, newest first) is a **hardcoded constant**,
not fetched at runtime, derived from a raw scrape of
[about.openwf.io/versions](https://about.openwf.io/versions) — every
distinct version number on that page, both `Update patch` and `Steam
release` rows, excluding rows marked `<` (those denote "some version
before X," not a specific number, so they'd be meaningless as a tag). The
API validates `gameVersions` against this same list server-side
(`apps/api/src/routes/mods.ts::validateGameVersions`), so a tag always
means something real. Updating the list means re-scraping that page and
regenerating the file — no migration needed, since it's just a validation
set, not stored in D1.

`GAME_VERSION_GROUPS` is the same 188 versions grouped by their major
update name (65 groups) — purely a UI convenience so the upload form can
offer "select this whole update" as a shortcut instead of checking dozens
of individual patch numbers by hand, via a searchable, collapsible list
(`Upload.tsx`).

## Data model

See [`apps/api/schema.sql`](../apps/api/schema.sql) and the mirrored
TypeScript types in [`packages/shared/src/types.ts`](../packages/shared/src/types.ts)
(kept in sync by hand — no ORM/codegen layer, deliberately, to stay
lightweight).

- `modders` — one row per person allowed to upload. API keys are issued
  out-of-band (manually, via `wrangler d1 execute`) rather than
  self-service, so the upload endpoint isn't an open target.
- `mods` — one row per mod (slug id, name, author, category, owner,
  thumbnail/screenshot URLs — external links only, see below).
- `mod_versions` — one row per uploaded version of a mod (original file
  name, GitHub release id, download URL, checksum, game-version
  compatibility tags, changelog). A mod can have many versions; the list
  endpoint returns only the latest, the detail endpoint returns full
  history.

Schema changes after the initial version are applied via numbered files in
[`apps/api/migrations/`](../apps/api/migrations/) (ALTER TABLE against the
already-existing local/remote DBs) — `schema.sql` itself is only ever run
against a fresh DB (`db:init`), so it's kept up to date with the final
shape but doesn't retroactively apply to a DB that already exists.

## API surface (`apps/api/src/routes/mods.ts`)

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/mods` | none | List all mods + latest version + download URL. |
| `GET /api/mods/:id` | none | One mod's full version history. |
| `POST /api/mods` | API key | Create a mod + its first version (creates a GitHub Release + uploads the zip as its asset). |
| `POST /api/mods/:id/versions` | API key (owner only) | Add a new version to an existing mod (same GitHub flow). |
| `DELETE /api/mods/:id/versions/:version` | API key (owner only) | Remove one version (D1 row, then best-effort GitHub release delete). |
| `DELETE /api/mods/:id` | API key (owner only) | Remove a mod and all its versions (cascades in D1, then best-effort GitHub release deletes). |

`src/github.ts` wraps the three GitHub REST calls involved: create a
release, upload an asset to it, and (best-effort, on a D1 write failure
after the GitHub side already succeeded) delete the orphaned release.

## Security & billing-risk notes

- **No component in this stack requires a payment method.** Workers Free,
  D1 Free, and GitHub are all card-free by design — this was a deliberate
  constraint, not an accident (see "Why GitHub Releases, not R2" above).
- **Upload auth is in place** (`src/auth.ts`): `Authorization: Bearer <key>`,
  hashed with a server-side salt before comparing against D1. Keys are
  provisioned manually — there's intentionally no public signup route yet.
  This is what actually stops "someone uploads excessive data" — a
  stranger can't call `POST /api/mods*` without a leaked key, regardless
  of what it's backed by.
- **The GitHub PAT (`GITHUB_TOKEN`) is server-side only** — set as a
  Wrangler secret, never sent to or readable by the desktop client. Scope
  it to "Contents: Read and write" on just the storage repo (fine-grained
  PAT), not a classic all-repo token.
- **Zip-slip protection is implemented** in the desktop app's install
  command (see "Install flow" above) — extraction can't write outside the
  chosen install root.
- **Not yet implemented, do before any public upload endpoint goes live:**
  - Rate limiting on `POST /api/mods*` (Cloudflare has a free rate-limiting
    rule at the zone level, or a KV/D1-backed counter in the Worker) — the
    residual abuse surface with a leaked key is GitHub API rate limits and
    repo clutter, not money, but still worth throttling.
  - File content validation server-side — right now any file with an
    allowed extension under the size cap is accepted as-is.
- CORS is currently wide open (`app.use("*", cors())`) since there's no
  cookie/session to protect — fine given bearer-token auth, but worth
  narrowing once a production domain exists.
- Stay on Cloudflare's **Workers Free plan** explicitly (don't let it
  auto-upgrade to Paid) — this is what guarantees the API layer can never
  generate a surprise bill, since Free-plan overages error instead of
  billing.

## Local dev

```bash
npm install                                   # from the repo root, installs all workspaces

# API (Worker)
wrangler d1 create openwf-mod-manager         # then paste the id into apps/api/wrangler.toml
npm run db:init                               # applies apps/api/schema.sql to the local D1
# apply any files under apps/api/migrations/ too, in order, if the DB predates them
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in UPLOAD_API_KEY_SALT + GITHUB_TOKEN
npm run dev:api                                # wrangler dev, http://127.0.0.1:8787

# Desktop (Tauri) — requires Rust (rustup.rs)
npm run dev:desktop
```

## Known gaps

- Issuing a new API key still requires running `apps/api/scripts/create-modder.mjs`
  and applying the printed `wrangler d1 execute` commands by hand — no
  self-service signup route (deliberately, per the auth notes above).
- `apps/desktop/src-tauri/icons/` currently holds a flat placeholder color,
  not a real logo — see the README in that folder.
- No "installed version" tracking in the app yet — Browse always shows
  "Install"/"Download", never "Installed"/"Update available", even for a
  mod already placed on disk.
- Rate limiting on the upload endpoints (see Security notes above).
- The game-versions list (`packages/shared/src/gameVersions.ts`) is a
  point-in-time scrape of about.openwf.io — it won't pick up new patches
  released after it was generated until someone re-scrapes and
  regenerates the file.
