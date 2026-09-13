import { useEffect, useState } from "react";
import { PlutoCode } from "../plutoHighlight";

interface FilePreviewProps {
  // The file's own name — shown in the modal header and used to decide
  // .pluto syntax highlighting vs. plain text.
  name: string;
  content: string | null; // null while loading/on error
  loading: boolean;
  error: string | null;
  onClose: () => void;
  // Called with the currently-selected text when the user asks to report
  // a snippet — ModDetail owns the actual ReportButton this feeds into,
  // since the report itself is scoped to the mod, not this preview.
  onReportSnippet?: (text: string) => void;
}

function renderContent(name: string, content: string) {
  return name.toLowerCase().endsWith(".pluto") ? <PlutoCode code={content} /> : content;
}

// A fullscreen-only, read-only preview of a single mod file (always raw
// .pluto/.txt now — no zip, so no multi-entry tabs to manage either).
// Nothing is installed or written to disk here. ModDetail mounts this
// only once the user clicks a version's file icon (see
// version-history__file-btn there), so there's no always-visible inline
// preview to also account for.
export default function FilePreview({ name, content, loading, error, onClose, onReportSnippet }: FilePreviewProps) {
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

  function handleReportSnippet() {
    const snippet = document.getSelection()?.toString().trim();
    if (!snippet || !onReportSnippet) return;
    onReportSnippet(`In ${name}:\n\n> ${snippet.replace(/\n/g, "\n> ")}\n\n`);
  }

  const reportSnippetBtn = onReportSnippet && content !== null && selectedText.trim().length > 0 && (
    <button className="button file-preview__report-snippet-btn" onClick={handleReportSnippet}>
      Report this snippet
    </button>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{name}</span>
          <div className="field__row">
            {reportSnippetBtn}
            <button className="button" onClick={onClose}>✕ Close</button>
          </div>
        </div>
        {loading && <p><span className="spinner" /> Loading preview…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && content !== null && (
          <pre className="file-preview__body file-preview__body--fullscreen">{renderContent(name, content)}</pre>
        )}
      </div>
    </div>
  );
}
