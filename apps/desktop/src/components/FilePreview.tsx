import { useEffect, useState } from "react";
import type { ZipTextEntry } from "../native";
import { PlutoCode } from "../plutoHighlight";

interface FilePreviewProps {
  // Shown in the modal header — the version's own file name, since this
  // opens straight into fullscreen with no smaller inline state first.
  title: string;
  files: ZipTextEntry[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  // Called with the currently-selected text (plus which file it's from)
  // when the user asks to report a snippet — ModDetail owns the actual
  // ReportButton this feeds into, since the report itself is scoped to the
  // mod, not this preview component.
  onReportSnippet?: (text: string) => void;
}

function renderContent(name: string, content: string) {
  return name.toLowerCase().endsWith(".pluto") ? <PlutoCode code={content} /> : content;
}

// A fullscreen-only, read-only preview of a version's file(s) — a zip's
// text-decodable entries, or the single raw .pluto/.txt itself. Nothing is
// installed or written to disk here. ModDetail mounts this only once the
// user clicks a version's file icon (see version-history__file-btn there),
// so there's no always-visible inline preview to also account for.
export default function FilePreview({ title, files, loading, error, onClose, onReportSnippet }: FilePreviewProps) {
  const [active, setActive] = useState(0);
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tracks the current text selection so a "Report this snippet" action can
  // appear only while one exists — cheap enough to just poll on every
  // selectionchange rather than scope it precisely to this component's DOM.
  useEffect(() => {
    function onSelectionChange() {
      setSelectedText(document.getSelection()?.toString() ?? "");
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const current = files[Math.min(active, Math.max(files.length - 1, 0))];

  function handleReportSnippet() {
    const snippet = document.getSelection()?.toString().trim();
    if (!snippet || !onReportSnippet || !current) return;
    onReportSnippet(`In ${current.name}:\n\n> ${snippet.replace(/\n/g, "\n> ")}\n\n`);
  }

  const reportSnippetBtn = onReportSnippet && current && selectedText.trim().length > 0 && (
    <button className="button file-preview__report-snippet-btn" onClick={handleReportSnippet}>
      Report this snippet
    </button>
  );

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{title}</span>
          <div className="field__row">
            {reportSnippetBtn}
            <button className="button" onClick={onClose}>✕ Close</button>
          </div>
        </div>
        {tabs}
        {loading && <p><span className="spinner" /> Loading preview…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && files.length === 0 && <p className="muted">Nothing previewable in this file.</p>}
        {!loading && !error && current && (
          <pre className="file-preview__body file-preview__body--fullscreen">{renderContent(current.name, current.content)}</pre>
        )}
      </div>
    </div>
  );
}
