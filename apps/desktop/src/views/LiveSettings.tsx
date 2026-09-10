import { useEffect, useState } from "react";
import {
  getBootstrapperPort,
  isLiveWideModeEnabled,
  isSplitViewEnabled,
  setLiveWideModeEnabled,
  setSplitViewEnabled,
  subscribeSettings,
} from "../settings";
import LiveIframePanel from "../components/LiveIframePanel";
import BootstrapperDevTools from "../components/BootstrapperDevTools";
import ServerWebUI from "./ServerWebUI";
import { ExpandWidthIcon, SplitViewIcon } from "../icons";

type SubTab = "client-webui" | "server-webui" | "web-uis" | "dev-tools";

// Everything "live/local" lives under this one tab: the Bootstrapper's own
// HTTP interface (Client WebUI — localhost, default port 6155, see
// docs/openwf-bootstrapper-manual.md and https://about.openwf.io/client-setup),
// a self-hosted SpaceNinjaServer's admin WebUI (Server WebUI — see
// views/ServerWebUI.tsx), and a quick-action panel over the Bootstrapper's
// documented developer routes (Dev Tools — see
// components/BootstrapperDevTools.tsx). All three only work while their
// respective local server is actually running. Split view and wide mode
// (the two icon toggles left of the sub-tabs, mirrored in Settings → Live
// Tabs — same persisted setting either way) control the layout: split view
// merges the two WebUIs into one side-by-side sub-tab instead of two
// separate ones; wide mode breaks the active WebUI panel(s) — single or
// split — out of the app's normal max-width column via the .live-wide CSS
// trick (styles.css) rather than a real DOM portal, so they stay in normal
// document flow (correct position under the sub-tabs, scrolls with the
// page) while still stretching edge-to-edge.
function ClientWebUiPanel() {
  return (
    <LiveIframePanel
      title="OpenWF Bootstrapper"
      getUrl={() => `http://localhost:${getBootstrapperPort()}/`}
      offlineMessage={(url) => (
        <>
          Can't reach the Bootstrapper's HTTP interface at {url}. Make sure Warframe is running with OpenWF
          attached — this reconnects automatically once it's up.
        </>
      )}
      offlineHint={
        <span className="hint">
          If you changed the port in your OpenWF/Client Config.json, update it in Settings → Live Tabs.
        </span>
      }
    />
  );
}

export default function LiveSettings() {
  const [subTab, setSubTab] = useState<SubTab>("client-webui");
  // Bumped whenever the split-view toggle changes in Settings, so this
  // sub-tab bar re-filters immediately.
  const [, setSettingsVersion] = useState(0);

  useEffect(() => subscribeSettings(() => setSettingsVersion((v) => v + 1)), []);

  const splitView = isSplitViewEnabled();
  const wideMode = isLiveWideModeEnabled();

  // Keeps the active sub-tab valid across a split-view toggle flip.
  useEffect(() => {
    if (splitView && (subTab === "client-webui" || subTab === "server-webui")) setSubTab("web-uis");
    if (!splitView && subTab === "web-uis") setSubTab("client-webui");
  }, [splitView, subTab]);

  return (
    <div>
      <div className="tabs tabs--sub">
        <div className="view-toggle">
          <button
            className={`view-toggle__btn ${wideMode ? "view-toggle__btn--active" : ""}`}
            onClick={() => setLiveWideModeEnabled(!wideMode)}
            title={wideMode ? "Disable full-width WebUI panel(s)" : "Expand WebUI panel(s) to full window width"}
          >
            <ExpandWidthIcon className="btn-icon" />
          </button>
          <button
            className={`view-toggle__btn ${splitView ? "view-toggle__btn--active" : ""}`}
            onClick={() => setSplitViewEnabled(!splitView)}
            title={splitView ? "Show Client WebUI and Server WebUI as separate tabs" : "View both WebUIs side by side (split screen)"}
          >
            <SplitViewIcon className="btn-icon" />
          </button>
        </div>
        {splitView ? (
          <button className={`tab ${subTab === "web-uis" ? "tab--active" : ""}`} onClick={() => setSubTab("web-uis")}>
            Web UIs
          </button>
        ) : (
          <>
            <button className={`tab ${subTab === "client-webui" ? "tab--active" : ""}`} onClick={() => setSubTab("client-webui")}>
              Client WebUI
            </button>
            <button className={`tab ${subTab === "server-webui" ? "tab--active" : ""}`} onClick={() => setSubTab("server-webui")}>
              Server WebUI
            </button>
          </>
        )}
        <button className={`tab ${subTab === "dev-tools" ? "tab--active" : ""}`} onClick={() => setSubTab("dev-tools")}>
          Dev Tools
        </button>
      </div>

      {subTab === "client-webui" && (
        <div className={wideMode ? "live-wide" : undefined}>
          <ClientWebUiPanel />
        </div>
      )}
      {subTab === "server-webui" && (
        <div className={wideMode ? "live-wide" : undefined}>
          <ServerWebUI />
        </div>
      )}
      {subTab === "web-uis" && (
        <div className={`live-split-view${wideMode ? " live-wide" : ""}`}>
          <div className="live-split-view__pane">
            <h4 className="sidebar-section__title">Client WebUI</h4>
            <ClientWebUiPanel />
          </div>
          <div className="live-split-view__pane">
            <h4 className="sidebar-section__title">Server WebUI</h4>
            <ServerWebUI />
          </div>
        </div>
      )}
      {subTab === "dev-tools" && <BootstrapperDevTools />}
    </div>
  );
}
