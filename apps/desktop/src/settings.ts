// Local-only app settings (install folder, API key), persisted in this
// Tauri window's own webview storage — never sent anywhere, and separate
// per machine/install by design.

const KEYS = {
  installRoot: "owmm.installRoot",
  apiKey: "owmm.apiKey",
} as const;

export function getInstallRoot(): string | null {
  return localStorage.getItem(KEYS.installRoot);
}

export function setInstallRoot(path: string): void {
  localStorage.setItem(KEYS.installRoot, path);
}

export function getApiKey(): string | null {
  return localStorage.getItem(KEYS.apiKey);
}

export function setApiKey(key: string): void {
  localStorage.setItem(KEYS.apiKey, key);
}
