export interface Env {
  DB: D1Database;
  GITHUB_OWNER: string; // repo owner/org that hosts release assets
  GITHUB_REPO: string; // repo name that hosts release assets
  GITHUB_TOKEN: string; // PAT with "contents: write" on that repo — used server-side only, never exposed to clients
  UPLOAD_API_KEY_SALT: string;
}
