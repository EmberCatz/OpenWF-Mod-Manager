import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshIcon } from "../icons";

type Status = "checking" | "online" | "offline";

const POLL_INTERVAL_MS = 5000;

interface LiveIframePanelProps {
  // Called fresh on every check/render rather than passed as a plain string,
  // so a port changed in Settings takes effect on the next poll without
  // needing to remount this tab.
  getUrl: () => string;
  title: string;
  offlineMessage: (url: string) => React.ReactNode;
  offlineHint?: React.ReactNode;
}

// Shared by every tab that embeds a live, local-only HTTP interface (the
// Bootstrapper's own WebUI, a self-hosted SpaceNinjaServer's admin WebUI,
// etc.) — these are only reachable while the relevant server is actually
// running, so this polls for it rather than assuming it's there, and swaps
// in a fresh iframe the moment it comes online.
export default function LiveIframePanel({ getUrl, title, offlineMessage, offlineHint }: LiveIframePanelProps) {
  const [status, setStatus] = useState<Status>("checking");
  const [session, setSession] = useState(0);
  const prevStatusRef = useRef<Status>("checking");

  const check = useCallback(async () => {
    let reachable = true;
    try {
      // no-cors: we can't (and don't need to) read the response — a
      // connection refusal still rejects the promise regardless of mode,
      // which is all this needs to detect "is anything listening here."
      await fetch(getUrl(), { mode: "no-cors", cache: "no-store" });
    } catch {
      reachable = false;
    }

    const next: Status = reachable ? "online" : "offline";
    if (prevStatusRef.current !== "online" && next === "online") {
      setSession((s) => s + 1); // force a fresh iframe mount when it (re)connects
    }
    prevStatusRef.current = next;
    setStatus(next);
  }, [getUrl]);

  useEffect(() => {
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [check]);

  const url = getUrl();

  function retry() {
    setStatus("checking");
    check();
  }

  if (status !== "online") {
    return (
      <div className="live-iframe-offline">
        {status === "checking" ? (
          <p>
            <span className="spinner" /> Looking for it at {url}…
          </p>
        ) : (
          <>
            <p className="muted">{offlineMessage(url)}</p>
            {offlineHint}
            <button className="button" onClick={retry}>
              <RefreshIcon className="btn-icon" /> Retry now
            </button>
          </>
        )}
      </div>
    );
  }

  return <iframe key={session} className="live-iframe-frame" src={url} title={title} />;
}
