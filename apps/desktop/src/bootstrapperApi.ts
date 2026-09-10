import { getBootstrapperPort } from "./settings";

// Thin wrapper around the OpenWF Bootstrapper's developer HTTP routes (see
// docs/openwf-bootstrapper-manual.md § 2 "Available routes (for
// developers)") — used by BootstrapperDevTools. Goes through the Tauri
// HTTP plugin rather than the webview's fetch: the Bootstrapper doesn't
// send CORS headers, and unlike LiveIframePanel's reachability check we
// actually need to read the response body here.

export interface BootstrapperResult {
  ok: boolean;
  status: number;
  body: string;
}

function baseUrl(): string {
  return `http://localhost:${getBootstrapperPort()}`;
}

// `path` starts with "/", e.g. "/ping". `query`, when given, is appended
// after "?" completely as-is — the manual's own examples pass a bare value
// there (a StoreItem path, a script name), not "key=value" pairs, and none
// of it is URL-encoded so a literal internal path like
// "/Lotus/Upgrades/Mods/Warframe/AvatarHealthMaxMod" round-trips exactly as
// documented.
export async function bootstrapperRequest(path: string, query?: string): Promise<BootstrapperResult> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const url = query !== undefined ? `${baseUrl()}${path}?${query}` : `${baseUrl()}${path}`;
  const res = await tauriFetch(url, { method: "GET" });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
