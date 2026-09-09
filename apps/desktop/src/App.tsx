import { useState } from "react";
import Browse from "./views/Browse";
import Upload from "./views/Upload";
import MyMods from "./views/MyMods";
import Settings from "./views/Settings";

const TABS = [
  { id: "browse", label: "Browse", view: Browse },
  { id: "upload", label: "Upload", view: Upload },
  { id: "my-mods", label: "My Mods", view: MyMods },
  { id: "settings", label: "Settings", view: Settings },
] as const;

export default function App() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("browse");
  const ActiveView = TABS.find((t) => t.id === activeTab)!.view;

  return (
    <main className="app">
      <h1>OpenWF Mod Manager</h1>

      <nav className="tabs">
        {TABS.map((tab) => (
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
        sponsored by Digital Extremes Ltd. WARFRAME® is a registered
        trademark of Digital Extremes Ltd. Full disclaimer in Settings.
      </footer>
    </main>
  );
}
