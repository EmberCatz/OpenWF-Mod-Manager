import { useEffect, useRef, useState } from "react";

interface ClampedTextProps {
  text: string;
  lines?: number;
  className?: string;
}

// Clamps text to a fixed number of lines with a Show more/Show less
// toggle — the toggle only appears if the text actually overflows at that
// clamp, measured via scrollHeight rather than a guessed character count.
export default function ClampedText({ text, lines = 3, className }: ClampedTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={className}
        style={
          expanded
            ? undefined
            : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }
        }
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button className="clamped-text__toggle" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
