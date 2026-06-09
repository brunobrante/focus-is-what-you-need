import { useState, useEffect, useRef, type ReactNode } from "react";
import { ListFilter } from "lucide-react";

/**
 * FilterButton — pill button that toggles a dropdown panel with page-specific filters.
 *
 * Pass `activeCount` so the button reflects how many filters are active (inverted
 * colours + badge). Pass `children` for the dropdown content — use `FilterSection`
 * for each group of chip options.
 *
 * Use `align="right"` when the button is at the right edge of a toolbar so the
 * panel opens flush to the right instead of the left.
 */
export function FilterButton({
  activeCount = 0,
  align = "left",
  children,
}: {
  activeCount?: number;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = activeCount > 0;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Filters"
        className={[
          "relative inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors duration-[120ms]",
          open || isActive
            ? "border-[var(--text)] bg-[var(--text)] font-medium text-[var(--bg)]"
            : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
        ].join(" ")}
      >
        <ListFilter size={12} aria-hidden />
        Filters
        {isActive && (
          <span className="flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.2)] text-[9px] font-bold leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={[
            "absolute top-[calc(100%+6px)] z-50 flex w-[240px] flex-col gap-4 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * FilterSection — a labelled group of pill chips inside a FilterButton dropdown.
 *
 * Each option is `{ value: string; label: string }`. The active option renders
 * with inverted colours; all others render as outlined muted chips.
 */
export function FilterSection({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              "h-[26px] cursor-pointer rounded-full border px-3 text-[11px] font-medium transition-colors duration-[100ms]",
              value === opt.value
                ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
