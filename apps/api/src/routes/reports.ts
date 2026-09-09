import { Hono } from "hono";
import type { Env } from "../env";
import { checkRateLimit, clientIp } from "../rateLimit";

export const reports = new Hono<{ Bindings: Env }>();

const MAX_REASON_LENGTH = 500;
// 5/hour/IP — a real report is a rare, deliberate action; this just stops
// someone flooding the mailbox.
const REPORT_LIMIT = 5;
const REPORT_WINDOW_SECONDS = 60 * 60;

// POST /api/reports — { targetType: "mod" | "comment", targetId, reason }.
// No auth (anyone should be able to flag something), no review queue
// either — this is intentionally just a mailbox the operator checks
// directly (see apps/api/package.json's "reports:list" script), not a
// full moderation workflow. See schema.sql's reports table.
reports.post("/", async (c) => {
  const allowed = await checkRateLimit(c, "report", clientIp(c), REPORT_LIMIT, REPORT_WINDOW_SECONDS);
  if (!allowed) return c.json({ error: "too many reports from this connection — wait a bit and try again" }, 429);

  const body = await c.req.json<{ targetType?: string; targetId?: string; reason?: string }>().catch(() => null);
  const targetType = body?.targetType;
  const targetId = body?.targetId?.trim();
  const reason = body?.reason?.trim();

  if (targetType !== "mod" && targetType !== "comment") {
    return c.json({ error: "targetType must be 'mod' or 'comment'" }, 400);
  }
  if (!targetId) {
    return c.json({ error: "targetId is required" }, 400);
  }
  if (!reason || reason.length > MAX_REASON_LENGTH) {
    return c.json({ error: `reason must be 1-${MAX_REASON_LENGTH} characters` }, 400);
  }

  const exists =
    targetType === "mod"
      ? await c.env.DB.prepare("SELECT id FROM mods WHERE id = ?").bind(targetId).first()
      : await c.env.DB.prepare("SELECT id FROM comments WHERE id = ?").bind(targetId).first();
  if (!exists) return c.json({ error: `${targetType} not found` }, 404);

  await c.env.DB.prepare("INSERT INTO reports (target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?)")
    .bind(targetType, targetId, reason, new Date().toISOString())
    .run();

  return c.json({ ok: true }, 201);
});
