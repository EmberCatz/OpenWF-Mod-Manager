import { getBootstrapperPort } from "../settings";
import LiveIframePanel from "../components/LiveIframePanel";

// Embeds the OpenWF Bootstrapper's own HTTP interface (localhost, default
// port 6155 — see docs/openwf-bootstrapper-manual.md and
// https://about.openwf.io/client-setup) directly in a tab, so a player can
// adjust script settings without leaving the app or opening a browser.
export default function LiveSettings() {
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
