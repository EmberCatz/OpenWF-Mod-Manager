import { useEffect, useState } from "react";
import type { ZipTextEntry } from "../native";
import { PlutoCode } from "../plutoHighlight";

interface FilePreviewProps {
  files: ZipTextEntry[];
  loading: boolean;
  error: string | null;
}

function renderContent(name: string, content: string) {
  return name.toLowerCase().endsWith(".pluto") ? <PlutoCode code={content} /> : content;
}

// Fixed-height, scrollable preview of a version's file(s) — a zip's
// text-decodable entries, or the single raw .pluto/.txt itself. Nothing is
// installed or written to disk here, this is read-only. A fullscreen
// toggle opens the same content larger, in a closable overlay.
export default function FilePreview({ files, loading, error }: FilePreviewProps) {
  const [active, setActive] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (loading) return <p><span className="spinner" /> Loading preview…</p>;
  if (error) return <p className="error">{error}</p>;
  if (files.length === 0) return <p className="muted">Nothing previewable in this file.</p>;

  const current = files[Math.min(active, files.length - 1)];

  const tabs = files.length > 1 && (
    <div className="file-preview__tabs">
      {files.map((f, i) => (
        <button
          key={f.name}
          className={`file-preview__tab ${i === active ? "file-preview__tab--active" : ""}`}
          onClick={() => setActive(i)}
        >
          {f.name}
        </button>
      ))}
    </div>
  );

  return (
    <div className="file-preview">
      <div className="file-preview__toolbar">
        {tabs}
        <button className="button file-preview__fullscreen-btn" onClick={() => setFullscreen(true)}>
          ⛶ Fullscreen
        </button>
      </div>
      <pre className="file-preview__body">{renderContent(current.name, current.content)}</pre>

      {fullscreen && (
        <div className="modal-overlay" onClick={() => setFullscreen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>{current.name}</span>
              <button className="button" onClick={() => setFullscreen(false)}>✕ Close</button>
            </div>
            {tabs}
            <pre className="file-preview__body file-preview__body--fullscreen">{renderContent(current.name, current.content)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
