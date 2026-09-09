import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { mods } from "./routes/mods";

const app = new Hono<{ Bindings: Env }>();

// The Tauri app runs from a custom scheme (tauri://localhost) in production
// and http://localhost:<port> in dev — allow both broadly since this API
// has no cookie-based session to protect (auth is a bearer API key).
app.use("*", cors());

app.get("/", (c) => c.json({ name: "openwf-mod-manager-api", status: "ok" }));

app.route("/api/mods", mods);

export default app;
