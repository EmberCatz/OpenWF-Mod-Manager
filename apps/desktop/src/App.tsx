import { useEffect, useState } from "react";
import type { ModWithVersions } from "@openwf-mod-manager/shared";
import { fetchModList } from "./api";

export default function App() {
  const [mods, setMods] = useState<ModWithVersions[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModList()
      .then(setMods)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="app">
      <h1>OpenWF Mod Manager</h1>

      {loading && <p>Loading mods…</p>}
      {error && <p className="error">{error}</p>}

      <ul className="mod-list">
        {mods.map((mod) => (
          <li key={mod.id} className="mod-card">
            <div className="mod-card__header">
              <span className="mod-card__name">{mod.name}</span>
              <span className="mod-card__author">by {mod.author}</span>
            </div>
            <p className="mod-card__description">{mod.description}</p>
            <span className="mod-card__version">
              {mod.versions[0] ? `v${mod.versions[0].version}` : "no versions yet"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
