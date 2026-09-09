import { useEffect, useState } from "react";
import { pickFolder } from "../native";
import {
  getApiKey,
  getMetadataPatchesPath,
  getScriptsPath,
  setApiKey,
  setMetadataPatchesPath,
  setScriptsPath,
} from "../settings";
import { deleteAccount, fetchMe, login, logout, signup, type Account } from "../api";
import { TrashIcon } from "../icons";

type AuthMode = "login" | "signup";
type AuthStatus = { kind: "idle" | "working" | "error"; message?: string };

export default function Settings() {
  const [metadataPatchesPath, setMetadataPatchesPathState] = useState(getMetadataPatchesPath() ?? "");
  const [scriptsPath, setScriptsPathState] = useState(getScriptsPath() ?? "");
  const [saved, setSaved] = useState(false);

  const [account, setAccount] = useState<Account | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ kind: "idle" });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const token = getApiKey();
    if (!token) {
      setAccountLoading(false);
      return;
    }
    fetchMe(token)
      .then(setAccount)
      .catch(() => {}) // stale/invalid token — just show the login form again
      .finally(() => setAccountLoading(false));
  }, []);

  async function browse(title: string, setter: (v: string) => void) {
    const picked = await pickFolder(title);
    if (picked) setter(picked);
  }

  function save() {
    setMetadataPatchesPath(metadataPatchesPath);
    setScriptsPath(scriptsPath);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleAuthSubmit() {
    setAuthStatus({ kind: "working" });
    try {
      const result = authMode === "signup" ? await signup(authUsername, authPassword) : await login(authUsername, authPassword);
      setApiKey(result.token);
      setAccount({ id: "", username: result.username });
      setAuthPassword("");
      setAuthStatus({ kind: "idle" });
    } catch (e) {
      setAuthStatus({ kind: "error", message: String(e) });
    }
  }

  async function handleLogout() {
    const token = getApiKey();
    if (token) await logout(token);
    setApiKey("");
    setAccount(null);
    setConfirmingDelete(false);
  }

  async function handleDeleteAccount() {
    const token = getApiKey();
    if (!token) return;
    setAuthStatus({ kind: "working" });
    try {
      await deleteAccount(token);
      setApiKey("");
      setAccount(null);
      setConfirmingDelete(false);
      setAuthStatus({ kind: "idle" });
    } catch (e) {
      setAuthStatus({ kind: "error", message: String(e) });
    }
  }

  return (
    <div className="settings">
      <label className="field">
        <span>Metadata Patches folder</span>
        <span className="hint">
          Usually <code>&lt;Warframe folder&gt;/OpenWF/Metadata Patches/</code>. Metadata-patch mods install here.
        </span>
        <div className="field__row">
          <input
            type="text"
            value={metadataPatchesPath}
            onChange={(e) => setMetadataPatchesPathState(e.target.value)}
            placeholder="Not set"
          />
          <button className="button" onClick={() => browse("Select your Metadata Patches folder", setMetadataPatchesPathState)}>
            Browse…
          </button>
        </div>
      </label>

      <label className="field">
        <span>Scripts folder</span>
        <span className="hint">
          Usually <code>&lt;Warframe folder&gt;/OpenWF/Scripts/</code>. Pluto-script mods install here.
        </span>
        <div className="field__row">
          <input type="text" value={scriptsPath} onChange={(e) => setScriptsPathState(e.target.value)} placeholder="Not set" />
          <button className="button" onClick={() => browse("Select your Scripts folder", setScriptsPathState)}>
            Browse…
          </button>
        </div>
      </label>

      <button className="button button--primary" onClick={save}>Save</button>
      {saved && <span className="muted"> Saved.</span>}

      <div className="field" style={{ marginTop: "1.5rem" }}>
        <span>Account</span>
        <span className="hint">Only needed to upload mods and manage them under My Mods.</span>

        {accountLoading ? (
          <p className="muted"><span className="spinner" /> Checking…</p>
        ) : account ? (
          <div>
            <p>
              Logged in as <strong>{account.username}</strong>
            </p>
            <div className="field__row">
              <button className="button" onClick={handleLogout}>Log out</button>
              {!confirmingDelete && (
                <button className="button button--danger" onClick={() => setConfirmingDelete(true)}>
                  <TrashIcon className="btn-icon" /> Delete account
                </button>
              )}
            </div>
            {confirmingDelete && (
              <>
                <div className="field__row" style={{ marginTop: "0.5rem" }}>
                  <span className="error">Delete your account? This can't be undone.</span>
                  <button className="button button--danger" disabled={authStatus.kind === "working"} onClick={handleDeleteAccount}>
                    {authStatus.kind === "working" && <span className="spinner" />}
                    Confirm
                  </button>
                  <button className="button" onClick={() => setConfirmingDelete(false)}>Cancel</button>
                </div>
                {authStatus.kind === "error" && <p className="error">{authStatus.message}</p>}
              </>
            )}
          </div>
        ) : (
          <div className="account-form">
            <div className="tabs tabs--sub">
              <button className={`tab ${authMode === "login" ? "tab--active" : ""}`} onClick={() => setAuthMode("login")}>
                Log in
              </button>
              <button className={`tab ${authMode === "signup" ? "tab--active" : ""}`} onClick={() => setAuthMode("signup")}>
                Sign up
              </button>
            </div>
            <input type="text" placeholder="Username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} />
            <input type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
            <button className="button button--primary" disabled={authStatus.kind === "working"} onClick={handleAuthSubmit}>
              {authStatus.kind === "working" && <span className="spinner" />}
              {authMode === "signup" ? "Sign up" : "Log in"}
            </button>
            {authStatus.kind === "error" && <p className="error">{authStatus.message}</p>}
            <p className="hint">
              We store your username and a salted hash of your password — never the password itself. Delete your
              account any time above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
