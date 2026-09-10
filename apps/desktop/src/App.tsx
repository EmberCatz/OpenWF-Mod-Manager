import { useState } from "react";
import Browse from "./views/Browse";
import Upload from "./views/Upload";
import MyMods from "./views/MyMods";
import Admin from "./views/Admin";
import Settings from "./views/Settings";
import ToastHost from "./components/ToastHost";
import { useAccount } from "./useAccount";

const ALL_TABS = [
  { id: "browse", label: "Browse", view: Browse },
  { id: "upload", label: "Upload", view: Upload },
  { id: "my-mods", label: "My Mods", view: MyMods },
  { id: "admin", label: "Admin", view: Admin },
  { id: "settings", label: "Settings", view: Settings },
] as const;

export default function App() {
  const { account } = useAccount();
  const [activeTab, setActiveTab] = useState<(typeof ALL_TABS)[number]["id"]>("browse");

  // The Admin tab only exists for accounts with is_admin set (see
  // apps/api/scripts/grant-admin.mjs) — filtered here rather than in every
  // route, so a non-admin never even sees it in the nav.
  const tabs = ALL_TABS.filter((tab) => tab.id !== "admin" || account?.isAdmin);
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
