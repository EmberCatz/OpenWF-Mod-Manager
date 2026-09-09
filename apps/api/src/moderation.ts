import type { Env } from "./env";

// Records one row in moderation_actions — an audit trail for admin actions
// (routes/admin.ts and the admin-bypass paths in routes/mods.ts). Fire-and-forget
// is not appropriate here (unlike download counts): callers should await this
// so a failure surfaces rather than silently losing the audit entry.
export async function logModerationAction(
  env: Env,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: string
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO moderation_actions (admin_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(adminId, action, targetType, targetId, details ?? null, new Date().toISOString())
    .run();
}
