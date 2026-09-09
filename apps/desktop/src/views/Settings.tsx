import { useState } from "react";
import { pickInstallFolder } from "../native";
import { getApiKey, getInstallRoot, setApiKey, setInstallRoot } from "../settings";

export default function Settings() {
  const [installRoot, setInstallRootState] = useState(getInstallRoot() ?? "");
  const [apiKey, setApiKeyState] = useState(getApiKey() ?? "");
  const [saved, setSaved] = useState(false);

  async function browseForInstallRoot() {
    const picked = await pickInstallFolder();
    if (picked) setInstallRootState(picked);
  }

  function save() {
    setInstallRoot(installRoot);
    setApiKey(apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="settings">
      <label className="field">
        <span>Warframe install folder</span>
        <span className="hint">
          The folder containing <code>Warframe.x64.exe</code> — mods get installed under its{" "}
          <code>OpenWF/Metadata Patches/</code> or <code>OpenWF/Scripts/</code> subfolders depending on category.
        </span>
        <div className="field__row">
          <input type="text" value={installRoot} onChange={(e) => setInstallRootState(e.target.value)} placeholder="Not set" />
          <button className="button" onClick={browseForInstallRoot}>Browse…</button>
        </div>
      </label>

      <label className="field">
        <span>API key</span>
        <span className="hint">Only needed to upload mods — issued out-of-band, see the project's README.</span>
        <input type="password" value={apiKey} onChange={(e) => setApiKeyState(e.target.value)} placeholder="owmm_..." />
      </label>

      <button className="button button--primary" onClick={save}>Save</button>
      {saved && <span className="muted"> Saved.</span>}
    </div>
  );
}
