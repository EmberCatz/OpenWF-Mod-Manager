import { useEffect, useRef, useState } from "react";

interface ThumbnailPreviewProps {
  url: string;
  position: string; // CSS object-position, e.g. "50% 50%"
  onPositionChange: (pos: string) => void;
}

// Live preview of a linked thumbnail image at the exact size it renders
// throughout the app, plus a load check (this app never re-hosts images —
// see docs/architecture.md — so a broken link only shows up once someone
// opens the mod otherwise). Since the image itself can't be cropped or
// re-uploaded, dragging inside the frame instead picks a focal point
// (object-position) so the uploader can still control what's visible
// inside the fixed frame.
export default function ThumbnailPreview({ url, position, onPositionChange }: ThumbnailPreviewProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!url.trim()) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const img = new Image();
    img.onload = () => setStatus("ok");
    img.onerror = () => setStatus("error");
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  function setPositionFromEvent(e: { clientX: number; clientY: number }) {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onPositionChange(`${x.toFixed(0)}% ${y.toFixed(0)}%`);
  }

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    setPositionFromEvent(e);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging.current) setPositionFromEvent(e);
  }

  function onPointerUp() {
    dragging.current = false;
  }

  if (!url.trim()) return null;

  return (
    <div className="thumbnail-preview">
      <div
        ref={frameRef}
        className="thumbnail-preview__frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {status === "ok" && (
          <img className="thumbnail-preview__img" src={url} alt="" style={{ objectPosition: position }} draggable={false} />
        )}
        {status !== "ok" && (
          <div className="thumbnail-preview__placeholder">
            {status === "loading" && <span><span className="spinner" /> Checking…</span>}
            {status === "error" && <span>Couldn't load this image</span>}
          </div>
        )}
      </div>
      <p className="hint">
        {status === "ok" && "This is exactly how it'll appear in Browse. Drag inside the frame to reposition it."}
        {status === "error" && "Double-check the link is a direct image URL (ends in .png/.jpg/etc.) and is publicly reachable."}
        {status === "loading" && " "}
      </p>
    </div>
  );
}
