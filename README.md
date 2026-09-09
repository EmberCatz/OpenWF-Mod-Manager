# OpenWF Mod Manager

A desktop mod manager for [OpenWF](https://about.openwf.io/) / SpaceNinjaServer:
browse, install, update, and uninstall mods (metadata patches, `.pluto`
scripts, etc.) instead of manually shuffling files from Discord links into
the right folder.

See [docs/architecture.md](docs/architecture.md) for the full design —
stack choices, data flow, schema, API surface, and security notes.

## Disclaimer

This is an independent, community-made project and is **not affiliated
with, endorsed by, sponsored by, or otherwise connected to the developer
or publisher of Warframe.** WARFRAME® and the WARFRAME logo are
registered trademarks of their respective owner; they, and any other game
content/assets referenced here, remain the property of their respective
owners. Their use here is solely to describe compatibility and does not
imply sponsorship or endorsement.

This tool is built for use with [OpenWF](https://about.openwf.io/), an
independent, community-run project — it does not connect to or interact
with Warframe's official servers in any way.

Mods distributed through this project (metadata patches, `.pluto`
scripts) are user-submitted content, provided "as is" without warranty of
any kind; they are not reviewed, endorsed, or guaranteed by this project.
Using modified clients or unofficial servers with Warframe may conflict
with its End User License Agreement — you're solely responsible for
understanding and complying with whatever terms apply to your own use.

If you're a rights holder with a concern about content hosted or
distributed through this project, open an issue on this repo or reach out
directly — it will be addressed promptly.

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
