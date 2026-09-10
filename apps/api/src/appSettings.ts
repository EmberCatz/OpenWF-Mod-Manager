import type { Env } from "./env";

// Backs the admin kill-switches (routes/admin.ts's /settings routes) and
// the maintenance-mode gate in index.ts. Stored as key/value rows
// (app_settings, schema.sql) rather than fixed columns so a new switch
// never needs a schema change.
export type SettingKey = "maintenance_mode" | "uploads_disabled" | "signups_disabled" | "comments_disabled";

export const SETTING_KEYS: SettingKey[] = ["maintenance_mode", "uploads_disabled", "signups_disabled", "comments_disabled"];

export interface SiteSettings {
  maintenanceMode: boolean;
  uploadsDisabled: boolean;
  signupsDisabled: boolean;
  commentsDisabled: boolean;
}

// Maps each DB key to its camelCase field on SiteSettings — also doubles as
// the accepted field list for PATCH /api/admin/settings.
export const SETTING_KEY_TO_FIELD: Record<SettingKey, keyof SiteSettings> = {
  maintenance_mode: "maintenanceMode",
  uploads_disabled: "uploadsDisabled",
  signups_disabled: "signupsDisabled",
  comments_disabled: "commentsDisabled",
};

export async function getSetting(env: Env, key: SettingKey): Promise<boolean> {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value === "1";
}

export async function getSiteSettings(env: Env): Promise<SiteSettings> {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM app_settings WHERE key IN (${SETTING_KEYS.map(() => "?").join(", ")})`
  )
    .bind(...SETTING_KEYS)
    .all<{ key: SettingKey; value: string }>();

  const settings: SiteSettings = {
    maintenanceMode: false,
    uploadsDisabled: false,
    signupsDisabled: false,
    commentsDisabled: false,
  };
  for (const row of results) {
    settings[SETTING_KEY_TO_FIELD[row.key]] = row.value === "1";
  }
  return settings;
}

export async function setSetting(env: Env, key: SettingKey, value: boolean, adminId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  )
    .bind(key, value ? "1" : "0", adminId)
    .run();
}
