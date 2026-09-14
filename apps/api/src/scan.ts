import type { Env } from "./env";
import type { ModVersionFile } from "@openwf-mod-manager/shared";

// Scan-after-publish malware check for uploaded mod files (TODO.md §
// Content safety). Deliberately NOT run inline during upload — a real VT
// scan takes 15-60s+ to complete and the free tier caps at 4 requests/
// minute, so doing this synchronously would mean a burst of uploads (say
// 10 in one minute) either stalls behind VT's rate limit or blows past it.
// Instead: uploads queue a `file_scans` row (queueFilesForScan, called
// from routes/mods.ts right after the files land on GitHub) and go public
// immediately, exactly as before. `runScanCycle` is invoked once a minute
// by the Worker's scheduled handler (see index.ts + wrangler.toml's
// `[triggers]`) and drains that queue within a fixed per-run budget, so no
// matter how many uploads land in a given minute, VT's rate limit is never
// exceeded — the queue just takes a little longer to fully drain.
//
// A flagged file never gets un-published automatically (no gating here —
// see TODO.md's note on why "scan-after-publish" was chosen over "hidden
// until clean" at this project's current scale); it auto-files a `reports`
// row instead, so it surfaces in the existing Admin → Reports queue for a
// human to pull it, same as any user-submitted report.

const VT_API_BASE = "https://www.virustotal.com/api/v3";
// Free tier: 4 requests/minute. The scheduled trigger below runs every
// minute, so this is the per-run ceiling across every VT call this cycle
// makes (lookups, submissions, and polls all count against it) — kept
// strictly under 4 so a slightly-early cron retrigger or clock skew can't
// tip it over.
const SCAN_BUDGET_PER_RUN = 3;
// After this many failed attempts (network error, VT rejecting the
// request, etc. — not "still queued", which doesn't count as a failure) a
// file_scans row gives up and lands on 'error' instead of retrying forever.
const MAX_ATTEMPTS = 5;

type ScanStatus = "pending" | "clean" | "flagged" | "error";

function vtHeaders(env: Env): Record<string, string> {
  return { "x-apikey": env.VIRUSTOTAL_API_KEY! };
}

// Called right after routes/mods.ts pushes new version files to GitHub.
// INSERT OR IGNORE means an identical file (same sha256) re-uploaded under
// a different mod/version is never queued twice — it just rides along on
// whichever scan resolves first.
export async function queueFilesForScan(env: Env, files: ModVersionFile[]): Promise<void> {
  if (files.length === 0) return;
  await env.DB.batch(
    files.map((f) => env.DB.prepare("INSERT OR IGNORE INTO file_scans (checksum, download_url) VALUES (?, ?)").bind(f.checksum, f.downloadUrl))
  );
}

interface VtStats {
  malicious: number;
  suspicious: number;
}

// GET /files/{sha256} — VT already has a verdict for this exact hash
// (extremely common: any file VT has ever seen before, from anyone,
// anywhere). Resolves instantly with zero file upload needed. 404 means
// "unknown to VT", not an error.
async function lookupExistingReport(env: Env, sha256: string): Promise<VtStats | null> {
  const res = await fetch(`${VT_API_BASE}/files/${sha256}`, { headers: vtHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`VT file lookup failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { attributes: { last_analysis_stats: VtStats } } };
  return data.data.attributes.last_analysis_stats;
}

// POST /files — uploads the actual bytes for analysis. Only reached when
// lookupExistingReport came back unknown.
async function submitForAnalysis(env: Env, bytes: ArrayBuffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
  const res = await fetch(`${VT_API_BASE}/files`, { method: "POST", headers: vtHeaders(env), body: form });
  if (!res.ok) throw new Error(`VT submit failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

// GET /analyses/{id} — poll a previously-submitted analysis. `stats` is
// only meaningful once status is "completed"; while "queued" this returns
// null and the caller just tries again next cycle.
async function pollAnalysis(env: Env, analysisId: string): Promise<VtStats | null> {
  const res = await fetch(`${VT_API_BASE}/analyses/${analysisId}`, { headers: vtHeaders(env) });
  if (!res.ok) throw new Error(`VT analysis poll failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { attributes: { status: string; stats: VtStats } } };
  if (data.data.attributes.status !== "completed") return null;
  return data.data.attributes.stats;
}

async function resolveFileScan(env: Env, checksum: string, stats: VtStats): Promise<void> {
  const positives = stats.malicious + stats.suspicious;
  const status: ScanStatus = positives > 0 ? "flagged" : "clean";
  await env.DB.prepare("UPDATE file_scans SET status = ?, positives = ?, resolved_at = ? WHERE checksum = ?")
    .bind(status, positives, new Date().toISOString(), checksum)
    .run();
}

async function bumpAttempt(env: Env, checksum: string): Promise<void> {
  const row = await env.DB.prepare("SELECT attempts FROM file_scans WHERE checksum = ?").bind(checksum).first<{ attempts: number }>();
  const attempts = (row?.attempts ?? 0) + 1;
  const status: ScanStatus = attempts >= MAX_ATTEMPTS ? "error" : "pending";
  await env.DB.prepare("UPDATE file_scans SET attempts = ?, status = ? WHERE checksum = ?").bind(attempts, status, checksum).run();
}

// After any file_scans rows resolve this cycle, recompute scan_status on
// every still-'pending' mod_version that references one of them — worst-of
// across that version's files (flagged > error > pending > clean). Only
// 'pending' versions are considered since a version that already resolved
// to clean/flagged/error can't change (its files are done resolving too —
// see the flagged/error branches below never being revisited once set).
async function recomputeVersionScanStatuses(env: Env, resolvedChecksums: string[]): Promise<void> {
  if (resolvedChecksums.length === 0) return;

  const { results: pendingVersions } = await env.DB.prepare(
    "SELECT id, mod_id, version, files FROM mod_versions WHERE scan_status = 'pending'"
  ).all<{ id: number; mod_id: string; version: string; files: string }>();

  for (const row of pendingVersions) {
    const files: ModVersionFile[] = JSON.parse(row.files);
    const checksums = files.map((f) => f.checksum);
    if (!checksums.some((cs) => resolvedChecksums.includes(cs))) continue;

    const placeholders = checksums.map(() => "?").join(", ");
    const { results: scans } = await env.DB.prepare(`SELECT checksum, status FROM file_scans WHERE checksum IN (${placeholders})`)
      .bind(...checksums)
      .all<{ checksum: string; status: ScanStatus }>();
    const statuses = checksums.map((cs) => scans.find((s) => s.checksum === cs)?.status ?? "pending");

    const overall: ScanStatus = statuses.includes("flagged")
      ? "flagged"
      : statuses.includes("error")
        ? "error"
        : statuses.includes("pending")
          ? "pending"
          : "clean";
    if (overall === "pending") continue;

    await env.DB.prepare("UPDATE mod_versions SET scan_status = ? WHERE id = ?").bind(overall, row.id).run();

    if (overall === "flagged") {
      // Auto-filed exactly like a user-submitted report so it shows up in
      // the existing Admin → Reports queue — no parallel review UI needed.
      await env.DB.prepare("INSERT INTO reports (target_type, target_id, reason, created_at) VALUES ('mod', ?, ?, ?)")
        .bind(row.mod_id, `Automated: VirusTotal flagged a file in version '${row.version}'.`, new Date().toISOString())
        .run();
    }
  }
}

// The scheduled handler's entire job (see index.ts). Spends at most
// SCAN_BUDGET_PER_RUN VT calls: polls already-submitted analyses first
// (cheapest path to a resolved verdict), then spends whatever's left
// submitting not-yet-submitted files (hash lookup first, real upload only
// if VT doesn't already know the file).
export async function runScanCycle(env: Env): Promise<void> {
  if (!env.VIRUSTOTAL_API_KEY) return; // secret not configured yet — no-op, not an error

  let budget = SCAN_BUDGET_PER_RUN;
  const resolved: string[] = [];

  const { results: inFlight } = await env.DB.prepare(
    "SELECT checksum, vt_analysis_id FROM file_scans WHERE status = 'pending' AND vt_analysis_id IS NOT NULL LIMIT ?"
  )
    .bind(budget)
    .all<{ checksum: string; vt_analysis_id: string }>();

  for (const row of inFlight) {
    if (budget <= 0) break;
    budget--;
    try {
      const stats = await pollAnalysis(env, row.vt_analysis_id);
      if (!stats) continue; // still queued on VT's side — try again next minute
      await resolveFileScan(env, row.checksum, stats);
      resolved.push(row.checksum);
    } catch (err) {
      console.error(`scan poll failed for ${row.checksum}:`, err);
      await bumpAttempt(env, row.checksum);
    }
  }

  if (budget > 0) {
    const { results: unsubmitted } = await env.DB.prepare(
      "SELECT checksum, download_url FROM file_scans WHERE status = 'pending' AND vt_analysis_id IS NULL AND attempts < ? LIMIT ?"
    )
      .bind(MAX_ATTEMPTS, budget)
      .all<{ checksum: string; download_url: string }>();

    for (const row of unsubmitted) {
      if (budget <= 0) break;
      budget--;
      try {
        const known = await lookupExistingReport(env, row.checksum);
        if (known) {
          await resolveFileScan(env, row.checksum, known);
          resolved.push(row.checksum);
          continue;
        }
        if (budget <= 0) {
          // Knew about it now, but no budget left this cycle to actually
          // upload — leave vt_analysis_id unset so it's picked up as
          // "unsubmitted" again next run rather than double-counted here.
          continue;
        }
        budget--;
        const fileRes = await fetch(row.download_url);
        if (!fileRes.ok) throw new Error(`fetching ${row.download_url} failed: ${fileRes.status}`);
        const bytes = await fileRes.arrayBuffer();
        const analysisId = await submitForAnalysis(env, bytes, row.checksum);
        await env.DB.prepare("UPDATE file_scans SET vt_analysis_id = ?, submitted_at = ? WHERE checksum = ?")
          .bind(analysisId, new Date().toISOString(), row.checksum)
          .run();
      } catch (err) {
        console.error(`scan submit failed for ${row.checksum}:`, err);
        await bumpAttempt(env, row.checksum);
      }
    }
  }

  await recomputeVersionScanStatuses(env, resolved);
}
