import { useEffect, useState } from "react";
import Browse from "./views/Browse";
import Upload from "./views/Upload";
import MyMods from "./views/MyMods";
import LiveSettings from "./views/LiveSettings";
import ServerWebUI from "./views/ServerWebUI";
import Admin from "./views/Admin";
import Settings from "./views/Settings";
import ToastHost from "./components/ToastHost";
import { useAccount } from "./useAccount";
import { isLiveSettingsTabEnabled, isServerWebuiTabEnabled, subscribeSettings } from "./settings";

const ALL_TABS = [
  { id: "browse", label: "Browse", view: Browse },
  { id: "upload", label: "Upload", view: Upload },
  { id: "my-mods", label: "My Mods", view: MyMods },
  { id: "live-settings", label: "Live Settings", view: LiveSettings },
  { id: "server-webui", label: "Server WebUI", view: ServerWebUI },
  { id: "admin", label: "Admin", view: Admin },
  { id: "settings", label: "Settings", view: Settings },
] as const;

export default function App() {
  const { account } = useAccount();
  const [activeTab, setActiveTab] = useState<(typeof ALL_TABS)[number]["id"]>("browse");
  // Bumped whenever a tab-visibility toggle changes in Settings, so the tab
  // list below re-filters immediately instead of needing an app restart.
  const [, setSettingsVersion] = useState(0);

  useEffect(() => subscribeSettings(() => setSettingsVersion((v) => v + 1)), []);

  // Admin only exists for accounts with is_admin set (see
  // apps/api/scripts/grant-admin.mjs); Live Settings/Server WebUI can each
  // be hidden individually in Settings → Live Tabs for players who don't
  // want them cluttering the nav — filtered here rather than in every
  // route/view.
  const tabs = ALL_TABS.filter((tab) => {
    if (tab.id === "admin") return !!account?.isAdmin;
    if (tab.id === "live-settings") return isLiveSettingsTabEnabled();
    if (tab.id === "server-webui") return isServerWebuiTabEnabled();
    return true;
  });
  const ActiveView = (tabs.find((t) => t.id === activeTab) ?? tabs[0]).view;

  return (
    <main className="app">
      <h1>OpenWF Mod Manager</h1>

      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div key={activeTab} className="fade-in">
        <ActiveView />
      </div>

      <footer className="app-footer">
        Unofficial, fan-made tool — not affiliated with, endorsed by, or
        sponsored by Warframe's developer or publisher. WARFRAME® is a
        registered trademark of its owner. Full disclaimer in Settings.
      </footer>

      <ToastHost />
    </main>
  );
}
