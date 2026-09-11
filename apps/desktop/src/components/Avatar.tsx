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

export default function Avatar({ name, avatarKey, size = 32, className }: { name: string; avatarKey: string; size?: number; className?: string }) {
  const key = isAvatarKey(avatarKey) ? avatarKey : DEFAULT_AVATAR_KEY;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
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
