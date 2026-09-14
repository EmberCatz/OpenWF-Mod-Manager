export interface Env {
  DB: D1Database;
  GITHUB_OWNER: string; // repo owner/org that hosts release assets
  GITHUB_REPO: string; // repo name that hosts release assets
  GITHUB_TOKEN: string; // PAT with "contents: write" on that repo — used server-side only, never exposed to clients
  UPLOAD_API_KEY_SALT: string;
  // Free-tier key (4 req/min, 500/day) — see src/scan.ts. Optional: if
  // unset, the scheduled scan cycle is a no-op rather than an error, so a
  // fresh deploy without this secret configured yet just leaves uploads
  // permanently 'pending' instead of crashing the cron.
  VIRUSTOTAL_API_KEY?: string;
  // Edge-level burst guard (Workers' native Rate Limiting binding, see
  // rateLimit.ts § checkEdgeRateLimit) — checked before the D1-backed
  // limiter on login/signup so a request flood is rejected at Cloudflare's
  // network edge instead of ever reaching D1.
  EDGE_RATE_LIMITER: RateLimit;
}
