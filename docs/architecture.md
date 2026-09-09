# Architecture

A mod manager for OpenWF / SpaceNinjaServer: a Tauri desktop app for
browsing/uploading/downloading mods (metadata patches, `.pluto` scripts,
etc.), backed by a Cloudflare-only serverless stack chosen so the whole
thing runs for $0/month at small-to-medium scale.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Desktop app | [Tauri v2](https://v2.tauri.app/) + React + TypeScript + Vite | Native-ish, small bundle, no Electron overhead. |
| API | [Cloudflare Workers](https://workers.cloudflare.com/) + [Hono](https://hono.dev/) | Free tier (100k req/day), same account as storage/DB below. |
| File storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) | S3-compatible, **zero egress fees** — the actual reason "download bypasses the API" saves money at all. 10 GB free. |
| Metadata DB | [Cloudflare D1](https://developers.cloudflare.com/d1/) | Serverless SQLite, free tier, zero cross-network latency from the Worker (replaces the originally-proposed Supabase/Neon — one vendor instead of two). |

## Data flow

**Upload** (modder, authenticated with an API key):
```
Tauri app --(multipart: zip + JSON metadata, Bearer <api-key>)--> Worker
                                                                     |
                                                    +----------------+----------------+
                                                    |                                 |
                                              R2.put(zip)                      D1 INSERT (mods, mod_versions)
```

**Download** (any user, no auth needed):
```
Tauri app --GET /api/mods--> Worker --SELECT--> D1
Tauri app <--[{ ..., downloadUrl }]-- Worker
Tauri app --GET downloadUrl--------------------------------------> R2 (direct, bypasses Worker entirely)
```

The list/detail response embeds a public R2 URL per version
(`PUBLIC_BUCKET_URL` + object key). The client fetches that URL directly —
the Worker is never in the request path for the actual file transfer,
which is what keeps egress at zero regardless of download volume.

## Data model

See [`apps/api/schema.sql`](../apps/api/schema.sql) and the mirrored
TypeScript types in [`packages/shared/src/types.ts`](../packages/shared/src/types.ts)
(kept in sync by hand — no ORM/codegen layer, deliberately, to stay
lightweight).

- `modders` — one row per person allowed to upload. API keys are issued
  out-of-band (manually, via `wrangler d1 execute`) rather than
  self-service, so the upload endpoint isn't an open target.
- `mods` — one row per mod (slug id, name, author, category, owner).
- `mod_versions` — one row per uploaded version of a mod (R2 key,
  checksum, changelog). A mod can have many versions; the list endpoint
  returns only the latest, the detail endpoint returns full history.

## API surface (`apps/api/src/routes/mods.ts`)

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/mods` | none | List all mods + latest version + download URL. |
| `GET /api/mods/:id` | none | One mod's full version history. |
| `POST /api/mods` | API key | Create a mod + its first version. |
| `POST /api/mods/:id/versions` | API key (owner only) | Add a new version to an existing mod. |

## Security notes / follow-ups

- **Upload auth is in place** (`src/auth.ts`): `Authorization: Bearer <key>`,
  hashed with a server-side salt before comparing against D1. Keys are
  provisioned manually — there's intentionally no public signup route yet.
- **Not yet implemented, do before any public upload endpoint goes live:**
  - Rate limiting on `POST /api/mods*` (Cloudflare has a free rate-limiting
    rule at the zone level, or a KV/D1-backed counter in the Worker).
  - Zip content validation/scanning server-side — right now any `.zip`
    under the size cap is accepted as-is.
  - Zip-slip protection **in the desktop app** when a downloaded mod is
    extracted into the local Warframe/SpaceNinjaServer directory — sanitize
    every entry path before writing, since extraction happens outside the
    Worker's control entirely.
- CORS is currently wide open (`app.use("*", cors())`) since there's no
  cookie/session to protect — fine given bearer-token auth, but worth
  narrowing once a production domain exists.

## Local dev

```bash
npm install                                   # from the repo root, installs all workspaces

# API (Worker)
wrangler d1 create openwf-mod-manager         # then paste the id into apps/api/wrangler.toml
wrangler r2 bucket create openwf-mod-manager
npm run db:init                               # applies apps/api/schema.sql to the local D1
cp apps/api/.dev.vars.example apps/api/.dev.vars
npm run dev:api                                # wrangler dev, http://127.0.0.1:8787

# Desktop (Tauri) — requires Rust installed (rustup.rs); not present in this environment yet
npm run dev:desktop
```

## Known gaps in this scaffold

- No Rust toolchain was available when this was scaffolded, so the Tauri
  side is hand-written config/Rust, not yet built or run.
- `apps/desktop/src-tauri/icons/` is empty — run `tauri icon` once before
  the first real build (see the README in that folder).
- `wrangler.toml` has placeholder `database_id` / `PUBLIC_BUCKET_URL`
  values that need real values from `wrangler d1 create` / the R2 bucket's
  public URL (or a custom domain) once those resources are provisioned.
- No modder-onboarding tooling yet — issuing a new API key is a manual
  `INSERT INTO modders` today.
