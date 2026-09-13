import { useEffect, useState } from "react";
import { AVATAR_KEYS, DEFAULT_AVATAR_KEY, type AvatarKey } from "@openwf-mod-manager/shared";

// Fixed palette of solid-color circles, initialed with the account's name —
// "profile pictures" until real image upload/storage is worth building
// (see AVATAR_KEYS's docstring in shared/src/types.ts). The color itself is
// the whole "picture"; nothing here is ever a custom image.
export const AVATAR_COLORS: Record<AvatarKey, string> = {
  amber: "#e0a339",
  crimson: "#c94f4f",
  azure: "#3d7fd6",
  violet: "#8a5fd6",
  emerald: "#2e9e5b",
  slate: "#5a6472",
  rose: "#d6608f",
  cyan: "#3fb8c4",
};

function isAvatarKey(key: string): key is AvatarKey {
  return (AVATAR_KEYS as readonly string[]).includes(key);
}

// github.com/<username>.png redirects straight to the account's real
// avatar (avatars.githubusercontent.com) — no API call, no rate limit,
// works as a plain <img src>. Only the profile path's first segment is
// used, so a repo/org URL still resolves to *something* rather than being
// rejected; the ?size= param GitHub understands past the redirect keeps
// the request roughly proportioned to how large we're rendering it.
function githubAvatarUrl(githubUrl: string, size: number): string | null {
  try {
    const u = new URL(githubUrl);
    const username = u.pathname.split("/").filter(Boolean)[0];
    return username ? `https://github.com/${username}.png?size=${Math.max(32, size * 2)}` : null;
  } catch {
    return null;
  }
}

export default function Avatar({
  name,
  avatarKey,
  githubUrl,
  size = 32,
  className,
}: {
  name: string;
  avatarKey: string;
  githubUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const key = isAvatarKey(avatarKey) ? avatarKey : DEFAULT_AVATAR_KEY;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const [imgFailed, setImgFailed] = useState(false);
  // A link that just changed (typed a new one, cleared it) deserves a
  // fresh attempt rather than carrying over a failure from whatever URL
  // this instance had before.
  useEffect(() => setImgFailed(false), [githubUrl]);
  const imgUrl = githubUrl && !imgFailed ? githubAvatarUrl(githubUrl, size) : null;

  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt=""
        className={`avatar ${className ?? ""}`}
        style={{ width: size, height: size, fontSize: size * 0.5 }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      className={`avatar ${className ?? ""}`}
      style={{ width: size, height: size, background: AVATAR_COLORS[key], fontSize: size * 0.5 }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
