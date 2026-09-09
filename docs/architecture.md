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

## Free-form tags

Separate from `gameVersions` (compatibility, validated against a fixed
list), `Mod.tags` is unrestricted, user-defined, Notion-style tagging —
"QoL", "combat", "meme," whatever a modder wants, stored as a JSON array
on the mod itself (not per-version). Server-side validation
(`apps/api/src/routes/mods.ts::validateTags`) only caps count (15) and
length (30 chars/tag) and dedupes — it deliberately does not enforce a
fixed vocabulary, unlike game versions.

`TagInput.tsx` is the entry widget: type + Enter/comma commits a chip,
Backspace on an empty field pops the last one, and a dropdown suggests
tags already used on *other* mods (computed client-side from the already-
fetched mod list, no separate endpoint) so spellings converge naturally
("QoL" vs "qol") without a moderator having to enforce it. Browse shows
tags as clickable badges that filter the list — click again to clear.

## Data model

See [`apps/api/schema.sql`](../apps/api/schema.sql) and the mirrored
TypeScript types in [`packages/shared/src/types.ts`](../packages/shared/src/types.ts)
(kept in sync by hand — no ORM/codegen layer, deliberately, to stay
lightweight).

- `modders` — one row per person allowed to upload. Two ways in: a
  self-service username/password account (`routes/auth.ts`), or an
  out-of-band API key issued manually via `wrangler d1 execute`
  (`scripts/create-modder.mjs`, kept for existing keys / local testing).
  Both resolve to the same row and work interchangeably everywhere auth is
  checked — see `authenticate()` in `src/auth.ts`.
- `sessions` — a logged-in session from username/password login. The
  token is checked the same way an API key is (hashed, compared against
  D1), so nothing else in the API needs to know which kind it's looking at.
- `mods` — one row per mod (slug id, name, author, category, owner,
  thumbnail/screenshot URLs — external links only, see below — and
  free-form user-defined tags, see below).
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
| `GET /api/mods/mine` | token | Mods owned by the caller — "My Mods" tab. |
| `POST /api/mods` | token | Create a mod + its first version (creates a GitHub Release + uploads the zip as its asset). |
| `POST /api/mods/:id/versions` | token (owner only) | Add a new version to an existing mod (same GitHub flow). |
| `DELETE /api/mods/:id/versions/:version` | token (owner only) | Remove one version (D1 row, then best-effort GitHub release delete). |
| `DELETE /api/mods/:id` | token (owner only) | Remove a mod and all its versions (cascades in D1, then best-effort GitHub release deletes). |

"Token" above means either kind `authenticate()` accepts (see below) — an
API key or a session token, both sent as `Authorization: Bearer <...>`.

## Accounts (`apps/api/src/routes/auth.ts`)

Self-service username/password accounts, added alongside the older
manually-issued API keys (still supported, see the `modders` row above).
No email is collected — the account is just a username and a salted
password hash, on purpose, to keep this to the minimum personal data
actually needed.

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/auth/signup` | none | Create an account, returns a session token (also logs you in). |
| `POST /api/auth/login` | none | `{ username, password }` → session token. |
| `POST /api/auth/logout` | token | Invalidates the session token used to call it. |
| `GET /api/auth/me` | token | Resolves the current token to `{ id, username }`. |
| `DELETE /api/auth/me` | token | Deletes the account. Refuses (409) while it still owns mods — delete/hand those off via My Mods first. |

Passwords are hashed with PBKDF2-SHA256 (`src/passwords.ts`) via the Web
Crypto API already available in the Workers runtime — no bcrypt/argon2
dependency, since those need native bindings that don't run here. Session
tokens are random, stored hashed the same way API keys are, and expire
after 30 days.

`src/github.ts` wraps the three GitHub REST calls involved: create a
release, upload an asset to it, and (best-effort, on a D1 write failure
after the GitHub side already succeeded) delete the orphaned release.

## Security & billing-risk notes

- **No component in this stack requires a payment method.** Workers Free,
  D1 Free, and GitHub are all card-free by design — this was a deliberate
  constraint, not an accident (see "Why GitHub Releases, not R2" above).
- **Upload auth is in place** (`src/auth.ts`): `Authorization: Bearer <token>`,
  hashed before comparing against D1 — either an API key or a self-service
  account's session token (see "Accounts" above). This is what actually
  stops "someone uploads excessive data" — a stranger can't call
  `POST /api/mods*` without a valid token, regardless of what it's backed by.
- **The GitHub PAT (`GITHUB_TOKEN`) is server-side only** — set as a
  Wrangler secret, never sent to or readable by the desktop client. Scope
  it to "Contents: Read and write" on just the storage repo (fine-grained
  PAT), not a classic all-repo token.
- **Zip-slip protection is implemented** in the desktop app's install
  command (see "Install flow" above) — extraction can't write outside the
  chosen install root.
- **Rate limiting is implemented** (`src/rateLimit.ts`), D1-backed rather
  than Cloudflare's dashboard Rate Limiting Rules — those are a zone/WAF
  product and don't apply to a bare `workers.dev` subdomain without a
  custom domain in front of it. Covers `POST /api/auth/signup` and
  `/login` (per IP — the actual brute-force/mass-account-creation
  surface), `POST /api/mods*` (per authenticated modder), and the
  anonymous `POST /api/mods/:id/comments` and `/reviews` (per IP). Not
  built for a real distributed attack — this project's threat model is
  "a bored person with a script," not a botnet.
- **Not yet implemented:**
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

## Installed-state tracking (desktop app)

`apps/desktop/src/installed.ts` tracks, purely in `localStorage`, which
mod+version is currently installed and the exact absolute file paths its
install wrote — not derived from Settings at read time, so changing the
install-folder settings later doesn't retroactively confuse what's
already on disk. `modActions.ts` is the shared install/uninstall/download
logic used by both `Browse.tsx` and `components/ModDetail.tsx`, so the
two views can't drift out of sync with each other. Switching a mod from
one installed version to another removes the old version's files first
(same tracked-paths mechanism uninstall uses), so upgrading doesn't leave
stale files from the previous version behind.

## Known gaps

See [`TODO.md`](../TODO.md) at the repo root for the tracked list of
planned/considered work — kept there instead of duplicated here so there's
one place to check, not two that can drift out of sync.
