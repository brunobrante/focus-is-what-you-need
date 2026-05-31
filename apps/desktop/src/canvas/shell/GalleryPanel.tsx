import { useMemo, useState, type ReactNode } from "react";

type DraftKind = "frame" | "image";

type Draft = {
  id: string;
  name: string;
  kind: DraftKind;
  tone: string;
  w: number;
  h: number;
  updated: string;
};

const MOCK_DRAFTS: Draft[] = [
  { id: "d-01", name: "Hero · v3", kind: "frame", tone: "#2A2440", w: 16, h: 10, updated: "agora" },
  { id: "d-02", name: "Onboarding flow", kind: "frame", tone: "#1F2E2A", w: 16, h: 10, updated: "12 min" },
  { id: "d-03", name: "Card · Variation A", kind: "image", tone: "#3A2A22", w: 4, h: 5, updated: "1 h" },
  { id: "d-04", name: "Card · Variation B", kind: "image", tone: "#22303A", w: 4, h: 5, updated: "1 h" },
  { id: "d-05", name: "Wireframe — checkout", kind: "frame", tone: "#2C2C2C", w: 16, h: 10, updated: "yesterday" },
  { id: "d-06", name: "Button · States", kind: "image", tone: "#2E2842", w: 5, h: 3, updated: "yesterday" },
  { id: "d-07", name: "Empty state", kind: "image", tone: "#262626", w: 4, h: 5, updated: "2 d" },
  { id: "d-08", name: "Mobile · home", kind: "frame", tone: "#1E2A38", w: 9, h: 16, updated: "3 d" },
  { id: "d-09", name: "Typography Exploration", kind: "image", tone: "#1E1E1E", w: 16, h: 9, updated: "4 d" },
  { id: "d-10", name: "Modal · confirm", kind: "frame", tone: "#332026", w: 4, h: 3, updated: "5 d" },
];

type Filter = "all" | DraftKind;

export function GalleryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [active, setActive] = useState<Draft | null>(null);

  const drafts = useMemo(() => {
    let list = MOCK_DRAFTS;
    if (filter !== "all") list = list.filter((d) => d.kind === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    return list;
  }, [query, filter]);

  if (!open) return null;

  return (
    <aside
      aria-label="Galeria"
      className="pointer-events-auto flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] text-[#F2F2F2]"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
      {/* Header (32px tall) */}
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-[#2C2C2C] bg-[#101010] pl-3 pr-2">
        <span
          className="text-[10.5px] font-semibold uppercase text-[#9A9A9A]"
          style={{ letterSpacing: "1px" }}
        >
          {active ? "Item" : "Galeria"}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[10.5px] text-[#6B6B6B]"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {active ? active.id : drafts.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close gallery"
            className="grid h-[22px] w-[22px] cursor-pointer place-items-center rounded-[5px] border border-[#2C2C2C] bg-transparent text-[#9A9A9A] hover:bg-[#2A2A2A] hover:text-[var(--text)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      {active ? (
        <GalleryDetail draft={active} onBack={() => setActive(null)} />
      ) : (
        <>
          {/* Search */}
          <div className="px-2.5 pb-1.5 pt-2.5">
            <div className="flex h-7 items-center gap-1.5 rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#7A7A7A"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="flex-1 border-0 bg-transparent text-[12px] text-[#F2F2F2] outline-none placeholder:text-[#6B6B6B]"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-1 px-2.5 pb-2.5">
            {(
              [
                { id: "all", label: "All" },
                { id: "frame", label: "Frames" },
                { id: "image", label: "Images" },
              ] as Array<{ id: Filter; label: string }>
            ).map((f) => {
              const isActive = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className="h-6 flex-1 cursor-pointer rounded-[5px] border text-[10.5px]"
                  style={{
                    background: isActive ? "#2A2A2A" : "transparent",
                    borderColor: isActive ? "#3A3A3A" : "#2C2C2C",
                    color: isActive ? "#F2F2F2" : "#9A9A9A",
                    letterSpacing: "0.3px",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-3 pt-0.5">
            {drafts.length === 0 ? (
              <div
                className="px-2 py-8 text-center text-[11.5px] text-[#6B6B6B]"
                style={{ letterSpacing: "0.2px" }}
              >
                No items.
              </div>
            ) : (
              <div
                className="grid min-w-0 gap-2.5"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}
              >
                {drafts.map((d) => (
                  <GalleryCard key={d.id} draft={d} onOpen={setActive} />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex shrink-0 items-center justify-between border-t border-[#2C2C2C] px-3 py-2 text-[10.5px] text-[#6B6B6B]"
            style={{ letterSpacing: "0.3px" }}
          >
            <span>{MOCK_DRAFTS.length} no total</span>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[10.5px] text-[#9A9A9A]"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              novo
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function GalleryCard({ draft, onOpen }: { draft: Draft; onOpen: (d: Draft) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onOpen(draft)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={draft.name}
      className="flex min-w-0 cursor-pointer flex-col gap-1.5 border-0 bg-transparent p-0 text-left text-inherit"
    >
      <div
        className="w-full rounded-md p-1 transition-[border-color,transform] duration-[120ms]"
        style={{
          aspectRatio: `${draft.w} / ${draft.h}`,
          border: `1px solid ${hover ? "#4A4A4A" : "#2C2C2C"}`,
          background: "#0F0F10",
          transform: hover ? "translateY(-1px)" : "translateY(0)",
          boxShadow: hover ? "0 6px 16px rgba(0,0,0,0.45)" : "none",
        }}
      >
        <ThumbPlaceholder tone={draft.tone} label={draft.id} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 px-0.5">
        <span className="shrink-0 text-[#7A7A7A]">
          <DraftIcon kind={draft.kind} />
        </span>
        <span className="flex-1 truncate text-[11.5px] text-[#CFCFCF]">{draft.name}</span>
        <span
          className="shrink-0 text-[10px] text-[#6B6B6B]"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {draft.updated}
        </span>
      </div>
    </button>
  );
}

function GalleryDetail({ draft, onBack }: { draft: Draft; onBack: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sub-header with back */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#2C2C2C] px-3 pb-2 pt-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md border border-[#2C2C2C] bg-transparent text-[#CFCFCF]"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <span className="shrink-0 text-[#9A9A9A]">
          <DraftIcon kind={draft.kind} />
        </span>
        <span className="flex-1 truncate text-[12.5px] font-medium text-[#F2F2F2]">{draft.name}</span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        <div
          className="w-full rounded-lg border border-[#2C2C2C] bg-[#0F0F10] p-1.5"
          style={{ aspectRatio: `${draft.w} / ${draft.h}` }}
        >
          <ThumbPlaceholder tone={draft.tone} label={`${draft.id} · ${draft.w}:${draft.h}`} large />
        </div>

        {/* Metadata box */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] px-3 py-2.5 text-[11.5px] text-[#CFCFCF]">
          <Meta label="Type" value={draft.kind === "frame" ? "Frame" : "Image"} />
          <Meta label="Ratio" value={`${draft.w} : ${draft.h}`} />
          <Meta label="Atualizado" value={draft.updated} />
          <Meta label="ID" value={draft.id} mono />
        </div>

        {/* Actions */}
        <div className="flex gap-1.5">
          <SidebarBtn primary>Abrir no canvas</SidebarBtn>
          <SidebarBtn>Duplicar</SidebarBtn>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span
        className="text-[#7A7A7A]"
        style={{ letterSpacing: "0.2px" }}
      >
        {label}
      </span>
      <span
        className="text-[#F2F2F2]"
        style={{
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SidebarBtn({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      className="h-[30px] flex-1 cursor-pointer rounded-md border text-[11.5px] font-medium"
      style={{
        background: primary ? "#F2F2F2" : "transparent",
        borderColor: primary ? "#F2F2F2" : "#2C2C2C",
        color: primary ? "#0F0F10" : "#CFCFCF",
        letterSpacing: "0.2px",
      }}
    >
      {children}
    </button>
  );
}

function DraftIcon({ kind }: { kind: DraftKind }) {
  const common = {
    width: 11,
    height: 11,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "frame") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 3v18" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function ThumbPlaceholder({
  tone,
  label,
  large = false,
}: {
  tone: string;
  label: string;
  large?: boolean;
}) {
  return (
    <div
      className="relative grid h-full w-full place-items-center overflow-hidden"
      style={{
        background: tone,
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 8px)",
        borderRadius: large ? 6 : 4,
      }}
    >
      <span
        className="max-w-[85%] truncate px-2 text-center"
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: large ? 11 : 9.5,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.4px",
          textTransform: "lowercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function GalleryToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  if (open) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open gallery"
      className="inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-lg border border-[#2C2C2C] bg-[#1E1E1E] px-3 text-[13px] font-medium text-[#CFCFCF] transition-colors hover:bg-[#2A2A2A] hover:text-[var(--text)]"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 3v18" />
      </svg>
      Galeria
    </button>
  );
}

export function FloatingToggle({
  onClick,
  aria,
  children,
}: {
  onClick: () => void;
  aria: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-lg border border-[#2C2C2C] bg-[#1E1E1E] px-3 text-[13px] font-medium text-[#CFCFCF] transition-colors hover:bg-[#2A2A2A] hover:text-[var(--text)]"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)" }}
    >
      {children}
    </button>
  );
}
