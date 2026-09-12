import { useState } from "react";

// Prompts before an install that would overwrite another mod's files
// (modActions.ts's ModConflictError) — requestConfirm() resolves true if
// the user chooses to proceed anyway, false if they cancel. Render `modal`
// wherever the caller's tree can host a fullscreen overlay, same pattern as
// ReauthPrompt.tsx's useStepUpReauth.
export function useConflictConfirm() {
  const [pending, setPending] = useState<{
    conflicts: { modName: string; paths: string[] }[];
    resolve: (proceed: boolean) => void;
  } | null>(null);

  function requestConfirm(conflicts: { modName: string; paths: string[] }[]): Promise<boolean> {
    return new Promise((resolve) => setPending({ conflicts, resolve }));
  }

  function handleDecision(proceed: boolean) {
    pending?.resolve(proceed);
    setPending(null);
  }

  const modal = pending ? (
    <ConflictModal conflicts={pending.conflicts} onCancel={() => handleDecision(false)} onConfirm={() => handleDecision(true)} />
  ) : null;

  return { requestConfirm, modal };
}

function ConflictModal({
  conflicts,
  onCancel,
  onConfirm,
}: {
  conflicts: { modName: string; paths: string[] }[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-box--small">
        <div className="modal-header">This would overwrite another mod</div>
        <p className="hint">
          Installing this would write over file{conflicts.reduce((n, c) => n + c.paths.length, 0) === 1 ? "" : "s"}{" "}
          already installed by:
        </p>
        <ul className="conflict-dialog__list">
          {conflicts.map((c) => (
            <li key={c.modName}>
              <strong>{c.modName}</strong>
              <span className="muted"> — {c.paths.length} file{c.paths.length === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ul>
        <p className="hint">That mod will likely stop working correctly if you continue.</p>
        <div className="field__row">
          <button className="button button--danger" onClick={onConfirm}>
            Install anyway
          </button>
          <button className="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
