import { Hono } from "hono";
import type { Env } from "../env";
import type { ModderProfile } from "@openwf-mod-manager/shared";
import { AGGREGATE_COLUMNS, LATEST_VERSION_JOIN_COLUMNS, rowToModWithLatestVersion } from "./mods";

export const modders = new Hono<{ Bindings: Env }>();

// GET /api/modders/:id — a creator's public profile: display name, avatar,
// and every mod they own. No auth required to read (same openness as
// GET /api/mods) — this is the page a mod-card or comment author link
// opens to (see components/AuthorLink.tsx). :id is the modder's own uuid,
// not their display name — display names aren't guaranteed unique for
// legacy API-key accounts (no UNIQUE constraint on modders.name, only on
// the separate self-service `username` column), so linking by name would
// risk sending someone to the wrong person's mods.
modders.get("/:id", async (c) => {
  const id = c.req.param("id");
  const modderRow = await c.env.DB.prepare("SELECT id, name, avatar_key, created_at FROM modders WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; avatar_key: string; created_at: string }>();
  if (!modderRow) return c.json({ error: "not found" }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT m.*, ${LATEST_VERSION_JOIN_COLUMNS},
     ${AGGREGATE_COLUMNS}
     FROM mods m
     LEFT JOIN mod_versions v ON v.mod_id = m.id
     WHERE m.owner_id = ?
       AND (v.id = (SELECT id FROM mod_versions WHERE mod_id = m.id ORDER BY created_at DESC LIMIT 1) OR v.id IS NULL)
     ORDER BY m.updated_at DESC`
  )
    .bind(id)
    .all();

  const profile: ModderProfile = {
    id: modderRow.id,
    name: modderRow.name,
    avatarKey: modderRow.avatar_key,
    createdAt: modderRow.created_at,
    mods: results.map(rowToModWithLatestVersion),
  };
  return c.json(profile);
});
