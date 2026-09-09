// Local-only app settings (install folders, API key), persisted in this
// Tauri window's own webview storage — never sent anywhere, and separate
// per machine/install by design.

const KEYS = {
  metadataPatchesPath: "owmm.metadataPatchesPath",
  scriptsPath: "owmm.scriptsPath",
  apiKey: "owmm.apiKey",
} as const;

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

export function getApiKey(): string | null {
  return localStorage.getItem(KEYS.apiKey);
}

export function setApiKey(key: string): void {
  localStorage.setItem(KEYS.apiKey, key);
}
