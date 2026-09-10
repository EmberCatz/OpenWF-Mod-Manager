import type { Env } from "./env";

// "unknown" is clientIp()'s fallback when CF-Connecting-IP is missing (see
// rateLimit.ts) — never treat that literal string as a bannable address.
export async function isIpBanned(env: Env, ip: string): Promise<boolean> {
  if (ip === "unknown") return false;
  const row = await env.DB.prepare("SELECT ip FROM banned_ips WHERE ip = ?").bind(ip).first();
  return !!row;
}
