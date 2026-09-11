# OpenWF Mod Manager — Security & Stability Audit (2026-09)

Read-only audit across three layers: Tauri/native desktop, Cloudflare Worker/D1 API, and the React frontend. Each finding cites file:line where applicable. Status column is updated as items are addressed.

## 1. Critical Security Vulnerabilities (P0 — fix before production)

| # | Finding | Location | Status |
|---|---|---|---|
| 1 | No React Error Boundary anywhere in the app — a single malformed record (e.g. a mod with `tags: null`) throws uncaught during render and crashes the entire webview to a blank white screen. | `apps/desktop/src/main.tsx`, `App.tsx` | **Done** |
| 2 | Comment author impersonation — `POST /:id/comments` auto-links `authorAccountId` by case-insensitive name match against `modders.name`; anyone can type an existing modder's/admin's display name and have their comment render as that account. | `apps/api/src/routes/mods.ts:735-761` | Open |
| 3 | Auth token stored in plaintext `localStorage` + Tauri CSP fully disabled (`security.csp: null`) — combined, a single future XSS becomes a full account-takeover primitive with nothing to contain it. | `apps/desktop/src/settings.ts:59-65`, `apps/desktop/src-tauri/tauri.conf.json:22-24` | Open |
| 4 | Unrestricted file read/write Tauri IPC commands (`read_file_bytes`/`write_file_bytes`) accept a raw path with no allowlist/containment check. Not reachable by untrusted input today, but a live arbitrary-file-read/write primitive behind the IPC boundary. | `apps/desktop/src-tauri/src/commands.rs:10-21` | Open |

## 2. Architecture & Logic Flaws (P1 — high impact bugs/instability)

| # | Finding | Location | Status |
|---|---|---|---|
| 1 | Zero runtime validation of API responses — every function trusts `as T` casts, no Zod/manual shape checks. Direct feeder for P0 #1. | `apps/desktop/src/api.ts` | Open |
| 2 | Comment vote race condition — rapid double-vote can leave `score`/`myVote` inconsistent with the server; no request sequencing/cancellation. | `apps/desktop/src/components/CommentSection.tsx:210-224` | Open |
| 3 | No auto-updater configured at all — no mechanism to ship a security fix to installed clients. | `apps/desktop/src-tauri/tauri.conf.json`, `Cargo.toml` | Open |
| 4 | No server-side pagination — entire mod catalog downloads on every Browse load. | `apps/desktop/src/api.ts:31-34` (`fetchModList`) | Open |
| 5 | `uninstall_files` Tauri command has no containment check against a known install root. | `apps/desktop/src-tauri/src/commands.rs:139-154` | Open |
| 6 | Double-click race on Install/Uninstall/Reinstall — `disabled` state lags one tick behind click, can fire concurrent file operations. | `apps/desktop/src/views/Browse.tsx:164-204`, `apps/desktop/src/components/ModDetail.tsx:106-146` | Open |
| 7 | `PATCH /api/mods/:id` has no rate limit, and `description` has no type/length cap unlike sibling fields. | `apps/api/src/routes/mods.ts:318-398` | Open |

## 3. UX, Edge Cases & Loose Ends (P2)

| # | Finding | Location | Status |
|---|---|---|---|
| 1 | No `AbortController`/timeout anywhere in `api.ts` — a hung Worker leaves loading spinners spinning forever. | `apps/desktop/src/api.ts` | Open |
| 2 | `<img src>` for thumbnails/screenshots has no scheme allowlist before rendering. | `ModDetail.tsx:220`, `Browse.tsx:386/464`, `Profile.tsx:71` | Open |
| 3 | Exit-animation `setTimeout` not tracked/cleared on unmount. | `apps/desktop/src/components/ToastHost.tsx:37-39` | Open |
| 4 | Single `listener` variable, not a `Set` — a second subscriber silently steals navigation. | `apps/desktop/src/profileNav.ts:7-14` | Open |
| 5 | `http:default` capability scope broader than needed (any localhost port, all of github.com). | `apps/desktop/src-tauri/capabilities/default.json:9-17` | Open |
| 6 | File uploads are extension-checked only, not content-sniffed. | `apps/api/src/routes/mods.ts:437-445` | Open |
| 7 | Browse search input isn't debounced (low impact today — in-memory filter). | `apps/desktop/src/views/Browse.tsx` | Open |

## 4. Code Quality & Refactoring Recommendations

- Introduce a Zod schema layer for every `api.ts` response type, replacing `as T` casts — fixes P1 #1 and half of P0 #1.
- Extract the duplicated `ActionState`/`handleInstall`/`handleDownload`/`handleUninstall` pattern in `Browse.tsx` and `ModDetail.tsx` into a shared hook (e.g. `useModAction`) — natural place to add the in-flight guard fixing P1 #6.
- Fix `profileNav.ts` to use a `Set<Listener>` like `toast.ts` already does.
- Wrap `api.ts` fetch calls with a shared `fetchWithTimeout`/`AbortController` helper.
- Move the API key off `localStorage` into `tauri-plugin-store` or the `keyring` crate.

## 5. Concrete Action Plan & Next Steps

1. **Add a top-level `ErrorBoundary`** wrapping `<App/>` in `main.tsx`. *(Done — see below)*
2. Fix comment impersonation: require exact case-sensitive match, or only auto-link when the poster supplies a valid API key for that modder.
3. Add Zod validation to `api.ts`, starting with `fetchModList`, `fetchMod`, `fetchComments`.
4. Harden `handleVote` in `CommentSection.tsx` with a request-id/cancellation guard.
5. Move the API key to `tauri-plugin-store`/OS keychain, and set an actual `security.csp` in `tauri.conf.json`.
6. Add a containment check to `uninstall_files`/`read_file_bytes`/`write_file_bytes` in `commands.rs`.
7. Add rate limiting + validation to `PATCH /api/mods/:id`.
8. Batch: debounce Browse search, add `AbortController` timeouts, tighten `capabilities/default.json` http scope, clear the `ToastHost` timeout, fix `profileNav.ts`'s single-listener.
9. Decide on an update story — either add `tauri-plugin-updater` with signature verification, or explicitly document that updates are manual.
