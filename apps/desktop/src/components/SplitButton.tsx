import { useEffect, useRef, useState } from "react";

interface MenuItem {
  label: React.ReactNode;
  onClick: () => void;
}

interface SplitButtonProps {
  mainLabel: React.ReactNode;
  mainClassName?: string;
  onMain: () => void;
  disabled?: boolean;
  menuItems: MenuItem[];
}

// A full-width primary action with an optional dropdown of secondary
// actions (currently just "Reinstall") behind a small chevron — used by
// the grid-view mod cards, where there's only room for one button.
export default function SplitButton({ mainLabel, mainClassName, onMain, disabled, menuItems }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const dangerVariant = mainClassName?.includes("button--danger") ?? false;

  return (
    <div className={`split-button ${dangerVariant ? "split-button--danger" : ""}`} ref={ref}>
      <button className={`split-button__main ${mainClassName ?? ""}`} disabled={disabled} onClick={onMain}>
        {mainLabel}
      </button>
      {menuItems.length > 0 && (
        <>
          <button
            className="split-button__toggle"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            aria-label="More options"
          >
            ▾
          </button>
          {open && (
            <div className="split-button__menu">
              {menuItems.map((item, i) => (
                <button
                  key={i}
                  className="split-button__menu-item"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
