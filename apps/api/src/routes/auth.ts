import { Hono } from "hono";
import type { Env } from "../env";
import { authenticate, hashToken } from "../auth";
import { hashPassword, verifyPassword } from "../passwords";
import { checkRateLimit, clientIp } from "../rateLimit";

export const auth = new Hono<{ Bindings: Env }>();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;
const MIN_PASSWORD_LENGTH = 8;
const SESSION_DAYS = 30;

function randomToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${prefix}_${b64url}`;
}

async function createSession(env: Env, modderId: string): Promise<string> {
  const token = randomToken("owmm_sess");
  const tokenHash = await hashToken(token, env.UPLOAD_API_KEY_SALT);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash, modder_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, modderId, new Date().toISOString(), expiresAt)
    .run();
  return token;
}

// POST /api/auth/signup — { username, password }. Creates the account and
// immediately logs it in (same as login would). No email is collected —
// this is the whole account, on purpose (see docs/architecture.md).
// 5 signups/hour/IP — generous for a real person, tight enough to make
// mass account creation tedious rather than free.
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_SECONDS = 60 * 60;

// 8 attempts/5min/IP — a real person mistyping a password a few times
// never hits this; a script guessing passwords does.
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_SECONDS = 5 * 60;

auth.post("/signup", async (c) => {
  const allowed = await checkRateLimit(c, "signup", clientIp(c), SIGNUP_LIMIT, SIGNUP_WINDOW_SECONDS);
  if (!allowed) return c.json({ error: "too many accounts created from this connection — try again later" }, 429);

  const body = await c.req.json<{ username?: string; password?: string }>().catch(() => null);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !USERNAME_RE.test(username)) {
    return c.json({ error: "username must be 3-24 characters: letters, numbers, _ or -" }, 400);
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM modders WHERE username = ?").bind(username).first();
  if (existing) return c.json({ error: "that username is taken" }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare("INSERT INTO modders (id, name, username, password_hash) VALUES (?, ?, ?, ?)")
    .bind(id, username, username, passwordHash)
    .run();

  const token = await createSession(c.env, id);
  return c.json({ token, username }, 201);
});

// POST /api/auth/login — { username, password }.
auth.post("/login", async (c) => {
  const allowed = await checkRateLimit(c, "login", clientIp(c), LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
  if (!allowed) return c.json({ error: "too many login attempts — wait a few minutes and try again" }, 429);

  const body = await c.req.json<{ username?: string; password?: string }>().catch(() => null);
  const username = body?.username?.trim();
  const password = body?.password;
  if (!username || typeof password !== "string") {
    return c.json({ error: "username and password are required" }, 400);
  }

  const row = await c.env.DB.prepare("SELECT id, password_hash FROM modders WHERE username = ?")
    .bind(username)
    .first<{ id: string; password_hash: string | null }>();

  // Same "incorrect username or password" message either way — don't leak
  // which one was wrong.
  if (!row || !row.password_hash || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: "incorrect username or password" }, 401);
  }

  const token = await createSession(c.env, row.id);
  return c.json({ token, username }, 200);
});

// POST /api/auth/logout — invalidates the session token that was used to
// call it. Best-effort: an already-invalid/missing token isn't an error,
// since the end state either way is "not logged in."
auth.post("/logout", async (c) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (token) {
    const tokenHash = await hashToken(token, c.env.UPLOAD_API_KEY_SALT);
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  return c.body(null, 204);
});

// GET /api/auth/me — resolves whatever's in the Authorization header
// (old-style API key or a session token, see auth.ts) to an identity, so
// the desktop app can show "logged in as X" without caching that state
// itself.
auth.get("/me", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);
  return c.json({ id: modder.id, username: modder.name });
});

// DELETE /api/auth/me — deletes the account (sessions cascade). Refuses
// while the account still owns mods rather than silently orphaning or
// cascading through GitHub releases — the My Mods tab already has
// delete-mod/delete-version actions for that.
auth.delete("/me", async (c) => {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);

  const owned = await c.env.DB.prepare("SELECT COUNT(*) as count FROM mods WHERE owner_id = ?")
    .bind(modder.id)
    .first<{ count: number }>();
  if (owned && owned.count > 0) {
    return c.json({ error: "delete or hand off your mods first (My Mods tab), then delete your account" }, 409);
  }

  await c.env.DB.prepare("DELETE FROM modders WHERE id = ?").bind(modder.id).run();
  return c.body(null, 204);
});
