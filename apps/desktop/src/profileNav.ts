// Cross-cutting "open this creator's profile" navigation — a plain
// module-level pub/sub (same pattern as toast.ts) so a username link deep
// inside Browse/ModDetail/CommentSection can jump to the Profile view
// without threading an onOpenProfile callback down through every layer in
// between. App.tsx subscribes and swaps in <Profile> for the active tab
// while a profile is open.
let listener: ((accountId: string | null) => void) | null = null;

export function subscribeProfileNav(fn: (accountId: string | null) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function openProfile(accountId: string): void {
  listener?.(accountId);
}

export function closeProfile(): void {
  listener?.(null);
}
