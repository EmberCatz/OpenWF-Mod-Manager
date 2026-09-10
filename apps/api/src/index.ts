import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { mods } from "./routes/mods";
import { auth } from "./routes/auth";
import { reports } from "./routes/reports";
import { admin } from "./routes/admin";
import { authenticate } from "./auth";
import { clientIp } from "./rateLimit";
import { isIpBanned } from "./ipBan";
import { getSetting } from "./appSettings";

const app = new Hono<{ Bindings: Env }>();

// The Tauri app runs from a custom scheme (tauri://localhost) in production
// and http://localhost:<port> in dev — allow both broadly since this API
// has no cookie-based session to protect (auth is a bearer API key).
app.use("*", cors());

// Admin "oh shit" gate — checked ahead of every route. An IP ban blocks
// that address outright; maintenance mode blocks everything else for
// non-admins. Both are skipped for an authenticated admin caller so an
// admin can never lock themselves out. /api/auth/* and /api/admin/* stay
// reachable during maintenance specifically so an admin can still log in
// and flip it back off — those routes don't expose anything to a
// non-admin that maintenance mode is meant to hide.
app.use("*", async (c, next) => {
  const path = c.req.path;
  const caller = await authenticate(c).catch(() => null);
  if (caller?.isAdmin) return next();

  const ip = clientIp(c);
  if (await isIpBanned(c.env, ip)) {
    return c.json({ error: "ip_banned", message: "Access from this network has been blocked." }, 403);
  }

  if (!path.startsWith("/api/auth/") && !path.startsWith("/api/admin/")) {
    if (await getSetting(c.env, "maintenance_mode")) {
      return c.json(
        { error: "maintenance_mode", message: "OpenWF Mod Manager is temporarily offline for maintenance. Please check back soon." },
        503
      );
    }
  }

  return next();
});

app.get("/", (c) => c.json({ name: "openwf-mod-manager-api", status: "ok" }));

app.route("/api/mods", mods);
app.route("/api/auth", auth);
app.route("/api/reports", reports);
app.route("/api/admin", admin);

// Without this, an uncaught exception (e.g. the GitHub API call in
// src/github.ts failing/rate-limiting) falls through to a plain-text
// "Internal Server Error" instead of JSON — which crashes any client
// that unconditionally does res.json() on the response, turning a
// readable server error into a confusing JSON-parse error instead.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "internal error" }, 500);
});

export default app;
