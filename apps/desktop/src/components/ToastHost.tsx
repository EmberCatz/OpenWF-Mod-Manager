import { useEffect, useRef, useState } from "react";
import { dismissToast, subscribeToasts, type ToastItem } from "../toast";

// Matches .toast--leaving's animation-duration in styles.css — kept local
// to this file since it's an implementation detail of the exit animation
// below, not something toast.ts or its callers need to know about.
const EXIT_MS = 200;

type DisplayItem = ToastItem & { leaving?: boolean };

// Fixed bottom-left stack, mounted once in App.tsx. New toasts push in
// nearest the corner and shove existing ones up (.toast-host below).
// Dismissal (click, close button, or auto-expiry in toast.ts) plays a
// shrink-and-fade exit instead of vanishing instantly — this component
// keeps a toast around for one extra animation frame after it's already
// gone from the shared toast.ts store, purely so that animation has
// something to play on.
export default function ToastHost() {
  const [displayed, setDisplayed] = useState<DisplayItem[]>([]);
  const displayedRef = useRef<DisplayItem[]>([]);
  displayedRef.current = displayed;

  useEffect(
    () =>
      subscribeToasts((items) => {
        const current = displayedRef.current;
        const incomingIds = new Set(items.map((i) => i.id));
        const existingIds = new Set(current.map((d) => d.id));

        const next: DisplayItem[] = current
          .filter((d) => incomingIds.has(d.id) || d.leaving)
          .map((d) => (incomingIds.has(d.id) ? d : { ...d, leaving: true }));

        current
          .filter((d) => !incomingIds.has(d.id) && !d.leaving)
          .forEach((d) => {
            setTimeout(() => {
              setDisplayed((s) => s.filter((x) => x.id !== d.id));
            }, EXIT_MS);
          });

        setDisplayed([...next, ...items.filter((i) => !existingIds.has(i.id))]);
      }),
    []
  );

  if (displayed.length === 0) return null;

  return (
    <div className="toast-host">
      {displayed.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.kind} ${t.leaving ? "toast--leaving" : ""}`}
          onClick={() => !t.leaving && dismissToast(t.id)}
        >
          <span className="toast__message">{t.message}</span>
          <button
            className="toast__close"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(t.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
