# OpenWF Mod Manager

A desktop mod manager for [OpenWF](https://about.openwf.io/) / SpaceNinjaServer:
upload and browse/download mods (metadata patches, `.pluto` scripts, etc.)
without manually shuffling zip files around.

See [docs/architecture.md](docs/architecture.md) for the full design —
stack choices, data flow, schema, API surface, and security notes.

## Layout

| Path | What's in it |
|---|---|
| [`apps/desktop/`](apps/desktop/) | The Tauri + React + TypeScript client. |
| [`apps/api/`](apps/api/) | The Cloudflare Worker API (Hono), backed by D1 + GitHub Releases. |
| [`packages/shared/`](packages/shared/) | TypeScript types shared between the two, mirroring the D1 schema. |
| [`docs/architecture.md`](docs/architecture.md) | Design doc: stack, data flow, schema, API routes, security follow-ups. |

For the mod *content* itself (the actual OpenWF metadata-patch DSL and
`.pluto` scripting conventions this manager will ship), see the docs in
the parent [`OPENWF _ Modding/docs/`](../docs/) folder.

## Status

Scaffolded, not yet run — see "Known gaps" at the bottom of
[docs/architecture.md](docs/architecture.md#known-gaps-in-this-scaffold)
for exactly what's left before `npm run dev:api` / `npm run dev:desktop`
work end to end.
