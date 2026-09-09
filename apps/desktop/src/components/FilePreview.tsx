import { useState } from "react";
import type { ZipTextEntry } from "../native";

interface FilePreviewProps {
  files: ZipTextEntry[];
  loading: boolean;
  error: string | null;
}

// Fixed-height, scrollable preview of a version's file(s) — a zip's
// text-decodable entries, or the single raw .pluto/.txt itself. Nothing is
// installed or written to disk here, this is read-only.
export default function FilePreview({ files, loading, error }: FilePreviewProps) {
  const [active, setActive] = useState(0);

  if (loading) return <p><span className="spinner" /> Loading preview…</p>;
  if (error) return <p className="error">{error}</p>;
  if (files.length === 0) return <p className="muted">Nothing previewable in this file.</p>;

  const current = files[Math.min(active, files.length - 1)];

  return (
    <div className="file-preview">
      {files.length > 1 && (
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
      )}
      <pre className="file-preview__body">{current.content}</pre>
    </div>
  );
}
