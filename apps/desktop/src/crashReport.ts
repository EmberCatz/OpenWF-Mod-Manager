import { version as appVersion } from "../package.json";

// Deliberately EmberCatz/OpenWF-Mod-Manager (the app repo), not
// EmberCatz/OpenWF-Mods (the mod-hosting repo referenced in
// apps/api/wrangler.toml) — same split Settings.tsx's "Report it on
// GitHub Issues" link already uses.
const ISSUE_REPO = "EmberCatz/OpenWF-Mod-Manager";

// GitHub's issue-form prefill URL has a practical length ceiling (very
// long query strings 404/414 instead of prefilling) — component/JS stacks
// can run to thousands of characters, so keep each field bounded rather
// than dumping the whole thing in.
const MAX_STACK_CHARS = 2000;

// navigator.userAgent is all we have without pulling in tauri-plugin-os
// for one string — Tauri's webview UA reliably contains the OS family
// (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS), which is
// enough for a bug report to know what platform to reproduce on.
function detectOs(): string {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return navigator.platform || "unknown OS";
}

export interface CrashDetails {
  message: string;
  stack?: string | null;
  // Short label distinguishing where this was caught (render crash vs.
  // unhandled promise rejection) so a triager doesn't have to guess.
  context: string;
}

// Builds a GitHub "new issue" URL pre-filled with everything needed to
// triage without the reporter having to type it themselves. No backend
// involved — the browser/webview does the submission when the user
// actually clicks through and hits "Submit new issue".
export function buildIssueUrl({ message, stack, context }: CrashDetails): string {
  const title = `Crash: ${message}`.slice(0, 200);
  const body = [
    `**Context:** ${context}`,
    `**App version:** ${appVersion}`,
    `**OS:** ${detectOs()}`,
    "",
    "**Error**",
    "```",
    message,
    "```",
    stack ? `\n**Stack**\n\`\`\`\n${stack.slice(0, MAX_STACK_CHARS)}\n\`\`\`` : null,
    "",
    "<!-- What were you doing when this happened? -->",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return `https://github.com/${ISSUE_REPO}/issues/new?${new URLSearchParams({ title, body, labels: "bug" })}`;
}
