import type { Context } from "hono";
import type { Env } from "./env";

// Hobby-scale rate limiting backed by D1 (rate_limit_hits table), not
// Cloudflare's dashboard-level Rate Limiting Rules — those are a zone/WAF
// product and don't apply to a bare workers.dev subdomain without a
// custom domain in front of it. This won't hold up against a real
// distributed attack, but this project's actual threat model is "a bored
// person with a script," not a botnet — see docs/architecture.md
// § Security & billing-risk notes.

// CF-Connecting-IP is set by Cloudflare at the edge and can't be spoofed
// by the client (unlike X-Forwarded-For, which the client can send
// whatever it wants for) — the right header to key anonymous limits on.
export function clientIp(c: Context<{ Bindings: Env }>): string {
  return c.req.header("CF-Connecting-IP") ?? "unknown";
}

// Returns true if the call is allowed (and records it), false if `key` has
// already hit `limit` attempts for `bucket` within the last `windowSeconds`.
export async function checkRateLimit(
  c: Context<{ Bindings: Env }>,
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM rate_limit_hits WHERE bucket = ? AND key = ? AND created_at > ?"
  )
    .bind(bucket, key, cutoff)
    .first<{ count: number }>();

  if ((row?.count ?? 0) >= limit) return false;

  await c.env.DB.prepare("INSERT INTO rate_limit_hits (bucket, key, created_at) VALUES (?, ?, ?)")
    .bind(bucket, key, new Date().toISOString())
    .run();

  // Opportunistic cleanup so the table doesn't grow forever, without
  // needing a separate cron trigger — cheap, and only runs occasionally.
  if (Math.random() < 0.02) {
    const pruneCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await c.env.DB.prepare("DELETE FROM rate_limit_hits WHERE created_at < ?").bind(pruneCutoff).run();
  }

  return true;
}
