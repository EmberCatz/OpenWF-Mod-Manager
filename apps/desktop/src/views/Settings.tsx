import { useState } from "react";
import { pickFolder } from "../native";
import {
  getApiKey,
  getMetadataPatchesPath,
  getScriptsPath,
  setApiKey,
  setMetadataPatchesPath,
  setScriptsPath,
} from "../settings";

export default function Settings() {
  const [metadataPatchesPath, setMetadataPatchesPathState] = useState(getMetadataPatchesPath() ?? "");
  const [scriptsPath, setScriptsPathState] = useState(getScriptsPath() ?? "");
  const [apiKey, setApiKeyState] = useState(getApiKey() ?? "");
  const [saved, setSaved] = useState(false);

  async function browse(title: string, setter: (v: string) => void) {
    const picked = await pickFolder(title);
    if (picked) setter(picked);
  }

  function save() {
    setMetadataPatchesPath(metadataPatchesPath);
    setScriptsPath(scriptsPath);
    setApiKey(apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
