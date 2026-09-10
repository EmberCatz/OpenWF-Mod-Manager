// App-wide toast notifications — a plain module-level pub/sub instead of
// React context, so any file (component or not) can call toast.error(...)
// without needing to be inside a provider tree. Rendered by ToastHost,
// mounted once in App.tsx.
export type ToastKind = "error" | "success" | "info";
export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const DURATION_MS = 5000;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  listeners.forEach((listener) => listener(items));
}

function push(kind: ToastKind, message: string) {
  const id = nextId++;
  items = [...items, { id, kind, message }];
  emit();
  setTimeout(() => dismissToast(id), DURATION_MS);
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
  error: (message: string) => push("error", message),
  success: (message: string) => push("success", message),
  info: (message: string) => push("info", message),
};
