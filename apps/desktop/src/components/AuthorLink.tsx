import { openProfile } from "../profileNav";

// A creator's display name, made clickable when there's a real account to
// send it to. `accountId` is exact for a mod's own author (Mod.ownerId,
// always present); comments only get a best-effort match (Comment.
// authorAccountId, server-resolved by name — see routes/mods.ts's GET
// .../comments) since anyone can type any name into the comment box. When
// there's no account id at all, this renders as plain (non-clickable) text
// instead of a dead link.
export default function AuthorLink({ name, accountId, className }: { name: string; accountId: string | null; className?: string }) {
  if (!accountId) return <span className={className}>{name}</span>;
  return (
    <button className={`author-link ${className ?? ""}`} onClick={() => openProfile(accountId)}>
      {name}
    </button>
  );
}
