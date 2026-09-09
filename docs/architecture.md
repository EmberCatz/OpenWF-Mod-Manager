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

## Data model

See [`apps/api/schema.sql`](../apps/api/schema.sql) and the mirrored
TypeScript types in [`packages/shared/src/types.ts`](../packages/shared/src/types.ts)
(kept in sync by hand — no ORM/codegen layer, deliberately, to stay
lightweight).

- `modders` — one row per person allowed to upload. API keys are issued
  out-of-band (manually, via `wrangler d1 execute`) rather than
  self-service, so the upload endpoint isn't an open target.
- `mods` — one row per mod (slug id, name, author, category, owner).
- `mod_versions` — one row per uploaded version of a mod (GitHub release
  id, download URL, checksum, changelog). A mod can have many versions;
  the list endpoint returns only the latest, the detail endpoint returns
  full history.

## API surface (`apps/api/src/routes/mods.ts`)

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/mods` | none | List all mods + latest version + download URL. |
| `GET /api/mods/:id` | none | One mod's full version history. |
| `POST /api/mods` | API key | Create a mod + its first version (creates a GitHub Release + uploads the zip as its asset). |
| `POST /api/mods/:id/versions` | API key (owner only) | Add a new version to an existing mod (same GitHub flow). |

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
- **Not yet implemented, do before any public upload endpoint goes live:**
  - Rate limiting on `POST /api/mods*` (Cloudflare has a free rate-limiting
    rule at the zone level, or a KV/D1-backed counter in the Worker) — the
    residual abuse surface with a leaked key is GitHub API rate limits and
    repo clutter, not money, but still worth throttling.
  - Zip content validation server-side — right now any `.zip` under the
    size cap is accepted as-is.
  - Zip-slip protection **in the desktop app** when a downloaded mod is
    extracted into the local Warframe/SpaceNinjaServer directory — sanitize
    every entry path before writing, since extraction happens outside the
    Worker's control entirely.
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
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in UPLOAD_API_KEY_SALT + GITHUB_TOKEN
npm run dev:api                                # wrangler dev, http://127.0.0.1:8787

# Desktop (Tauri) — requires Rust (rustup.rs)
npm run dev:desktop
```

## Known gaps in this scaffold

- `wrangler.toml` has placeholder `GITHUB_OWNER` / `GITHUB_REPO` values —
  point them at whichever repo will host the release assets (can be this
  same repo, or a dedicated storage-only one to keep the app repo's
  release list clean).
- No modder-onboarding tooling yet — issuing a new API key is a manual
  `INSERT INTO modders` today.
- `apps/desktop/src-tauri/icons/` currently holds a flat placeholder color,
  not a real logo — see the README in that folder.
