import { useState, type CSSProperties } from "react";
import { ALL_VERSIONS_TAG, type ModVersion, type ModWithVersions } from "@openwf-mod-manager/shared";
import { toggleLike } from "../api";
import { canAutoInstall, downloadVersion, installVersion, ModConflictError, uninstallMod } from "../modActions";
import { getInstalled } from "../installed";
import { getReviewerId } from "../reviewerId";
import { isLiked, setLiked } from "../likedMods";
import { toast } from "../toast";
import { CheckCircleIcon, CommentIcon, DownloadIcon, RefreshIcon, TrashIcon } from "../icons";
import { useConflictConfirm } from "./ConflictConfirmDialog";
import SplitButton from "./SplitButton";
import LikeButton from "./LikeButton";
import ClampedText from "./ClampedText";
import AuthorLink from "./AuthorLink";
import defaultThumbnail from "../assets/thumbnails/default-thumbnail.jpg";

export const CATEGORY_LABELS: Record<string, string> = {
  "metadata-patch": "Metadata Patch",
  "pluto-script": "Pluto Script",
  other: "Other",
};

const DEFAULT_THUMBNAIL_URL = defaultThumbnail;

function formatGameVersions(tags: string[]): string {
  if (tags.length === 0 || tags.includes(ALL_VERSIONS_TAG)) return "All Versions";
  if (tags.length <= 3) return tags.join(", ");
  return `${tags.slice(0, 3).join(", ")} +${tags.length - 3} more`;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

// Shows the update date once a mod has actually been changed since its
// initial upload, otherwise the original upload date.
function formatModDate(mod: ModWithVersions): string {
  const updated = new Date(mod.updatedAt).getTime();
  const created = new Date(mod.createdAt).getTime();
  const isUpdated = updated > created;
  const label = isUpdated ? "Updated" : "Uploaded";
  const date = new Date(isUpdated ? mod.updatedAt : mod.createdAt).toLocaleDateString();
  return `${label} ${date}`;
}

interface ModCardProps {
  mod: ModWithVersions;
  viewMode: "grid" | "list";
  onOpen: () => void;
  // Only meaningful where a tag-filter sidebar exists (Browse) — omit to
  // render tags as plain, non-interactive badges (e.g. on a mod author's
  // profile, which has no tag filter to jump to).
  onTagClick?: (tag: string) => void;
  style?: CSSProperties;
}

// One mod card — install/download/uninstall, like, and comment/download
// counts, fully self-contained (its own busy/liked/thumbnail-broken state
// and its own conflict-confirm dialog) so it renders identically wherever
// it's used: Browse's list/grid and a mod author's public profile
// (views/Profile.tsx). Nothing outside needs to know a like was toggled or
// an install finished — the card re-reads its own installed state (via
// getInstalled) and keeps its own like count locally.
export default function ModCard({ mod, viewMode, onOpen, onTagClick, style }: ModCardProps) {
  const [thumbBroken, setThumbBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [likeCount, setLikeCount] = useState(mod.likeCount ?? 0);
  const [liked, setLikedState] = useState(() => isLiked(mod.id));
  // Bumping this isn't read directly — it just forces a re-render so the
  // getInstalled() read below picks up this card's own install/uninstall.
  const [, setInstalledTick] = useState(0);
  const { requestConfirm, modal: conflictModal } = useConflictConfirm();

  const version = mod.versions[0];
  const autoInstallable = canAutoInstall(mod.category);
  const installedEntry = getInstalled(mod.id);
  const isUpToDate = !!installedEntry && !!version && installedEntry.version === version.version;
  const installLabel = autoInstallable ? (isUpToDate ? "Reinstall" : installedEntry ? "Update" : "Install") : "Download";
  const hasThumb = !!mod.thumbnailUrl && !thumbBroken;

  async function performInstall(v: ModVersion, force: boolean) {
    const message = await installVersion(mod, v, { force });
    toast.success(`${mod.name}: ${message}`);
    setInstalledTick((t) => t + 1);
  }

  async function handleInstall() {
    if (!version) return;
    setBusy(true);
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
      } else {
        toast.error(String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!version) return;
    setBusy(true);
    try {
      const message = await downloadVersion(version);
      if (message) toast.success(`${mod.name}: ${message}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleUninstall() {
    setBusy(true);
    try {
      await uninstallMod(mod.id);
      toast.success(`${mod.name}: Uninstalled`);
      setInstalledTick((t) => t + 1);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleLike() {
    try {
      const summary = await toggleLike(mod.id, getReviewerId());
      setLiked(mod.id, summary.liked);
      setLikedState(summary.liked);
      setLikeCount(summary.count);
    } catch (e) {
      toast.error(String(e));
    }
  }

  const onInstallOrDownload = () => (autoInstallable ? handleInstall() : handleDownload());

  const likeButton = <LikeButton liked={liked} count={likeCount} size="sm" onToggle={handleToggleLike} />;

  if (viewMode === "grid") {
    return (
      <li className="mod-card mod-card--grid fade-in" style={style}>
        {conflictModal}
        <div className="mod-card__thumb-wrap">
          <img
            className="mod-card__thumb"
            src={hasThumb ? mod.thumbnailUrl! : DEFAULT_THUMBNAIL_URL}
            alt=""
            style={{ objectPosition: hasThumb ? mod.thumbnailPosition : "50% 50%" }}
            onError={() => mod.thumbnailUrl && setThumbBroken(true)}
          />
          {!hasThumb && (
            <button className="mod-card__thumb-overlay-title" onClick={onOpen}>
              {mod.name}
            </button>
          )}
        </div>
        <div className="mod-card__grid-body">
          <button className="mod-card__name mod-card__name--link" onClick={onOpen}>
            {mod.name}
          </button>
          <span className="mod-card__author">
            by <AuthorLink name={mod.author} accountId={mod.ownerId} />
            {mod.subAuthor && <> · with {mod.subAuthor}</>}
          </span>
          <div className="mod-card__grid-meta">
            <span className="badge">{CATEGORY_LABELS[mod.category] ?? mod.category}</span>
            {mod.theme && <span className="badge">{mod.theme}</span>}
          </div>
          <div className="mod-card__grid-meta">
            <span className="mod-card__meta-stat" title={`${mod.downloadCount} downloads`}>
              <DownloadIcon className="btn-icon" />
              {formatCount(mod.downloadCount)}
            </span>
            <span className="mod-card__meta-stat" title={`${mod.commentCount ?? 0} comments`}>
              <CommentIcon className="btn-icon" />
              {mod.commentCount ?? 0}
            </span>
            {likeButton}
            <span className="mod-card__meta-date">{formatModDate(mod)}</span>
          </div>
          <div className="mod-card__grid-actions">
            {version ? (
              isUpToDate ? (
                <SplitButton
                  mainLabel={
                    <>
                      <TrashIcon className="btn-icon" /> Uninstall
                    </>
                  }
                  mainClassName="button--danger"
                  disabled={busy}
                  onMain={handleUninstall}
                  menuItems={[
                    {
                      label: (
                        <>
                          <RefreshIcon className="btn-icon" /> Reinstall
                        </>
                      ),
                      onClick: onInstallOrDownload,
                    },
                  ]}
                />
              ) : (
                <button
                  className={`button ${installedEntry ? "button--update" : autoInstallable ? "button--install" : "button--download"}`}
                  disabled={busy}
                  onClick={onInstallOrDownload}
                >
                  {busy && <span className="spinner" />}
                  {busy ? "Working…" : installLabel}
                </button>
              )
            ) : (
              <span className="muted">No versions yet</span>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="mod-card fade-in" style={style}>
      {conflictModal}
      <div className="mod-card__body">
        {hasThumb && (
          <img
            className="mod-card__thumb"
            src={mod.thumbnailUrl!}
            alt=""
            style={{ objectPosition: mod.thumbnailPosition }}
            onError={() => setThumbBroken(true)}
          />
        )}
        <div className="mod-card__main">
          <div className="mod-card__header">
            <button className="mod-card__name mod-card__name--link" onClick={onOpen}>
              {mod.name}
            </button>
            <span className="mod-card__author">
              by <AuthorLink name={mod.author} accountId={mod.ownerId} />
              {mod.subAuthor && <> · with {mod.subAuthor}</>}
            </span>
          </div>
          <ClampedText className="mod-card__description" text={mod.description} lines={3} />
          {mod.tags.length > 0 && (
            <div className="mod-card__tags">
              {mod.tags.map((t) =>
                onTagClick ? (
                  <button key={t} className="badge badge--tag" onClick={() => onTagClick(t)}>
                    {t}
                  </button>
                ) : (
                  <span key={t} className="badge badge--tag">
                    {t}
                  </span>
                )
              )}
            </div>
          )}
          <div className="mod-card__footer">
            <span className="badge">{CATEGORY_LABELS[mod.category] ?? mod.category}</span>
            {mod.theme && <span className="badge">{mod.theme}</span>}
            {version && <span className="muted">{formatGameVersions(version.gameVersions)}</span>}
            <span className="mod-card__meta-stat" title={`${mod.downloadCount} downloads`}>
              <DownloadIcon className="btn-icon" />
              {formatCount(mod.downloadCount)}
            </span>
            <span className="mod-card__meta-stat" title={`${mod.commentCount ?? 0} comments`}>
              <CommentIcon className="btn-icon" />
              {mod.commentCount ?? 0}
            </span>
            {likeButton}
            <span className="mod-card__meta-date">{formatModDate(mod)}</span>
            {isUpToDate && (
              <span className="badge badge--installed">
                <CheckCircleIcon className="btn-icon" /> Installed
              </span>
            )}
            {version && <span className="mod-card__version">v{version.version}</span>}
            {version && (
              <button
                className={`button button--lg ${
                  isUpToDate ? "button--reinstall" : installedEntry ? "button--update" : autoInstallable ? "button--install" : "button--download"
                }`}
                disabled={busy}
                onClick={onInstallOrDownload}
              >
                {busy && <span className="spinner" />}
                {!busy && isUpToDate && <RefreshIcon className="btn-icon" />}
                {busy ? "Working…" : installLabel}
              </button>
            )}
            {autoInstallable && installedEntry && isUpToDate && (
              <button className="button button--lg button--danger" disabled={busy} onClick={handleUninstall}>
                <TrashIcon className="btn-icon" /> Uninstall
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
