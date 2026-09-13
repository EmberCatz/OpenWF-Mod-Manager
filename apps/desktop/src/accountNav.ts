// Cross-cutting "open account settings" navigation — same module-level
// pub/sub idea as profileNav.ts, plus a one-shot flag for the case
// profileNav.ts doesn't have to handle: Settings remounts fresh on every
// tab switch (App.tsx keys the active view by tab id), so a click that
// switches *into* the Settings tab fires before Settings exists to
// subscribe. openAccountSettings() notifies a live listener if Settings is
// already mounted (e.g. the user's already on Settings, on some other
// section) and otherwise leaves a flag for the mount that's about to
// happen to pick up as its initial section.
let listener: (() => void) | null = null;
let pendingAccountSection = false;

export function subscribeAccountNav(fn: () => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function openAccountSettings(): void {
  if (listener) {
    listener();
  } else {
    pendingAccountSection = true;
  }
}

// A non-mutating read, deliberately split from clearAccountSettingsRequest
// below — React's StrictMode dev double-invokes useState lazy initializers
// to catch impure ones, and a mutating "consume" called from inside one
// loses the flag on the (discarded) second invocation, which is exactly
// the bug this used to have: the account section only "stuck" on a second
// click, once effects (not double-invoked the same way) had already fired.
export function peekAccountSettingsRequest(): boolean {
  return pendingAccountSection;
}

export function clearAccountSettingsRequest(): void {
  pendingAccountSection = false;
}
