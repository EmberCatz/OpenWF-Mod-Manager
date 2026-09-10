import { useState } from "react";
import { StarIcon } from "../icons";

// Red at 0, green at 5 — a quick-glance color cue on top of the star count.
function colorForRating(value: number): string {
  const hue = (Math.max(0, Math.min(5, value)) / 5) * 120;
  return `hsl(${hue}, 70%, 55%)`;
}

interface StarRatingProps {
  value: number; // 0-5, can be fractional for a display-only average
  interactive?: boolean;
  onRate?: (rating: number) => void;
  className?: string;
}

export default function StarRating({ value, interactive = false, onRate, className }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  return (
    <span className={`star-rating ${className ?? ""}`} style={{ color: colorForRating(display) }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="star"
          disabled={!interactive}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(null)}
          onClick={() => interactive && onRate?.(n)}
        >
          <StarIcon filled={n <= Math.round(display)} />
        </button>
      ))}
    </span>
  );
}
