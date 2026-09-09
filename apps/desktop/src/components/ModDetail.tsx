import { useEffect, useState } from "react";
import type { ModWithVersions, ModVersion, ReviewSummary } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG } from "@openwf-mod-manager/shared";
import { deleteMod, downloadModFile, fetchMod, fetchReviewSummary, postReview } from "../api";
import { canAutoInstall, downloadVersion, installVersion, uninstallMod } from "../modActions";
import { getInstalled } from "../installed";
import { listZipTextEntries, type ZipTextEntry } from "../native";
import { getReviewerId } from "../reviewerId";
import { getApiKey } from "../settings";
import { useAccount } from "../useAccount";
import { CheckCircleIcon, RefreshIcon, TrashIcon } from "../icons";
import StarRating from "./StarRating";
import FilePreview from "./FilePreview";
import CommentSection from "./CommentSection";
import ReportButton from "./ReportButton";

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

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export default function ModDetail({ modId, onBack, onChanged }: ModDetailProps) {
  const { account } = useAccount();
  const [mod, setMod] = useState<ModWithVersions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  const [installedVersion, setInstalledVersionState] = useState<string | null>(null);
  const [adminConfirming, setAdminConfirming] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);

  const [previewFiles, setPreviewFiles] = useState<ZipTextEntry[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);

  useEffect(() => {
    fetchMod(modId)
      .then((m) => {
        setMod(m);
        setInstalledVersionState(getInstalled(modId)?.version ?? null);
      })
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false));

    fetchReviewSummary(modId, getReviewerId())
      .then(setReviewSummary)
      .catch(() => {}); // reviews are a nice-to-have — a failure here shouldn't block the rest of the page
  }, [modId]);

  // Previews the latest version's file(s) — a zip's text-decodable entries,
  // or the single raw .pluto/.txt itself. Nothing touches disk.
  useEffect(() => {
    const latest = mod?.versions[0];
    if (!latest) {
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    downloadModFile(latest.downloadUrl)
      .then(async (bytes) => {
        if (latest.fileName.toLowerCase().endsWith(".zip")) {
          setPreviewFiles(await listZipTextEntries(bytes));
        } else {
          setPreviewFiles([{ name: latest.fileName, content: new TextDecoder().decode(bytes) }]);
        }
      })
      .catch((e) => setPreviewError(String(e)))
      .finally(() => setPreviewLoading(false));
  }, [mod?.versions[0]?.id]);

  async function handleRate(rating: number) {
    try {
      setReviewSummary(await postReview(modId, getReviewerId(), rating));
    } catch {
      // leave the previous summary in place — a failed rating isn't worth interrupting the page for
    }
  }

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

  // Admin moderation action — deleteMod already accepts any admin caller,
  // not just the mod's owner (see routes/mods.ts), so this reuses the same
  // client function My Mods' owner-delete button uses.
  async function handleAdminDelete() {
    const apiKey = getApiKey();
    if (!mod || !apiKey) return;
    setAdminBusy(true);
    try {
      await deleteMod(mod.id, apiKey);
      onChanged();
      onBack();
    } catch (e) {
      setAction({ status: "error", message: String(e) });
      setAdminBusy(false);
    }
  }

  return (
    <div className="mod-detail fade-in">
      <button className="button" onClick={onBack}>← Back</button>

      {loading && <p><span className="spinner" /> Loading…</p>}
      {loadError && <p className="error">{loadError}</p>}

      {mod && (
        <>
          <div className="mod-detail-columns">
            <div className="mod-detail-left">
              <h2 className="mod-detail__title">{mod.name}</h2>
              <p className="muted">
                by {mod.author} · {formatCount(mod.downloadCount)} download{mod.downloadCount === 1 ? "" : "s"}
              </p>
              <div className="review-summary">
                <StarRating value={reviewSummary?.myRating ?? reviewSummary?.average ?? 0} interactive onRate={handleRate} />
                <span className="muted">
                  {reviewSummary && reviewSummary.count > 0
                    ? `${reviewSummary.average.toFixed(1)} (${reviewSummary.count} rating${reviewSummary.count === 1 ? "" : "s"})`
                    : "No ratings yet"}
                  {reviewSummary?.myRating != null && " — click to change your rating"}
                </span>
              </div>
              <ReportButton targetType="mod" targetId={mod.id} />
              {account?.isAdmin && (
                <div className="field__row">
                  {adminConfirming ? (
                    <>
                      <span className="error">Delete this mod (admin)? This can't be undone.</span>
                      <button className="button button--danger" disabled={adminBusy} onClick={handleAdminDelete}>
                        Confirm
                      </button>
                      <button className="button" onClick={() => setAdminConfirming(false)}>Cancel</button>
                    </>
                  ) : (
                    <button className="button button--danger" onClick={() => setAdminConfirming(true)}>
                      <TrashIcon className="btn-icon" /> Delete (admin)
                    </button>
                  )}
                </div>
              )}
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
                        {isInstalled && (
                          <span className="badge badge--installed">
                            <CheckCircleIcon className="btn-icon" /> Installed
                          </span>
                        )}
                      </div>
                      {version.changelog && <p className="version-history__changelog">{version.changelog}</p>}
                      <div className="version-history__actions">
                        {canAutoInstall(mod.category) ? (
                          <>
                            <button
                              className={`button ${isInstalled ? "button--reinstall" : ""}`}
                              disabled={action.status === "working"}
                              onClick={() => handleInstall(version)}
                            >
                              {isInstalled && <RefreshIcon className="btn-icon" />}
                              {isInstalled ? "Reinstall" : "Install"}
                            </button>
                            {isInstalled && (
                              <button className="button button--danger" disabled={action.status === "working"} onClick={handleUninstall}>
                                <TrashIcon className="btn-icon" /> Uninstall
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
            </div>

            <div className="mod-detail-right">
              <h3>Preview</h3>
              <FilePreview files={previewFiles} loading={previewLoading} error={previewError} />
            </div>
          </div>

          <CommentSection modId={mod.id} />
        </>
      )}
    </div>
  );
}
