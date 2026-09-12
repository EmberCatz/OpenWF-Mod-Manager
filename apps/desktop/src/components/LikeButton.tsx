import { HeartIcon } from "../icons";

interface LikeButtonProps {
  liked: boolean;
  count: number;
  onToggle: () => void;
  size?: "sm" | "md";
  className?: string;
}

// Red outline when unliked, solid filled red when liked — used both as the
// interactive control (ModDetail) and, at a smaller size, directly on
// Browse's cards (see likedMods.ts for how the card's fill state stays in
// sync without a request per card).
export default function LikeButton({ liked, count, onToggle, size = "md", className }: LikeButtonProps) {
  return (
    <button
      type="button"
      className={`like-button like-button--${size} ${liked ? "is-liked" : ""} ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={liked ? "Liked — click to unlike" : "Click to like"}
    >
      <HeartIcon filled={liked} className="like-button__icon" />
      <span className="like-button__count">{count}</span>
    </button>
  );
}
