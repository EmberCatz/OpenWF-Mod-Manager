# Red Team Attack Assessment — OpenWF Mod Manager (2026-09)

Follow-up to [security-audit-2026-09.md](security-audit-2026-09.md) (steps 1–5 of which are already applied). This pass specifically hunts for exploitable attack chains — IPC/privilege escalation, path traversal, deep-link hijacking, SQLi, IDOR, race conditions, upload abuse, and XSS→RCE — with step-by-step PoCs where a real trigger exists, and an honest "not exploitable" verdict (with evidence) everywhere a theoretical smell didn't pan out into an actual exploit.

**Method**: three independent deep-read passes (Tauri/native, Cloudflare Worker/D1, React frontend), each re-verifying prior claims from scratch rather than trusting the previous audit, then a fourth manual pass by me to read the exact vulnerable code and write concrete patches for anything confirmed exploitable.

## Summary

| # | Finding | Verdict | Severity |
|---|---|---|---|
| 1 | Rate-limit bypass via TOCTOU race | **EXPLOITABLE** — **Fixed** | Medium (CVSS ~5.3) |
| 2 | Unsniffed uploads → malware distribution via GitHub Releases | **EXPLOITABLE** — **Fixed** | Medium (CVSS ~6.5) |
| 3 | Tauri file IPC (`read_file_bytes`/`write_file_bytes`/`uninstall_files`) lacks path confinement | Defense-in-depth gap — **no active trigger found** | High if ever triggered (CVSS ~7.8); currently not reachable |
| — | IDOR on mod/version/account write routes | NOT EXPLOITABLE | — |
| — | SQL injection | NOT EXPLOITABLE | — |
| — | Comment vote race | NOT EXPLOITABLE (atomic DB upsert) | — |
| — | Deep link / custom protocol hijacking | NOT EXPLOITABLE (no such surface exists) | — |
| — | XSS via mod/comment/profile content | NOT EXPLOITABLE (React auto-escaping, no markdown parser, no `dangerouslySetInnerHTML`) | — |
| — | Client-side state tampering → fake admin UI | NOT EXPLOITABLE (every privileged action re-authenticates server-side) | — |
| — | Rate-limit bypass via `X-Forwarded-For` spoofing | NOT EXPLOITABLE (keyed on edge-set `CF-Connecting-IP`) | — |
| — | Banned account using a still-valid session | NOT EXPLOITABLE (`is_banned` checked in `authenticate()` itself) | — |
| — | `postMessage`/iframe bridging from Live Settings' embedded WebUIs | NOT EXPLOITABLE (no bridging code exists) | — |
| — | Local secret residue (post-keychain-migration) | NOT EXPLOITABLE (nothing sensitive left in `localStorage`/logs) | — |

---

## 1. Exploitable Findings

### 1.1 Rate-limit bypass via TOCTOU race — Medium (CVSS ~5.3) — Fixed

**Location**: [`apps/api/src/rateLimit.ts:21-50`](../apps/api/src/rateLimit.ts)

**The bug**: `checkRateLimit` reads the current hit count with one D1 round trip (`SELECT COUNT(*) ...`), then — only if under the limit — writes a new hit row with a *second*, separate round trip (`INSERT INTO rate_limit_hits ...`). Nothing makes the read-then-write atomic. Every rate-limited route in the app (`login`, `signup`, `comment`, `comment_vote`, `review`, `report`, `mod_upload`, `download_count`) shares this one function, so the bug affects all of them identically.

**Attack chain (PoC)**: fire N requests in parallel instead of serially.

```bash
# Login is capped at 8 attempts / 5 minutes / IP. Fire 50 in parallel:
for i in $(seq 1 50); do
  curl -s -X POST https://<worker>/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"victim","password":"guess-'"$i"'"}' &
done
wait
```

Each of the 50 requests' `SELECT COUNT(*)` can execute before any of the others' `INSERT` commits, so all (or most) of them read the same pre-insert count and pass the `>= limit` check — the 8-per-5-minutes cap on login attempts (and every other rate-limited bucket) degrades toward "however many requests you can fire in the race window," directly multiplying brute-force throughput against login, and comment/vote/report spam throughput elsewhere.

**Impact**: rate limiting is this app's only defense against credential brute-forcing and low-effort spam (per `docs/architecture.md`'s own stated threat model of "a bored person with a script," not a botnet) — a race that defeats it removes that defense entirely for anyone willing to fire requests concurrently instead of one at a time. Not a data-corruption or auth-bypass bug on its own, hence Medium rather than High/Critical.

**Patch** — make the increment-and-check atomic using D1's `.batch()` (which runs multiple statements as one implicit, serialized transaction — the actual mechanism D1 offers for this, since D1/SQLite is single-writer):

```ts
export async function checkRateLimit(
  c: Context<{ Bindings: Env }>,
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const now = new Date().toISOString();

  // Insert-then-count as a single atomic batch — D1 runs a batch as one
  // implicit transaction, serialized against every other write to this
  // database. This is what actually closes the race a separate
  // SELECT-then-INSERT has: two concurrent callers can no longer both read
  // the same pre-insert count and both be let through, because each
  // caller's own hit is durably recorded before either count is read back.
  const [, countResult] = await c.env.DB.batch<{ count: number }>([
    c.env.DB.prepare("INSERT INTO rate_limit_hits (bucket, key, created_at) VALUES (?, ?, ?)").bind(bucket, key, now),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM rate_limit_hits WHERE bucket = ? AND key = ? AND created_at > ?").bind(bucket, key, cutoff),
  ]);

  const count = countResult.results[0]?.count ?? 1;

  if (Math.random() < 0.02) {
    const pruneCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await c.env.DB.prepare("DELETE FROM rate_limit_hits WHERE created_at < ?").bind(pruneCutoff).run();
  }

  // Every attempt is now recorded (even ones that end up rejected) —
  // stricter than before, and correct: a blocked caller retrying while
  // already over the limit should keep counting against their window,
  // not get a free pass just because their earlier attempts were rejected.
  return count <= limit;
}
```

Note the behavior change flagged in the comment: previously a *rejected* call recorded nothing, so a caller sitting right at the limit and retrying while blocked didn't accumulate further hits. With this patch every attempt counts, which is the standard/correct rate-limiter behavior and is strictly harder to abuse, not easier.

**Applied and verified**: fired 30 fully parallel `POST /api/auth/login` requests (limit 8/5min) against `wrangler dev` + local D1 — exactly 8 passed through (401 "incorrect username or password") and the remaining 22 were correctly rejected with 429, even under full concurrency. Before this patch, parallel requests like these were exactly what let more than the configured limit through.

---

### 1.2 Unsniffed uploads → malware distribution via GitHub Releases — Medium (CVSS ~6.5) — Fixed

**Location**: [`apps/api/src/routes/mods.ts:76-79`](../apps/api/src/routes/mods.ts) (`fileExtension`), `:443-445` and `:573-575` (the only validation before upload), `apps/api/src/github.ts:57` (hardcoded `Content-Type: application/zip`).

**The bug**: upload validation is extension-and-size only (`[".zip", ".pluto", ".txt"]`, ≤50MB) — the actual bytes are never inspected. A file can carry any content as long as its name ends in one of those three strings.

**Attack chain (PoC)**:
1. `POST /api/auth/signup` with `{"username":"attacker","password":"password123"}` → get a session `token`. (Free, self-service, one request — itself amplified by finding 1.1's race if signup is ever throttled.)
2. `POST /api/mods` as `multipart/form-data`, `Authorization: Bearer <token>`:
   - `file` = an arbitrary binary (e.g. a Windows PE/EXE, or any malware sample), filename `totally-a-mod.zip`
   - `metadata` = `{"name":"Totally A Mod","version":"1.0.0","category":"other"}`
3. The extension check passes (`.zip` matches), the size check passes (well under 50MB), and the server uploads the raw bytes to a **public** GitHub Release asset, mislabeled `Content-Type: application/zip`, and returns a permanent, unauthenticated `downloadUrl`.
4. That URL now serves the actual EXE to anyone — inside the app (as a "mod install") or directly via the raw GitHub URL outside the app entirely, for as long as the release exists.

**Impact**: a one-signup-per-attempt cost buys permanent, credible-looking (branded as a game mod, hosted on the project's own GitHub) malware hosting and distribution. This is a reputational and downstream-user-safety risk, not a server compromise — hence Medium, not Critical/High.

**Patch** — sniff actual content against what the extension claims, not just the name:

```ts
// Zip local-file-header magic (PK\x03\x04) — the only reliable signature
// check available without a full parse. .pluto/.txt are plain-text
// scripts, so anything that isn't valid UTF-8 text is rejected outright —
// this alone blocks a binary payload (an .exe, say) renamed with a text
// extension, without needing a content-aware parser for every format.
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

async function looksLikeValidUpload(file: File, extension: string): Promise<boolean> {
  if (extension === ".zip") {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return ZIP_MAGIC.every((b, i) => head[i] === b);
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    return true;
  } catch {
    return false;
  }
}
```

Applied right after each existing extension check (both upload routes, `mods.ts:443-445` and `:573-575`):

```ts
  if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
    return c.json({ error: `only ${ALLOWED_EXTENSIONS.join(", ")} uploads are accepted` }, 400);
  }
  if (!(await looksLikeValidUpload(file, fileExtension(file.name)))) {
    return c.json({ error: "file content doesn't match its extension" }, 400);
  }
```

This isn't a full antivirus scan (out of scope for a hobby-scale project per the codebase's own stated threat model), but it closes the specific "rename a binary to `.zip`/`.pluto`/`.txt`" trick, which is the actual PoC above.

**Applied and verified**: a file starting with a fake `MZ` (PE/EXE) header renamed to `.zip` is now rejected with `"file content doesn't match its extension"` before it ever reaches GitHub; a file starting with the real zip magic bytes (`PK\x03\x04`) passes the check and proceeds (confirmed it reaches the GitHub-upload step, which only then fails on this local dev environment's missing `GITHUB_TOKEN` — an unrelated, expected limitation, not a flaw in the patch); a `.pluto` file with valid UTF-8 content passes the same way, and one with invalid UTF-8 bytes is correctly rejected.

---

## 2. Defense-in-Depth Gap (Theoretical — No Active Trigger Found)

### 2.1 Tauri file IPC lacks path confinement — High if triggered (CVSS ~7.8), currently not reachable

**Location**: [`apps/desktop/src-tauri/src/commands.rs`](../apps/desktop/src-tauri/src/commands.rs) — `read_file_bytes` (line ~45), `write_file_bytes` (~50), `uninstall_files` (~175), plus `get_api_key`.

**The gap**: Tauri's IPC has no per-origin ACL. Capabilities (`capabilities/default.json`) gate *which* commands are registered, not *who* is allowed to call them — any JavaScript executing in the webview can call `invoke("write_file_bytes", { path, bytes })` with **any** path string, not just one that came from a native save dialog. The Rust side performs zero containment check on `path` in `read_file_bytes`/`write_file_bytes`, and `uninstall_files` deletes any path in an array with no root confinement either.

**Why this is NOT currently exploitable — verified, not assumed**:
- No `dangerouslySetInnerHTML`/`innerHTML`/`eval(`/markdown parser exists anywhere in `apps/desktop/src` (re-confirmed by fresh grep this pass).
- Every user-controlled string (mod name/description/tags/author, comment body, profile name) renders via plain JSX `{text}` interpolation, which React auto-escapes — there is no injection point that turns stored content into executable script.
- `tauri.conf.json`'s CSP (`script-src 'self'`, no `unsafe-inline`/`unsafe-eval`) blocks the classic remaining vector — an attacker-hosted or inline `<script>` — even if one were somehow injected into the DOM.
- No deep-link/custom-URL-scheme handler exists to deliver a payload that way either.

**The honest caveat**: CSP `script-src 'self'` does **not** protect against a compromised first-party npm dependency shipped inside the app's own bundle (a supply-chain attack) — that code is `'self'` by definition and would have the exact same unrestricted `invoke()` reach described above. This is a real gap in defense-in-depth, not a live exploit.

**Recommended hardening** (worth doing precisely because it's cheap insurance against a future XSS or a compromised dependency, not because anything exploits it today): both commands have exactly one legitimate call site each —
- `read_file_bytes` ← only `Upload.tsx:93`, reading whatever `pickModFileToUpload()` (a native Open dialog) just returned.
- `write_file_bytes` ← only `modActions.ts:58`, writing to whatever `pickSaveLocation()` (a native Save dialog) just returned.

Because each has a single call site fed by a dialog result, the path never needs to be a free string JS can supply independently. Two options, in order of preference:

1. **Ideal**: merge "show the dialog" and "read/write the picked file" into one Rust-side command each (using `tauri-plugin-dialog`'s Rust API to show the dialog synchronously from within the command), so JS receives only bytes/a success result — never a path string it could substitute its own value into. This removes the free-path IPC surface for these two operations entirely.
2. **Cheaper, still effective**: have the pick commands issue a short-lived, single-use capability token (a random string held in an in-memory `Mutex` on the Rust side) alongside the picked path; `read_file_bytes`/`write_file_bytes` require a matching, unexpired token. A compromised script could still trigger the dialog itself, but that surfaces a real, visible native OS file picker the user would see and could cancel — it can no longer silently read/write/delete arbitrary paths with no user-visible action at all.

Neither is applied in this pass — this is a recommendation for a future hardening step, not an active fix, since nothing in the current codebase can actually reach it.

---

## 3. Verified Not Exploitable (evidence, not assumption)

- **IDOR**: every write/edit route that operates on a specific mod/version (`PATCH/DELETE /api/mods/:id`, `POST /:id/versions`, `DELETE /:id/versions/:version`) fetches the resource's `owner_id` and compares it against the authenticated caller before proceeding, with an explicit `isAdmin` bypass logged via `logModerationAction`. `PATCH/DELETE /api/auth/me` take no target-id parameter at all — they only ever act on the token's own `modder.id`.
- **SQL injection**: every `.prepare()` call across `routes/mods.ts`, including the dynamic PATCH field-list builder, only ever interpolates hardcoded column-name literals — bound `?` placeholders carry every value derived from request input.
- **Comment vote race**: the vote upsert is `INSERT ... ON CONFLICT (comment_id, voter_id) DO UPDATE`, backed by a real `PRIMARY KEY (comment_id, voter_id)` — a genuine atomic DB-level upsert, unlike the rate-limiter bug above.
- **Deep link / custom protocol hijacking**: no `tauri-plugin-deep-link`, no custom URL scheme, no `onOpenUrl` handler anywhere in `Cargo.toml`, `tauri.conf.json`, or `main.rs`. No attack surface exists to hijack.
- **XSS via mod/comment/profile content**: confirmed for every render path (name, description, tags, theme, author, subAuthor, comment body, profile name) — plain JSX interpolation only. `thumbnailUrl`/`screenshotUrls` are used exclusively as `<img src>`, never as a link `href`; a `javascript:` or `data:` URI in an `<img src>` doesn't execute in any evergreen browser. No markdown/rich-text parser exists anywhere in the app.
- **Client-side state tampering → fake admin UI**: `isAdmin` only ever controls *tab visibility*, and is itself resolved server-side via `fetchMe(token)`. Every actual privileged action (`Admin.tsx`'s user ban/delete, report resolve/dismiss, site controls, kill-sessions, IP bans; `ModDetail.tsx`/`CommentSection.tsx`'s admin-delete) passes the real API key from `useApiKey()`/`getApiKey()` into the request — a locally forged flag with no real token gets nothing past the UI, since `routes/admin.ts`'s `requireAdmin()` re-checks server-side on every call regardless of what the client believes about itself.
- **Rate-limit bypass via header spoofing**: `clientIp()` keys strictly on `CF-Connecting-IP`, set by Cloudflare's edge and not attacker-controllable for traffic actually routed through Cloudflare; `X-Forwarded-For` is never read.
- **Banned account using a still-valid session**: `is_banned` is checked inside `authenticate()` itself (both the API-key and session-token lookup paths), so it's enforced on every authenticated route, not just at login.
- **`postMessage`/iframe bridging**: `LiveIframePanel.tsx` (which embeds the Bootstrapper/SpaceNinjaServer local WebUIs) contains a plain `<iframe src>` and a `no-cors` liveness poll — no `postMessage`/`addEventListener("message")` bridge exists for a malicious page loaded inside those iframes to reach back into the parent app.
- **Local secret residue**: the auth token exists only in React state (fetched fresh from the OS keychain each mount) and is never written to `localStorage` or a file; every remaining `localStorage` key is non-sensitive (install paths, UI prefs, ports, a random anonymous `reviewerId`). No token/credential appears in any `console.log`/`console.error` call.

---

## 4. Recommended Next Steps

1. Apply the rate-limiter atomic-batch patch (§1.1) — small, self-contained, closes a real bypass affecting every rate-limited endpoint at once.
2. Apply the upload content-sniffing patch (§1.2) — small, self-contained, closes the malware-hosting PoC.
3. Decide whether the Tauri file-IPC hardening (§2.1) is worth the larger refactor now, given it's currently unreachable — reasonable to defer until either a markdown/rich-text feature is ever added (which would reopen the XSS question) or as routine defense-in-depth hygiene.
