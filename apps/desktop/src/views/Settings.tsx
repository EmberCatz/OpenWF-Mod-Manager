import { useState } from "react";
import { pickFolder } from "../native";
import {
  DEFAULT_BOOTSTRAPPER_PORT,
  DEFAULT_WEBUI_PORT,
  clearApiKey,
  getApiKey,
  getBootstrapperPort,
  getMetadataPatchesPath,
  getScriptsPath,
  getWebuiPort,
  isLiveSettingsTabEnabled,
  isLiveWideModeEnabled,
  isSplitViewEnabled,
  setApiKey,
  setBootstrapperPort,
  setLiveSettingsTabEnabled,
  setLiveWideModeEnabled,
  setMetadataPatchesPath,
  setScriptsPath,
  setSplitViewEnabled,
  setWebuiPort,
} from "../settings";
import { AVATAR_KEYS } from "@openwf-mod-manager/shared";
import { deleteAccount, login, logout, signup, updateAvatar } from "../api";
import { useAccount } from "../useAccount";
import { TrashIcon } from "../icons";
import { toast } from "../toast";
import Avatar from "../components/Avatar";

type AuthMode = "login" | "signup";
type AuthStatus = { kind: "idle" | "working" };
type Section = "folders" | "live" | "account" | "about";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "folders", label: "Install Folders" },
  { id: "live", label: "Live Tabs" },
  { id: "account", label: "Account" },
  { id: "about", label: "About / Disclaimer" },
];

export default function Settings() {
  const [section, setSection] = useState<Section>("folders");
  const [metadataPatchesPath, setMetadataPatchesPathState] = useState(getMetadataPatchesPath() ?? "");
  const [scriptsPath, setScriptsPathState] = useState(getScriptsPath() ?? "");
  const [saved, setSaved] = useState(false);

  const [bootstrapperPort, setBootstrapperPortState] = useState(String(getBootstrapperPort()));
  const [webuiPort, setWebuiPortState] = useState(String(getWebuiPort()));
  const [liveTabsSaved, setLiveTabsSaved] = useState(false);
  const [liveSettingsEnabled, setLiveSettingsEnabledState] = useState(isLiveSettingsTabEnabled());
  const [splitViewEnabled, setSplitViewEnabledState] = useState(isSplitViewEnabled());
  const [wideModeEnabled, setWideModeEnabledState] = useState(isLiveWideModeEnabled());

  const { account, accountLoading, refreshAccount, setAccount } = useAccount();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ kind: "idle" });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  function saveLiveTabPorts() {
    const bport = Number(bootstrapperPort);
    setBootstrapperPort(Number.isInteger(bport) && bport > 0 ? bport : DEFAULT_BOOTSTRAPPER_PORT);
    const wport = Number(webuiPort);
    setWebuiPort(Number.isInteger(wport) && wport > 0 ? wport : DEFAULT_WEBUI_PORT);
    setLiveTabsSaved(true);
    setTimeout(() => setLiveTabsSaved(false), 2000);
  }

  function toggleLiveSettingsTab(enabled: boolean) {
    setLiveSettingsEnabledState(enabled);
    setLiveSettingsTabEnabled(enabled);
  }

  function toggleSplitView(enabled: boolean) {
    setSplitViewEnabledState(enabled);
    setSplitViewEnabled(enabled);
  }

  function toggleWideMode(enabled: boolean) {
    setWideModeEnabledState(enabled);
    setLiveWideModeEnabled(enabled);
  }

  async function handleAuthSubmit() {
    setAuthStatus({ kind: "working" });
    try {
      const result = authMode === "signup" ? await signup(authUsername, authPassword) : await login(authUsername, authPassword);
      await setApiKey(result.token);
      await refreshAccount();
      setAuthPassword("");
      setAuthStatus({ kind: "idle" });
    } catch (e) {
      toast.error(String(e));
      setAuthStatus({ kind: "idle" });
    }
  }

  async function handleLogout() {
    const token = await getApiKey();
    if (token) await logout(token);
    await clearApiKey();
    setAccount(null);
    setConfirmingDelete(false);
  }

  async function handleAvatarSelect(avatarKey: string) {
    const token = await getApiKey();
    if (!token) return;
    try {
      setAccount(await updateAvatar(avatarKey, token));
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function handleDeleteAccount() {
    const token = await getApiKey();
    if (!token) return;
    setAuthStatus({ kind: "working" });
    try {
      await deleteAccount(token);
      await clearApiKey();
      setAccount(null);
      setConfirmingDelete(false);
      setAuthStatus({ kind: "idle" });
    } catch (e) {
      toast.error(String(e));
      setAuthStatus({ kind: "idle" });
    }
  }

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`settings-nav__item ${section === s.id ? "settings-nav__item--active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="settings-panel">
        {section === "folders" && (
          <>
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
          </>
        )}

        {section === "live" && (
          <>
            <label className="field">
              <span>Bootstrapper HTTP port</span>
              <span className="hint">
                Powers the Live Settings tab. Matches <code>client_http_port</code> in your{" "}
                <code>OpenWF/Client Config.json</code> — only change this if you changed it there too.
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={bootstrapperPort}
                onChange={(e) => setBootstrapperPortState(e.target.value.replace(/\D/g, ""))}
                placeholder={String(DEFAULT_BOOTSTRAPPER_PORT)}
              />
            </label>

            <label className="field">
              <span>SpaceNinjaServer WebUI port</span>
              <span className="hint">
                Powers the Server WebUI sub-tab under Live Settings — only relevant if you run a local
                SpaceNinjaServer private server. Defaults to 80; use 443 if yours runs over HTTPS.
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={webuiPort}
                onChange={(e) => setWebuiPortState(e.target.value.replace(/\D/g, ""))}
                placeholder={String(DEFAULT_WEBUI_PORT)}
              />
            </label>

            <button className="button button--primary" onClick={saveLiveTabPorts}>Save</button>
            {liveTabsSaved && <span className="muted"> Saved.</span>}

            <p className="hint" style={{ marginTop: "1rem" }}>
              <strong>Security note:</strong> both interfaces trust anything that can reach the
              port — that's fine on localhost, but never port-forward or expose either one to your
              LAN or the internet, since neither is hardened against untrusted callers.
            </p>

            <h4 className="sidebar-section__title" style={{ marginTop: "1.5rem" }}>Options</h4>
            <label className="sidebar-checkbox">
              <input
                type="checkbox"
                checked={liveSettingsEnabled}
                onChange={(e) => toggleLiveSettingsTab(e.target.checked)}
              />
              Show the Live Settings tab
            </label>
            <label className="sidebar-checkbox">
              <input
                type="checkbox"
                checked={splitViewEnabled}
                onChange={(e) => toggleSplitView(e.target.checked)}
              />
              View Client WebUI and Server WebUI side by side (split screen)
            </label>
            <label className="sidebar-checkbox">
              <input
                type="checkbox"
                checked={wideModeEnabled}
                onChange={(e) => toggleWideMode(e.target.checked)}
              />
              Expand the WebUI panel(s) to the full window width
            </label>
          </>
        )}

        {section === "account" && (
          <div className="field">
            <span>Account</span>
            <span className="hint">Only needed to upload mods and manage them under My Mods.</span>

            {accountLoading ? (
              <p className="muted"><span className="spinner" /> Checking…</p>
            ) : account ? (
              <div>
                <p>
                  Logged in as <strong>{account.username}</strong>
                </p>
                <span className="hint">Profile picture</span>
                <div className="avatar-picker">
                  {AVATAR_KEYS.map((key) => (
                    <button
                      key={key}
                      className={`avatar-picker__option ${account.avatarKey === key ? "avatar-picker__option--active" : ""}`}
                      title={key}
                      onClick={() => handleAvatarSelect(key)}
                    >
                      <Avatar name={account.username} avatarKey={key} size={28} />
                    </button>
                  ))}
                </div>
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
                <p className="hint">
                  We store your username and a salted hash of your password — never the password itself. Delete your
                  account any time above.
                </p>
              </div>
            )}
          </div>
        )}

        {section === "about" && (
          <div className="field">
            <span>About / Disclaimer</span>
            <p className="hint">
              This is an independent, community-made project and is <strong>not affiliated with, endorsed by,
              sponsored by, or otherwise connected to the developer or publisher of Warframe.</strong> WARFRAME® and
              the WARFRAME logo are registered trademarks of their respective owner; they, and any other game
              content/assets referenced here, remain the property of their respective owners. Their use here is
              solely to describe compatibility and does not imply sponsorship or endorsement.
            </p>
            <p className="hint">
              This tool is built for use with OpenWF, an independent, community-run project — it does not connect to
              or interact with Warframe's official servers in any way.
            </p>
            <p className="hint">
              Mods distributed through this project (metadata patches, .pluto scripts) are user-submitted content,
              provided "as is" without warranty of any kind; they are not reviewed, endorsed, or guaranteed by this
              project. Using modified clients or unofficial servers with Warframe may conflict with its End User
              License Agreement — you're solely responsible for understanding and complying with whatever terms
              apply to your own use.
            </p>
            <p className="hint">
              If you're a rights holder with a concern about content hosted or distributed through this project, open
              an issue on the project's GitHub repo — it will be addressed promptly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
