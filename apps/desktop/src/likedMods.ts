// This install's own view of which mods it has liked — a write-through
// cache of server truth (mod_likes, keyed by reviewerId server-side) so
// Browse's cards can render the correct filled/outline heart without an
// extra request per card. Written whenever a like toggle actually succeeds
// (see api.ts's toggleLike) or ModDetail loads the real summary from the
// server, so it self-heals if it ever drifts.

const KEY = "owmm.likedModIds";

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(ids: Set<string>): void {
  localStorage.setItem(KEY, JSON.stringify([...ids]));
}

export function isLiked(modId: string): boolean {
  return readSet().has(modId);
}

export function setLiked(modId: string, liked: boolean): void {
  const ids = readSet();
  if (liked) ids.add(modId);
  else ids.delete(modId);
  writeSet(ids);
}
