import { useState } from "react";
import Browse from "./views/Browse";
import Upload from "./views/Upload";
import Settings from "./views/Settings";

const TABS = [
  { id: "browse", label: "Browse", view: Browse },
  { id: "upload", label: "Upload", view: Upload },
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

      <ActiveView />
    </main>
  );
}
