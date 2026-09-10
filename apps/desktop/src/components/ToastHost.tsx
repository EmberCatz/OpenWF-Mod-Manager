import { useEffect, useState } from "react";
import { dismissToast, subscribeToasts, type ToastItem } from "../toast";

// Fixed bottom-right stack, mounted once in App.tsx. Click a toast to
// dismiss it early; otherwise it clears itself after a few seconds.
export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className="toast-host">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind} fade-in`} onClick={() => dismissToast(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
