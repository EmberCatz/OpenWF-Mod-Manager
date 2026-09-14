import { toast } from "./toast";

// ErrorBoundary only catches render-time throws — a rejected promise never
// hits it (a failed invoke() call, the API being down) and previously just
// vanished into the devtools console, invisible in a packaged build no one
// is watching. This is the equivalent net for those: one global listener,
// installed once from main.tsx before the app renders, that turns an
// otherwise-silent failure into a visible toast instead of nothing at all.
function describeReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

export function installUnhandledRejectionHandler() {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
    toast.error(`Unexpected error: ${describeReason(event.reason)}`, { sticky: true });
  });
}
