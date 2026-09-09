import { useEffect, useState } from "react";
import type { ModWithVersions, ModVersion } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG } from "@openwf-mod-manager/shared";
import { fetchMod } from "../api";
import { canAutoInstall, downloadVersion, installVersion, uninstallMod } from "../modActions";
import { getInstalled } from "../installed";

interface ModDetailProps {
  modId: string;
  onBack: () => void;
  // Called after any install/uninstall so the parent Browse list's
  // installed-state badges refresh once the user goes back.
  onChanged: () => void;
}

type ActionState = { status: "idle" | "working" | "done" | "error"; message?: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatGameVersions(tags: string[]): string {
  if (tags.length === 0 || tags.includes(ALL_VERSIONS_TAG)) return "All Versions";
  return tags.join(", ");
}

export default function ModDetail({ modId, onBack, onChanged }: ModDetailProps) {
  const [mod, setMod] = useState<ModWithVersions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  const [installedVersion, setInstalledVersionState] = useState<string | null>(null);

  useEffect(() => {
    fetchMod(modId)
      .then((m) => {
        setMod(m);
        setInstalledVersionState(getInstalled(modId)?.version ?? null);
      })
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false));
  }, [modId]);

  async function handleInstall(version: ModVersion) {
    if (!mod) return;
    setAction({ status: "working" });
    try {
      const message = await installVersion(mod, version);
      setAction({ status: "done", message });
      setInstalledVersionState(version.version);
      onChanged();
    } catch (e) {
      setAction({ status: "error", message: String(e) });
    }
  }

  async function handleDownload(version: ModVersion) {
    setAction({ status: "working" });
    try {
      const message = await downloadVersion(version);
      setAction(message ? { status: "done", message } : { status: "idle" });
    } catch (e) {
      setAction({ status: "error", message: String(e) });
    }
  }

  async function handleUninstall() {
    if (!mod) return;
    setAction({ status: "working" });
    try {
      await uninstallMod(mod.id);
      setAction({ status: "done", message: "Uninstalled" });
      setInstalledVersionState(null);
      onChanged();
    } catch (e) {
      setAction({ status: "error", message: String(e) });
    }
  }

  return (
    <div className="mod-detail fade-in">
      <button className="button" onClick={onBack}>← Back</button>

      {loading && <p><span className="spinner" /> Loading…</p>}
      {loadError && <p className="error">{loadError}</p>}

      {mod && (
        <>
          <h2 className="mod-detail__title">{mod.name}</h2>
          <p className="muted">by {mod.author}</p>
          {mod.tags.length > 0 && (
            <div className="mod-card__tags">
              {mod.tags.map((t) => (
                <span key={t} className="badge badge--tag">{t}</span>
              ))}
            </div>
          )}
          <p className="mod-detail__description">{mod.description}</p>

          {mod.screenshotUrls.length > 0 && (
            <div className="mod-detail__screenshots">
              {mod.screenshotUrls.map((url) => (
                <img key={url} src={url} alt="" className="mod-detail__screenshot" />
              ))}
            </div>
          )}

          {action.message && (
            <p className={`fade-in ${action.status === "error" ? "error" : "muted"}`}>{action.message}</p>
          )}

          <h3>Versions</h3>
          <ul className="version-history">
            {mod.versions.map((version) => {
              const isInstalled = installedVersion === version.version;
              return (
                <li key={version.id} className="version-history__row">
                  <div className="version-history__header">
                    <span className="version-history__number">v{version.version}</span>
                    <span className="muted">{formatBytes(version.fileSize)}</span>
                    <span className="muted">{formatGameVersions(version.gameVersions)}</span>
                    <span className="muted">{new Date(version.createdAt).toLocaleDateString()}</span>
                    {isInstalled && <span className="badge badge--installed">Installed</span>}
                  </div>
                  {version.changelog && <p className="version-history__changelog">{version.changelog}</p>}
                  <div className="version-history__actions">
                    {canAutoInstall(mod.category) ? (
                      <>
                        <button className="button" disabled={action.status === "working"} onClick={() => handleInstall(version)}>
                          {isInstalled ? "Reinstall" : "Install"}
                        </button>
                        {isInstalled && (
                          <button className="button" disabled={action.status === "working"} onClick={handleUninstall}>
                            Uninstall
                          </button>
                        )}
                      </>
                    ) : (
                      <button className="button" disabled={action.status === "working"} onClick={() => handleDownload(version)}>
                        Download
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
