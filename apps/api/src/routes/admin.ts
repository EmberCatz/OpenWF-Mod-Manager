import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../env";
import { authenticate, type Modder } from "../auth";
import { logModerationAction } from "../moderation";

export const admin = new Hono<{ Bindings: Env }>();

const MAX_USERS_LISTED = 500;
const MAX_REPORTS_LISTED = 200;

// Every route in this file needs the same "logged in AND is_admin" check —
// unlike the mod-delete owner-check in routes/mods.ts (which differs
// slightly per route), this exact check repeats verbatim ~7 times here, so
// it's worth extracting.
async function requireAdmin(c: Context<{ Bindings: Env }>): Promise<Modder | Response> {
  const modder = await authenticate(c);
  if (!modder) return c.json({ error: "unauthorized" }, 401);
  if (!modder.isAdmin) return c.json({ error: "forbidden — admin only" }, 403);
  return modder;
}

// GET /api/admin/users — every account, with mod ownership count.
admin.get("/users", async (c) => {
  const modder = await requireAdmin(c);
  if (modder instanceof Response) return modder;

  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.username, m.name, m.created_at, m.is_admin, m.is_banned,
            (SELECT COUNT(*) FROM mods WHERE owner_id = m.id) as mod_count
     FROM modders m
     ORDER BY m.created_at DESC
     LIMIT ?`
  )
    .bind(MAX_USERS_LISTED)
    .all<{
      id: string;
      username: string | null;
      name: string;
      created_at: string;
      is_admin: number;
      is_banned: number;
      mod_count: number;
    }>();

  return c.json(
    results.map((r) => ({
      id: r.id,
      username: r.username ?? r.name,
      createdAt: r.created_at,
      isAdmin: !!r.is_admin,
      isBanned: !!r.is_banned,
      modCount: r.mod_count,
    }))
  );
});

// POST /api/admin/users/:id/ban — suspends the account: is_banned = 1 (so
// authenticate() rejects it immediately everywhere, see auth.ts) and drops
// every outstanding session as a belt-and-suspenders measure. Doesn't touch
// their mods/comments — banning is about access, not content; delete those
// separately if that's also warranted.
admin.post("/users/:id/ban", async (c) => {
  const modder = await requireAdmin(c);
  if (modder instanceof Response) return modder;

  const targetId = c.req.param("id");
  if (targetId === modder.id) return c.json({ error: "you can't ban yourself" }, 400);

  const target = await c.env.DB.prepare("SELECT id FROM modders WHERE id = ?").bind(targetId).first();
  if (!target) return c.json({ error: "not found" }, 404);

  await c.env.DB.prepare("UPDATE modders SET is_banned = 1 WHERE id = ?").bind(targetId).run();
  await c.env.DB.prepare("DELETE FROM sessions WHERE modder_id = ?").bind(targetId).run();
  await logModerationAction(c.env, modder.id, "ban_user", "user", targetId);

  return c.body(null, 204);
});

// POST /api/admin/users/:id/unban
admin.post("/users/:id/unban", async (c) => {
  const modder = await requireAdmin(c);
  if (modder instanceof Response) return modder;

  const targetId = c.req.param("id");
  const target = await c.env.DB.prepare("SELECT id FROM modders WHERE id = ?").bind(targetId).first();
  if (!target) return c.json({ error: "not found" }, 404);

  await c.env.DB.prepare("UPDATE modders SET is_banned = 0 WHERE id = ?").bind(targetId).run();
  await logModerationAction(c.env, modder.id, "unban_user", "user", targetId);

  return c.body(null, 204);
});

// DELETE /api/admin/users/:id — same "still owns mods" guard as the
// self-service DELETE /api/auth/me, so an admin can't accidentally
// cascade-delete someone's mods as a side effect — delete those first via
// the mod-delete routes (which admins can already do, see routes/mods.ts).
admin.delete("/users/:id", async (c) => {
  const modder = await requireAdmin(c);
  if (modder instanceof Response) return modder;

  const targetId = c.req.param("id");
  if (targetId === modder.id) return c.json({ error: "you can't delete your own account here — use Settings" }, 400);

  const target = await c.env.DB.prepare("SELECT id FROM modders WHERE id = ?").bind(targetId).first();
  if (!target) return c.json({ error: "not found" }, 404);

  const owned = await c.env.DB.prepare("SELECT COUNT(*) as count FROM mods WHERE owner_id = ?")
    .bind(targetId)
    .first<{ count: number }>();
  if (owned && owned.count > 0) {
    return c.json({ error: "this account still owns mods — delete those first" }, 409);
  }

  // moderation_actions.admin_id is declared ON DELETE SET NULL, but that
  // action isn't reliably applied by D1 in practice (verified empirically
  // while testing this route) — done explicitly here instead so the audit
  // trail survives the deleted account instead of leaving a dangling
  // admin_id. Matters if the target being deleted is itself an admin who's
  // logged actions before.
  await c.env.DB.prepare("UPDATE moderation_actions SET admin_id = NULL WHERE admin_id = ?").bind(targetId).run();
  await c.env.DB.prepare("DELETE FROM modders WHERE id = ?").bind(targetId).run();
  await logModerationAction(c.env, modder.id, "delete_user", "user", targetId);

  return c.body(null, 204);
});

// GET /api/admin/reports?status=open — defaults to open reports; pass
// status=resolved / status=dismissed / status=all for the rest.
admin.get("/reports", async (c) => {
  const modder = await requireAdmin(c);
  if (modder instanceof Response) return modder;

  const status = c.req.query("status") ?? "open";
  const query =
    status === "all"
      ? c.env.DB.prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT ?").bind(MAX_REPORTS_LISTED)
      : c.env.DB.prepare("SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT ?").bind(
          status,
          MAX_REPORTS_LISTED
        );

  const { results } = await query.all<{
    id: number;
    target_type: string;
    target_id: string;
    reason: string;
    status: string;
    created_at: string;
  }>();

  return c.json(
    results.map((r) => ({
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
    }))
  );
});

async function setReportStatus(c: Context<{ Bindings: Env }>, status: "resolved" | "dismissed") {
  const modder = await requireAdmin(c);
  if (modder instanceof Response) return modder;

  const reportId = c.req.param("id")!;
  const result = await c.env.DB.prepare("UPDATE reports SET status = ? WHERE id = ? RETURNING id")
    .bind(status, reportId)
    .first();
  if (!result) return c.json({ error: "not found" }, 404);

  await logModerationAction(c.env, modder.id, status === "resolved" ? "resolve_report" : "dismiss_report", "report", reportId);
  return c.body(null, 204);
}

admin.post("/reports/:id/resolve", (c) => setReportStatus(c, "resolved"));
admin.post("/reports/:id/dismiss", (c) => setReportStatus(c, "dismissed"));
