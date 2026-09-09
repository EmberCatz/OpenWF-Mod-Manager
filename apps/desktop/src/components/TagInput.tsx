import { useState } from "react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[]; // existing tags across other mods, for autocomplete
}

// Notion-style multi-select: type free text, Enter/comma commits it as a
// chip, Backspace on an empty input pops the last chip, and typing shows
// a filtered dropdown of tags already used elsewhere (from `suggestions`)
// so people converge on the same spelling instead of fragmenting
// ("qol" vs "QoL" vs "Qol") — still just a suggestion, not a fixed list.
export default function TagInput({ tags, onChange, suggestions = [] }: TagInputProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  function commit(raw: string) {
    const t = raw.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(text);
    } else if (e.key === "Backspace" && text === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  const query = text.trim().toLowerCase();
  const filteredSuggestions = query
    ? suggestions.filter((s) => s.toLowerCase().includes(query) && !tags.includes(s)).slice(0, 6)
    : [];

  return (
    <div className="tag-input">
      <div className="tag-input__chips">
        {tags.map((t) => (
          <span key={t} className="tag-chip">
            {t}
            <button type="button" className="tag-chip__remove" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="tag-input__field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={tags.length === 0 ? "Add tags…" : ""}
        />
      </div>
      {focused && filteredSuggestions.length > 0 && (
        <div className="tag-input__suggestions">
          {filteredSuggestions.map((s) => (
            <button type="button" key={s} onClick={() => commit(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
