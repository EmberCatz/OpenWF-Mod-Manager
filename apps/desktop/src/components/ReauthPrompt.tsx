import { useRef, useState, type FormEvent } from "react";
import { reauth } from "../api";

// Step-up re-authentication for the handful of admin actions gated behind
// requireReauth() server-side (kill-sessions, the site-wide kill-switches,
// hard-deleting an account — see routes/admin.ts). requestToken() resolves
// immediately from an in-memory cache if a token was issued recently enough
// to still be valid, otherwise it renders a password prompt and resolves
// once the user confirms. Render `modal` (returned alongside) wherever the
// caller's tree can host a fullscreen overlay.
export function useStepUpReauth(apiKey: string | null) {
  const cached = useRef<{ token: string; expiresAt: number } | null>(null);
  const [pending, setPending] = useState<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
  } | null>(null);

  function requestToken(): Promise<string> {
    if (cached.current && cached.current.expiresAt > Date.now() + 5000) {
      return Promise.resolve(cached.current.token);
    }
    return new Promise<string>((resolve, reject) => setPending({ resolve, reject }));
  }

  async function handleSubmit(password: string) {
    if (!apiKey) throw new Error("not logged in");
    const { token, expiresAt } = await reauth(password, apiKey);
    cached.current = { token, expiresAt: new Date(expiresAt).getTime() };
    pending?.resolve(token);
    setPending(null);
  }

  function handleCancel() {
    pending?.reject(new Error("cancelled"));
    setPending(null);
  }

  const modal = pending ? <ReauthModal onSubmit={handleSubmit} onCancel={handleCancel} /> : null;

  return { requestToken, modal };
}

function ReauthModal({ onSubmit, onCancel }: { onSubmit: (password: string) => Promise<void>; onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal-box modal-box--small" onSubmit={handleSubmit}>
        <div className="modal-header">Confirm it's you</div>
        <p className="hint">
          This action needs your password again before it can proceed — a safeguard in case this session's login
          was somehow compromised.
        </p>
        {error && <p className="error">{error}</p>}
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="field__row">
          <button type="submit" className="button button--danger" disabled={busy || !password}>
            {busy && <span className="spinner" />} Confirm
          </button>
          <button type="button" className="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
