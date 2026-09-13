import { useState } from "react";

interface ModOption {
  id: string;
  name: string;
}

interface ModPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  options: ModOption[]; // candidate mods to pick from — see Upload.tsx's existingMods
  excludeId?: string; // this mod's own id, so it can't reference itself
  placeholder?: string;
}

// Same chip-input interaction as TagInput, but backed by a fixed set of
// known mods (autocomplete by name, stored as ids) rather than free text —
// used for author-declared requires/conflicts (TODO.md § Ideas).
export default function ModPicker({ selectedIds, onChange, options, excludeId, placeholder }: ModPickerProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const nameById = new Map(options.map((o) => [o.id, o.name]));

  function commit(id: string) {
    if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
    setText("");
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  const query = text.trim().toLowerCase();
  const filtered = query
    ? options
        .filter((o) => o.id !== excludeId && !selectedIds.includes(o.id) && o.name.toLowerCase().includes(query))
        .slice(0, 8)
    : [];

  return (
    <div className="tag-input">
      <div className="tag-input__chips">
        {selectedIds.map((id) => (
          <span key={id} className="tag-chip">
            {nameById.get(id) ?? id}
            <button type="button" className="tag-chip__remove" onClick={() => remove(id)} aria-label={`Remove ${nameById.get(id) ?? id}`}>
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="tag-input__field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={selectedIds.length === 0 ? (placeholder ?? "Search mods…") : ""}
        />
      </div>
      {focused && filtered.length > 0 && (
        <div className="tag-input__suggestions">
          {filtered.map((o) => (
            <button type="button" key={o.id} onClick={() => commit(o.id)}>
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
