import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { mods } from "./routes/mods";
import { auth } from "./routes/auth";
import { reports } from "./routes/reports";
import { admin } from "./routes/admin";

const app = new Hono<{ Bindings: Env }>();

// The Tauri app runs from a custom scheme (tauri://localhost) in production
// and http://localhost:<port> in dev — allow both broadly since this API
// has no cookie-based session to protect (auth is a bearer API key).
app.use("*", cors());

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
