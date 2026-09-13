// Mirrors the server-side check in apps/api/src/routes/mods.ts — thumbnails
// and screenshots are restricted to Imgur since this app never hosts image
// bytes itself, so an arbitrary host is an unaudited hotlink surface.
export function isImgurUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "imgur.com" || u.hostname.endsWith(".imgur.com");
  } catch {
    return false;
  }
}
