import { useState } from "react";
import { pickFolder } from "../native";
import {
  dismissFirstRunWizard,
  getMetadataPatchesPath,
  getScriptsPath,
  isFirstRunWizardDismissed,
  setMetadataPatchesPath,
  setScriptsPath,
} from "../settings";

// Shown once on first launch (neither install folder set yet, and this
// hasn't already been skipped) so new/casual users don't have to discover
// Settings -> Install Folders the hard way, by hitting modActions.ts's
// "set the matching folder in Settings first" error on their very first
// Install attempt. A nudge, not a hard gate: Skip just leaves things exactly
// as they are today, and this component never shows itself again after
// either Save or Skip.
export default function FirstRunFolderWizard() {
  const [dismissed, setDismissed] = useState(
    () => isFirstRunWizardDismissed() || (!!getMetadataPatchesPath() && !!getScriptsPath()),
  );
  const [warframeFolder, setWarframeFolder] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);

  if (dismissed) return null;

  const metadataPatchesPath = warframeFolder ? `${warframeFolder}/OpenWF/Metadata Patches` : null;
  const scriptsPath = warframeFolder ? `${warframeFolder}/OpenWF/Scripts` : null;

  async function handleBrowse() {
    setBrowsing(true);
    try {
      const picked = await pickFolder("Select your Warframe installation folder");
      if (picked) setWarframeFolder(picked);
    } finally {
      setBrowsing(false);
    }
  }

  function handleSkip() {
    dismissFirstRunWizard();
    setDismissed(true);
  }

  function handleSave() {
    if (!metadataPatchesPath || !scriptsPath) return;
    setMetadataPatchesPath(metadataPatchesPath);
    setScriptsPath(scriptsPath);
    dismissFirstRunWizard();
    setDismissed(true);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-box--small">
        <div className="modal-header">Welcome to OpenWF Mod Manager</div>
        <p className="hint">
          Point this at your Warframe installation folder and we'll set up both install folders for you. You can
          always change these later in Settings → Install Folders.
        </p>

        <button className="button button--primary" onClick={handleBrowse} disabled={browsing}>
          {browsing && <span className="spinner" />} Browse for Warframe folder…
        </button>

        {warframeFolder && (
          <>
            <p className="hint">
              Metadata Patches: <code>{metadataPatchesPath}</code>
            </p>
            <p className="hint">
              Scripts: <code>{scriptsPath}</code>
            </p>
          </>
        )}

        <div className="field__row">
          <button className="button button--primary" onClick={handleSave} disabled={!warframeFolder}>
            Save and continue
          </button>
          <button className="button" onClick={handleSkip}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
