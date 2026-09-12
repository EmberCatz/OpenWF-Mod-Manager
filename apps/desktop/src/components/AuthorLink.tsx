import { openProfile } from "../profileNav";

// A creator's display name, made clickable when there's a real account to
// send it to. `accountId` is exact for a mod's own author (Mod.ownerId,
// always present); for a comment (Comment.authorAccountId) it's only set
// when the poster was actually logged in at post time — a real verified
// link, not a name-based guess, but still null for the (still-supported)
// anonymous/no-account comment path since anyone can type any name into
// the comment box. When there's no account id at all, this renders as
// plain (non-clickable) text instead of a dead link.
export default function AuthorLink({ name, accountId, className }: { name: string; accountId: string | null; className?: string }) {
  if (!accountId) return <span className={className}>{name}</span>;
  return (
    <button className={`author-link ${className ?? ""}`} onClick={() => openProfile(accountId)}>
      {name}
    </button>
  );
}
