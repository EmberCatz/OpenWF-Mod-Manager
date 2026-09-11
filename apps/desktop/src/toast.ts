// App-wide toast notifications — a plain module-level pub/sub instead of
// React context, so any file (component or not) can call toast.error(...)
// without needing to be inside a provider tree. Rendered by ToastHost,
// mounted once in App.tsx, as a bottom-left stack.
export type ToastKind = "error" | "success" | "info";
export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  // Skips the auto-expiry timeout below — for longer-lived system notices
  // (maintenance windows, "uploads disabled", etc.) that should stay put
  // until the user dismisses them, rather than a normal action-result toast.
  sticky?: boolean;
}

export interface ToastOptions {
  sticky?: boolean;
  duration?: number; // ms — ignored when sticky is true
}

const DEFAULT_DURATION_MS = 5000;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  listeners.forEach((listener) => listener(items));
}

function push(kind: ToastKind, message: string, opts: ToastOptions = {}): number {
  const id = nextId++;
  items = [...items, { id, kind, message, sticky: opts.sticky }];
  emit();
  if (!opts.sticky) {
    setTimeout(() => dismissToast(id), opts.duration ?? DEFAULT_DURATION_MS);
  }
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener: (items: ToastItem[]) => void): () => void {
  listeners.add(listener);
  listener(items);
  return () => listeners.delete(listener);
}

export const toast = {
  error: (message: string, opts?: ToastOptions) => push("error", message, opts),
  success: (message: string, opts?: ToastOptions) => push("success", message, opts),
  info: (message: string, opts?: ToastOptions) => push("info", message, opts),
};
