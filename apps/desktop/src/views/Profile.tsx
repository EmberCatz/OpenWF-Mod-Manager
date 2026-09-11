import { useEffect, useState } from "react";
import type { ModderProfile } from "@openwf-mod-manager/shared";
import { fetchModderProfile } from "../api";
import { closeProfile } from "../profileNav";
import Avatar from "../components/Avatar";
import ModDetail from "../components/ModDetail";
import defaultThumbnail from "../assets/thumbnails/default-thumbnail.jpg";

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

// A creator's public profile — opened from any AuthorLink across the app
// (mod cards, ModDetail, comments) via profileNav.ts, not a normal tab.
// Self-contained the same way Browse owns ModDetail: picking a mod here
// opens it right here rather than trying to hand off to whatever tab was
// active before.
export default function Profile({ accountId }: { accountId: string }) {
  const [profile, setProfile] = useState<ModderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openModId, setOpenModId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchModderProfile(accountId)
      .then(setProfile)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [accountId]);

  if (openModId && profile) {
    return <ModDetail modId={openModId} onBack={() => setOpenModId(null)} onChanged={() => {}} />;
  }

  return (
    <div className="profile fade-in">
      <button className="button" onClick={closeProfile}>← Back</button>

      {loading && <p><span className="spinner" /> Loading profile…</p>}
      {error && <p className="error">{error}</p>}

      {profile && (
        <>
          <div className="profile__header">
            <Avatar name={profile.name} avatarKey={profile.avatarKey} size={64} />
            <div>
              <h2 className="profile__name">{profile.name}</h2>
              <span className="muted">
                {profile.mods.length} mod{profile.mods.length === 1 ? "" : "s"} published · joined{" "}
                {new Date(profile.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {profile.mods.length === 0 ? (
            <p className="muted">No published mods yet.</p>
          ) : (
            <ul className="mod-list mod-list--grid">
              {profile.mods.map((mod, i) => {
                const hasThumb = !!mod.thumbnailUrl;
                const style = { animationDelay: `${Math.min(i, 8) * 35}ms` };
                return (
                  <li key={mod.id} className="mod-card mod-card--grid fade-in" style={style}>
                    <div className="mod-card__thumb-wrap">
                      <img
                        className="mod-card__thumb"
                        src={hasThumb ? mod.thumbnailUrl! : defaultThumbnail}
                        alt=""
                        style={{ objectPosition: hasThumb ? mod.thumbnailPosition : "50% 50%" }}
                      />
                      {!hasThumb && (
                        <button className="mod-card__thumb-overlay-title" onClick={() => setOpenModId(mod.id)}>
                          {mod.name}
                        </button>
                      )}
                    </div>
                    <div className="mod-card__grid-body">
                      <button className="mod-card__name mod-card__name--link" onClick={() => setOpenModId(mod.id)}>
                        {mod.name}
                      </button>
                      <div className="mod-card__grid-meta">
                        <span className="mod-card__meta-stat" title={`${mod.downloadCount} downloads`}>
                          {formatCount(mod.downloadCount)} downloads
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
