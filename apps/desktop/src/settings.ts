// Local-only app settings (install folders, etc.), persisted in this
// Tauri window's own webview storage — never sent anywhere, and separate
// per machine/install by design. The one exception is the API key/session
// token, which is sensitive enough to warrant the OS keychain instead of
// localStorage (see native.ts / src-tauri/src/commands.rs) — its getters
// and setters below are async for that reason, unlike everything else here.

import { clearApiKeyNative, getApiKeyNative, setApiKeyNative } from "./native";

const KEYS = {
  metadataPatchesPath: "owmm.metadataPatchesPath",
  scriptsPath: "owmm.scriptsPath",
  commenterName: "owmm.commenterName",
  bootstrapperPort: "owmm.bootstrapperPort",
  webuiPort: "owmm.webuiPort",
  liveSettingsTabEnabled: "owmm.liveSettingsTabEnabled",
  splitViewEnabled: "owmm.splitViewEnabled",
  liveWideModeEnabled: "owmm.liveWideModeEnabled",
} as const;

// The OpenWF Bootstrapper's own HTTP interface (client_http_port in
// OpenWF/Client Config.json) — defaults to 6155, but is user-configurable
// there, so the Live Settings tab (views/LiveSettings.tsx) needs to know
// which port to point its iframe at.
export const DEFAULT_BOOTSTRAPPER_PORT = 6155;

// A self-hosted SpaceNinjaServer's admin WebUI (see
// https://about.openwf.io/web-server-setup) — a different, unrelated tool
// from the Bootstrapper above, used by views/ServerWebUI.tsx.
export const DEFAULT_WEBUI_PORT = 80;

// Tiny pub/sub, same shape as toast.ts's — App.tsx needs to know when a tab
// visibility toggle changes so it can re-filter its tab list immediately,
// without a full app restart.
type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange(): void {
  listeners.forEach((l) => l());
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMetadataPatchesPath(): string | null {
  return localStorage.getItem(KEYS.metadataPatchesPath);
}

export function setMetadataPatchesPath(path: string): void {
  localStorage.setItem(KEYS.metadataPatchesPath, path);
}

export function getScriptsPath(): string | null {
  return localStorage.getItem(KEYS.scriptsPath);
}

export function setScriptsPath(path: string): void {
  localStorage.setItem(KEYS.scriptsPath, path);
}

export async function getApiKey(): Promise<string | null> {
  return getApiKeyNative();
}

export async function setApiKey(key: string): Promise<void> {
  await setApiKeyNative(key);
}

export async function clearApiKey(): Promise<void> {
  await clearApiKeyNative();
}

export function getBootstrapperPort(): number {
  const raw = localStorage.getItem(KEYS.bootstrapperPort);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_BOOTSTRAPPER_PORT;
}

export function setBootstrapperPort(port: number): void {
  localStorage.setItem(KEYS.bootstrapperPort, String(port));
}

export function getWebuiPort(): number {
  const raw = localStorage.getItem(KEYS.webuiPort);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WEBUI_PORT;
}

export function setWebuiPort(port: number): void {
  localStorage.setItem(KEYS.webuiPort, String(port));
}

// Defaults to visible (shown unless a player opts out), so a missing key
// means "on" rather than "off".
export function isLiveSettingsTabEnabled(): boolean {
  return localStorage.getItem(KEYS.liveSettingsTabEnabled) !== "0";
}

export function setLiveSettingsTabEnabled(enabled: boolean): void {
  localStorage.setItem(KEYS.liveSettingsTabEnabled, enabled ? "1" : "0");
  emitChange();
}

// Whether Live Settings shows Client WebUI and Server WebUI as one
// side-by-side split view instead of two separate sub-tabs. Opt-in
// (missing key means "off"), unlike the tab-visibility toggle above.
export function isSplitViewEnabled(): boolean {
  return localStorage.getItem(KEYS.splitViewEnabled) === "1";
}

export function setSplitViewEnabled(enabled: boolean): void {
  localStorage.setItem(KEYS.splitViewEnabled, enabled ? "1" : "0");
  emitChange();
}

// Whether Live Settings' WebUI panel(s) — single or split — break out of
// the app's normal max-width column and stretch to the full window width.
// Opt-in, same as split view.
export function isLiveWideModeEnabled(): boolean {
  return localStorage.getItem(KEYS.liveWideModeEnabled) === "1";
}

export function setLiveWideModeEnabled(enabled: boolean): void {
  localStorage.setItem(KEYS.liveWideModeEnabled, enabled ? "1" : "0");
  emitChange();
}

// Remembered so the comment form doesn't ask for a name every time —
// still just free text, not a verified identity.
export function getCommenterName(): string {
  return localStorage.getItem(KEYS.commenterName) ?? "";
}

export function setCommenterName(name: string): void {
  localStorage.setItem(KEYS.commenterName, name);
}
