import { useEffect, useState } from "react";
import type { ModderProfile } from "@openwf-mod-manager/shared";
import { fetchModderProfile } from "../api";
import { closeProfile } from "../profileNav";
import Avatar from "../components/Avatar";
import ModDetail from "../components/ModDetail";
import ModCard from "../components/ModCard";

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
              {profile.mods.map((mod, i) => (
                <ModCard
                  key={mod.id}
                  mod={mod}
                  viewMode="grid"
                  onOpen={() => setOpenModId(mod.id)}
                  style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
