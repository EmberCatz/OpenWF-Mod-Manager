export interface Env {
  DB: D1Database;
  GITHUB_OWNER: string; // repo owner/org that hosts release assets
  GITHUB_REPO: string; // repo name that hosts release assets
  GITHUB_TOKEN: string; // PAT with "contents: write" on that repo — used server-side only, never exposed to clients
  UPLOAD_API_KEY_SALT: string;
  // Edge-level burst guard (Workers' native Rate Limiting binding, see
  // rateLimit.ts § checkEdgeRateLimit) — checked before the D1-backed
  // limiter on login/signup so a request flood is rejected at Cloudflare's
  // network edge instead of ever reaching D1.
  EDGE_RATE_LIMITER: RateLimit;
}
