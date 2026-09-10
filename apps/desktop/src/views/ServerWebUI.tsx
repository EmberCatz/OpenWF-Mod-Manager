import { getWebuiPort } from "../settings";
import LiveIframePanel from "../components/LiveIframePanel";

// Embeds a self-hosted SpaceNinjaServer's admin WebUI (localhost, default
// port 80 — see https://about.openwf.io/web-server-setup) — a different
// tool from the Bootstrapper's own WebUI on the Live Settings tab: this one
// only exists if you're running a local private server, and it has its own
// login (handled inside the iframe, same as opening it in a browser would).
export default function ServerWebUI() {
  return (
    <LiveIframePanel
      title="SpaceNinjaServer WebUI"
      getUrl={() => {
        const port = getWebuiPort();
        const scheme = port === 443 ? "https" : "http";
        return `${scheme}://localhost:${port}/webui`;
      }}
      offlineMessage={(url) => (
        <>
          Can't reach a SpaceNinjaServer WebUI at {url}. This only works if you're running a local private server —
          if you're just playing normally, you can ignore or hide this tab in Settings → Live Tabs.
        </>
      )}
      offlineHint={
        <span className="hint">If your server uses a different port, update it in Settings → Live Tabs.</span>
      }
    />
  );
}
