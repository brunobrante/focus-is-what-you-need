import { useEffect, useMemo, useRef, useState } from "react";

type Kind = "component" | "page" | "frame" | "action";
type Item = { id: string; kind: Kind; name: string; subtitle: string };

const ITEMS: Item[] = [
  { id: "c-header", kind: "component", name: "Header", subtitle: "Component · global" },
  { id: "c-buttons", kind: "component", name: "Buttons", subtitle: "Component · primary, secondary, ghost" },
  { id: "c-hero", kind: "component", name: "Hero", subtitle: "Component · landing" },
  { id: "c-card", kind: "component", name: "Card", subtitle: "Component · variations A/B" },
  { id: "c-modal", kind: "component", name: "Modal", subtitle: "Component · confirm, alert" },
  { id: "c-input", kind: "component", name: "Input", subtitle: "Component · text, search" },
  { id: "p-landing", kind: "page", name: "Landing", subtitle: "Page · home" },
  { id: "p-gallery", kind: "page", name: "Gallery", subtitle: "Page · projects" },
  { id: "p-checkout", kind: "page", name: "Checkout", subtitle: "Page · checkout flow" },
  { id: "f-mobile-home", kind: "frame", name: "Mobile · Home", subtitle: "Frame · 9:16" },
  { id: "f-tablet-grid", kind: "frame", name: "Tablet · Grid", subtitle: "Frame · 4:3" },
  { id: "a-new-component", kind: "action", name: "New component", subtitle: "Action · create" },
  { id: "a-new-page", kind: "action", name: "New page", subtitle: "Action · create" },
  { id: "a-export", kind: "action", name: "Export project", subtitle: "Action" },
];

const KIND_META: Record<Kind, { label: string; color: string; icon: React.ReactNode }> = {
  component: {
    label: "Component",
    color: "#D7C2FF",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l4 4-4 4-4-4 4-4z" />
        <path d="M12 13l4 4-4 4-4-4 4-4z" />
      </svg>
    ),
  },
  page: {
    label: "Page",
    color: "#9DD0FF",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
        <path d="M14 3v6h6" />
      </svg>
    ),
  },
  frame: {
    label: "Frame",
    color: "#CFCFCF",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 3v18" />
      </svg>
    ),
  },
  action: {
    label: "Action",
    color: "#9AE6B4",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
};

function fuzzyScore(query: string, name: string): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase();
  if (!q) return 1;
  if (n.startsWith(q)) return 100 - n.length;
  const idx = n.indexOf(q);
  if (idx >= 0) return 50 - idx;
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi++;
  }
  return qi === q.length ? 10 - (n.length - q.length) : -1;
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    return ITEMS.map((item) => ({ item, score: fuzzyScore(query, item.name) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((r) => r.item);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, results.length]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="fixed inset-0 z-[50] flex justify-center items-start bg-black/55 pt-[14vh] backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[min(640px,90vw)] flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#161616]"
        style={{
          boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px rgba(0,0,0,0.6), 0 6px 18px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-[#2C2C2C] px-3.5 py-3">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="text-[var(--text-faint)]"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Search components, pages, frames, actions…"
            className="h-7 flex-1 border-0 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <span className="rounded border border-[#2C2C2C] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-faint)]">
            ESC
          </span>
        </div>

        <div className="flex max-h-[52vh] flex-col overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-[var(--text-faint)]">
              Nada encontrado.
            </div>
          ) : (
            results.map((item, i) => {
              const meta = KIND_META[item.kind];
              const active = i === activeIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={onClose}
                  className={[
                    "flex cursor-pointer items-center gap-2.5 border-0 px-3.5 py-2.5 text-left",
                    active ? "bg-[#2A2A2A]" : "bg-transparent",
                  ].join(" ")}
                >
                  <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md border border-[#2C2C2C] bg-[#1E1E1E]" style={{ color: meta.color }}>
                    {meta.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-medium text-[var(--text)]">{item.name}</span>
                    <span className="truncate text-[11.5px] text-[var(--text-muted)]">{item.subtitle}</span>
                  </span>
                  <span
                    className="rounded-full border px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.4px]"
                    style={{ borderColor: "rgba(255,255,255,0.08)", color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[#2C2C2C] px-3.5 py-2 text-[11px] text-[var(--text-faint)]">
          <span>↑ ↓ navegar · ↵ abrir</span>
          <span className="font-mono">⌘ K</span>
        </footer>
      </div>
    </div>
  );
}

export function SearchToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search"
      className="grid h-6 w-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[#2A2A2A] hover:text-[var(--text)]"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </button>
  );
}
