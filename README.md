# OpenWF Mod Manager

A desktop mod manager for [OpenWF](https://about.openwf.io/) / SpaceNinjaServer:
browse, install, update, and uninstall mods (metadata patches, `.pluto`
scripts, etc.) instead of manually shuffling files from Discord links into
the right folder.

See [docs/architecture.md](docs/architecture.md) for the full design —
stack choices, data flow, schema, API surface, and security notes.

## Layout

| Path | What's in it |
|---|---|
| [`apps/desktop/`](apps/desktop/) | The Tauri + React + TypeScript client. |
| [`apps/api/`](apps/api/) | The Cloudflare Worker API (Hono), backed by D1 + GitHub Releases. |
| [`packages/shared/`](packages/shared/) | TypeScript types shared between the two, mirroring the D1 schema. |
| [`docs/architecture.md`](docs/architecture.md) | Design doc: stack, data flow, schema, API routes, security follow-ups. |
| [`TODO.md`](TODO.md) | Tracked list of planned/considered work. |

For the mod *content* itself (the actual OpenWF metadata-patch DSL and
`.pluto` scripting conventions this manager ships), see the docs in the
parent [`OPENWF _ Modding/docs/`](../docs/) folder.

## Status

Live and working: the API is deployed, mods can be uploaded/browsed/
installed/uninstalled/updated end to end. See [`TODO.md`](TODO.md) for
what's next. To run the desktop app locally: `npm install`, then
`npm run dev:desktop` (requires Rust — see
[docs/architecture.md § Local dev](docs/architecture.md#local-dev)).
