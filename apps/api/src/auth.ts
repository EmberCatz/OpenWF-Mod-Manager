import type { Context } from "hono";
import type { Env } from "./env";

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Same hashing used for both old-style API keys and new session tokens —
// UPLOAD_API_KEY_SALT acts as a pepper either way, see hashApiKey below.
export async function hashToken(token: string, salt: string): Promise<string> {
  return sha256Hex(token + salt);
}

export interface Modder {
  id: string;
  name: string;
  isAdmin: boolean;
}

type ModderRow = { id: string; name: string; is_admin: number; is_banned: number };

function toModder(row: ModderRow): Modder {
  return { id: row.id, name: row.name, isAdmin: !!row.is_admin };
}

// Looks up the modder behind the Authorization: Bearer <token> header.
// The token can be either an out-of-band-issued API key (modders.api_key_hash)
// or a session token from username+password login (sessions.token_hash,
// routes/auth.ts) — both resolve to the same Modder shape, so every other
// route stays oblivious to which one was used. Returns null if the header
// is missing/malformed, nothing matches, or the account is banned — a
// banned account should look logged-out everywhere immediately, not just
// at login, regardless of which outstanding token/key it uses.
export async function authenticate(c: Context<{ Bindings: Env }>): Promise<Modder | null> {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const hash = await hashToken(token, c.env.UPLOAD_API_KEY_SALT);

  const byApiKey = await c.env.DB.prepare("SELECT id, name, is_admin, is_banned FROM modders WHERE api_key_hash = ?")
    .bind(hash)
    .first<ModderRow>();
  if (byApiKey) return byApiKey.is_banned ? null : toModder(byApiKey);

  const bySession = await c.env.DB.prepare(
    `SELECT m.id, m.name, m.is_admin, m.is_banned FROM sessions s
     JOIN modders m ON m.id = s.modder_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
  )
    .bind(hash)
    .first<ModderRow>();

  if (!bySession || bySession.is_banned) return null;
  return toModder(bySession);
}

// Used only by the (out-of-band) modder-onboarding script, not by any HTTP
// route — this style of key is still supported (see authenticate() above)
// but new accounts should go through routes/auth.ts's self-service signup.
export async function hashApiKey(apiKey: string, salt: string): Promise<string> {
  return sha256Hex(apiKey + salt);
}
