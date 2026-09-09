import type { Context } from "hono";
import type { Env } from "./env";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface Modder {
  id: string;
  name: string;
}

// Looks up the modder behind the Authorization: Bearer <api-key> header.
// Returns null if the header is missing/malformed or the key doesn't match
// any modder in D1 — callers should respond 401 in that case.
export async function authenticate(c: Context<{ Bindings: Env }>): Promise<Modder | null> {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const apiKey = header.slice("Bearer ".length).trim();
  if (!apiKey) return null;

  const hash = await sha256Hex(apiKey + c.env.UPLOAD_API_KEY_SALT);
  const row = await c.env.DB.prepare("SELECT id, name FROM modders WHERE api_key_hash = ?")
    .bind(hash)
    .first<Modder>();

  return row ?? null;
}

// Used only by the (out-of-band) modder-onboarding script, not by any HTTP
// route — new API keys are issued manually via `wrangler d1 execute`, not
// self-service, to keep the upload endpoint from being an open abuse target.
export async function hashApiKey(apiKey: string, salt: string): Promise<string> {
  return sha256Hex(apiKey + salt);
}
