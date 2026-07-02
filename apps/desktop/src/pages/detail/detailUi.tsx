import { useEffect, useState } from "react";
import { IconClose, IconFastEdit, IconSearch } from "@/components/icons";
import type { CmpKindFilter as ScreenCmpKindFilter } from "@/application/screen-detail/useScreenDetail";

// ── Shared UI helpers ─────────────────────────────────────────────────────────

export function SideTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ readonly id: T; readonly label: string; readonly count?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex shrink-0 gap-0.5 border-b border-[var(--border)] px-3.5">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={[
              "relative cursor-pointer border-0 bg-transparent px-3.5 py-3 text-[12px] font-medium",
              isActive ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {t.label}
            {t.count ? (
              <span className="ml-1.5 text-[10.5px] text-[var(--text-faint)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                {t.count}
              </span>
            ) : null}
            {isActive ? <span className="absolute -bottom-px left-3.5 right-3.5 h-0.5 rounded-[2px] bg-[var(--text)]" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function SideSearch({ query, onChange }: { query: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-[220px]">
      <IconSearch size={13} strokeWidth={1.7} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
      <input
        type="search"
        placeholder="Search..."
        value={query}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] w-full rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-[30px] pr-2.5 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
      />
    </div>
  );
}

export function SideKindFilter({ value, onChange }: { value: ScreenCmpKindFilter; onChange: (v: ScreenCmpKindFilter) => void }) {
  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label="Filter by type"
        value={value}
        onChange={(e) => onChange(e.target.value as ScreenCmpKindFilter)}
        className="h-[30px] cursor-pointer rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-2.5 pr-[26px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--text-muted)]"
        style={{ appearance: "none", WebkitAppearance: "none" as never }}
      >
        <option value="all">All</option>
        <option value="Layout">Layout</option>
        <option value="Atom">Atom</option>
        <option value="Section">Section</option>
        <option value="Pattern">Pattern</option>
        <option value="Overlay">Overlay</option>
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-[6px] w-[6px] -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-[var(--text-muted)]" />
    </div>
  );
}

export function EditableTitle({ value, label, onSave }: { value: string; label: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    setDraft(value);
    if (next && next !== value) onSave(next);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        className="mb-1.5 h-[32px] min-w-[260px] rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => { setDraft(value); setEditing(true); }}
      className="group/title mb-1.5 flex cursor-text items-center border-0 bg-transparent p-0 text-left text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]"
    >
      <span>{value}</span>
      <span className="ml-0 grid h-6 w-0 place-items-center overflow-hidden rounded-md border border-transparent text-[var(--text-faint)] opacity-0 transition-all group-hover/title:ml-2 group-hover/title:w-6 group-hover/title:border-[var(--border)] group-hover/title:opacity-100">
        <IconFastEdit size={12} strokeWidth={1.7} />
      </span>
    </button>
  );
}

// ── Side overlay panel (full-height overlay over the sidebar) ─────────────────

export function SideOverlayPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--surface)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
        <span className="text-[13px] font-semibold text-[var(--text)]">{title}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <IconClose size={11} strokeWidth={2} />
        </button>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
        {children}
      </div>
    </div>
  );
}
