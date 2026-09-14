import { useEffect, useState } from "react";
import type { ModWithVersions, ModVersion, ModVersionFile, LikeSummary } from "@openwf-mod-manager/shared";
import { ALL_VERSIONS_TAG } from "@openwf-mod-manager/shared";
import { deleteMod, downloadModFile, fetchMod, fetchLikeSummary, toggleLike } from "../api";
import { DeclaredConflictError, installVersion, ModConflictError, uninstallMod } from "../modActions";
import { useConflictConfirm, useDeclaredConflictConfirm } from "./ConflictConfirmDialog";
import { getInstalled } from "../installed";
import { getReviewerId } from "../reviewerId";
import { setLiked } from "../likedMods";
import { getApiKey } from "../settings";
import { useAccount } from "../useAccount";
import { CheckCircleIcon, FileIcon, RefreshIcon, ShieldCheckIcon, TrashIcon } from "../icons";
import { toast } from "../toast";
import LikeButton from "./LikeButton";
import FilePreview from "./FilePreview";
import CommentSection from "./CommentSection";
import ReportButton from "./ReportButton";
import AuthorLink from "./AuthorLink";
import { renderModDescription } from "../markdown";

interface ModDetailProps {
  modId: string;
  onBack: () => void;
  // Called after any install/uninstall so the parent Browse list's
  // installed-state badges refresh once the user goes back.
  onChanged: () => void;
}

type ActionState = { status: "idle" | "working" };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function totalBytes(version: ModVersion): number {
  return version.files.reduce((sum, f) => sum + f.fileSize, 0);
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
  const { requestConfirm, modal: conflictModal } = useConflictConfirm();
  const { requestConfirm: requestDeclaredConfirm, modal: declaredConflictModal } = useDeclaredConflictConfirm();
  const [installedVersion, setInstalledVersionState] = useState<string | null>(null);
  const [adminConfirming, setAdminConfirming] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);

  // The file currently open in the fullscreen file-preview modal (see
  // version-history__file-btn below) — null means the modal is closed.
  // Fetched on demand per file clicked, not preloaded for all of them.
  const [previewFile, setPreviewFile] = useState<ModVersionFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [likeSummary, setLikeSummary] = useState<LikeSummary | null>(null);

  const [fullscreenScreenshot, setFullscreenScreenshot] = useState<string | null>(null);
  const [snippetReport, setSnippetReport] = useState<{ text: string; nonce: number } | null>(null);

  useEffect(() => {
    if (!fullscreenScreenshot) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreenScreenshot(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreenScreenshot]);

  useEffect(() => {
    fetchMod(modId)
      .then((m) => {
        setMod(m);
        setInstalledVersionState(getInstalled(modId)?.version ?? null);
      })
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false));

    fetchLikeSummary(modId, getReviewerId())
      .then((summary) => {
        setLikeSummary(summary);
        setLiked(modId, summary.liked); // reconcile the local cache with server truth
      })
      .catch(() => {}); // likes are a nice-to-have — a failure here shouldn't block the rest of the page
  }, [modId]);

  // Opens the fullscreen preview modal for a single file — always a raw
  // .pluto/.txt, no zip decoding needed. Nothing touches disk; this only
  // downloads bytes into memory to decode as text.
  function openFilePreview(file: ModVersionFile) {
    setPreviewFile(file);
    setPreviewContent(null);
    setPreviewError(null);
    setPreviewLoading(true);
    downloadModFile(file.downloadUrl)
      .then((bytes) => setPreviewContent(new TextDecoder().decode(bytes)))
      .catch((e) => setPreviewError(String(e)))
      .finally(() => setPreviewLoading(false));
  }

  async function handleToggleLike() {
    try {
      const summary = await toggleLike(modId, getReviewerId());
      setLikeSummary(summary);
      setLiked(modId, summary.liked);
    } catch {
      // leave the previous summary in place — a failed like isn't worth interrupting the page for
    }
  }

  async function performInstall(version: ModVersion, force: boolean) {
    if (!mod) return;
    const message = await installVersion(mod, version, { force });
    toast.success(`${mod.name}: ${message}`);
    setInstalledVersionState(version.version);
    onChanged();
  }

  async function handleInstall(version: ModVersion) {
    if (!mod) return;
    setAction({ status: "working" });
    try {
      await performInstall(version, false);
    } catch (e) {
      if (e instanceof ModConflictError) {
        if (await requestConfirm(e.conflicts)) {
          try {
            await performInstall(version, true);
          } catch (e2) {
            toast.error(String(e2));
          }
        }
      } else if (e instanceof DeclaredConflictError) {
        if (await requestDeclaredConfirm(e.conflictModNames)) {
          try {
            await performInstall(version, true);
          } catch (e2) {
            toast.error(String(e2));
          }
        }
      } else {
        toast.error(String(e));
      }
    } finally {
      setAction({ status: "idle" });
    }
  }

  async function handleUninstall() {
    if (!mod) return;
    setAction({ status: "working" });
    try {
      await uninstallMod(mod.id);
      toast.success(`${mod.name}: Uninstalled`);
      setInstalledVersionState(null);
      onChanged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAction({ status: "idle" });
    }
  }

  // Admin moderation action — deleteMod already accepts any admin caller,
  // not just the mod's owner (see routes/mods.ts), so this reuses the same
  // client function My Mods' owner-delete button uses.
  async function handleAdminDelete() {
    const apiKey = await getApiKey();
    if (!mod || !apiKey) return;
    setAdminBusy(true);
    try {
      await deleteMod(mod.id, apiKey);
      onChanged();
      onBack();
    } catch (e) {
      toast.error(String(e));
      setAdminBusy(false);
    }
  }

  return (
    <div className="mod-detail fade-in">
      {conflictModal}
      {declaredConflictModal}
      <button className="button" onClick={onBack}>← Back</button>

      {loading && <p><span className="spinner" /> Loading…</p>}
      {loadError && <p className="error">{loadError}</p>}

      {mod && (
        <>
          <div className="mod-detail-body">
            <h2 className="mod-detail__title">{mod.name}</h2>
            <p className="muted">
              by <AuthorLink name={mod.author} accountId={mod.ownerId} />
              {mod.subAuthor && <> · with {mod.subAuthor}</>} · {formatCount(mod.downloadCount)} download{mod.downloadCount === 1 ? "" : "s"}
            </p>
            <div className="like-summary">
              <LikeButton liked={likeSummary?.liked ?? false} count={likeSummary?.count ?? 0} onToggle={handleToggleLike} />
            </div>
            <ReportButton targetType="mod" targetId={mod.id} prefill={snippetReport ?? undefined} />
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
            {mod.riskNotes && (
              <div className="mod-detail__risk-notes">
                <h4>⚠ Before you install</h4>
                <p>{mod.riskNotes}</p>
              </div>
            )}

            <div
              className="mod-detail__description"
              dangerouslySetInnerHTML={{ __html: renderModDescription(mod.description) }}
            />

            {mod.installInstructions && (
              <div className="mod-detail__install-instructions">
                <h4>Installation Notes</h4>
                <p>{mod.installInstructions}</p>
              </div>
            )}

            {mod.screenshotUrls.length > 0 && (
              <div className="mod-detail__screenshots">
                {mod.screenshotUrls.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className="mod-detail__screenshot"
                    onClick={() => setFullscreenScreenshot(url)}
                  />
                ))}
              </div>
            )}

            {fullscreenScreenshot && (
              <div className="modal-overlay" onClick={() => setFullscreenScreenshot(null)}>
                <div className="modal-box modal-box--screenshot" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <span>{mod.name}</span>
                    <button className="button" onClick={() => setFullscreenScreenshot(null)}>✕ Close</button>
                  </div>
                  <img src={fullscreenScreenshot} alt="" className="mod-detail__screenshot--fullscreen" />
                </div>
              </div>
            )}

            <h3>Versions</h3>
            <ul className="version-history">
              {mod.versions.map((version) => {
                const isInstalled = installedVersion === version.version;
                return (
                  <li key={version.id} className="version-history__row">
                    <div className="version-history__header">
                      <span className="version-history__number">v{version.version}</span>
                      <span className="muted">{formatBytes(totalBytes(version))}</span>
                      <span className="muted">{formatGameVersions(version.gameVersions)}</span>
                      <span className="muted">{new Date(version.createdAt).toLocaleDateString()}</span>
                      {isInstalled && (
                        <span className="badge badge--installed">
                          <CheckCircleIcon className="btn-icon" /> Installed
                        </span>
                      )}
                      {version.scanStatus === "clean" && (
                        <span
                          className="badge badge--scan-clean"
                          title="Automatically scanned via VirusTotal — no engine flagged this file. Not a manual review or a guarantee, just one more signal."
                        >
                          <ShieldCheckIcon className="btn-icon" /> Scanned via VirusTotal
                        </span>
                      )}
                    </div>
                    <div className="version-history__files">
                      {version.files.map((file) => (
                        <button
                          key={file.fileName}
                          className="version-history__file-btn"
                          title={`Preview ${file.fileName}`}
                          onClick={() => openFilePreview(file)}
                        >
                          <FileIcon className="btn-icon" /> {file.fileName}
                        </button>
                      ))}
                    </div>
                    {version.changelog && <p className="version-history__changelog">{version.changelog}</p>}
                    <div className="version-history__actions">
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {previewFile && (
            <FilePreview
              name={previewFile.fileName}
              content={previewContent}
              loading={previewLoading}
              error={previewError}
              onClose={() => setPreviewFile(null)}
              onReportSnippet={(text) => setSnippetReport({ text, nonce: Date.now() })}
            />
          )}

          <CommentSection modId={mod.id} modOwnerId={mod.ownerId} />
        </>
      )}
    </div>
  );
}
