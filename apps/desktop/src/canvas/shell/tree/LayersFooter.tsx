import { useEffect, useRef, useState } from "react";

import {
  IconClose,
  IconCollapse,
  IconExpand,
  IconLayers,
  IconSearch,
} from "@/components/icons";
import { LAYER_FILTER_KINDS } from "./treeHelpers";

export type ExpandMode = "all" | "second" | "collapsed";

/** Label shown on the removable filter chips. */
function kindLabel(kind: string): string {
  return LAYER_FILTER_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** Icon + tooltip describing what clicking the expand button does next. */
function nextExpand(mode: ExpandMode): {
  next: ExpandMode;
  Icon: typeof IconExpand;
  title: string;
} {
  const order: ExpandMode[] = ["all", "second", "collapsed"];
  const next = order[(order.indexOf(mode) + 1) % order.length];
  if (next === "all") {
    return { next, Icon: IconExpand, title: "Expandir toda a árvore" };
  }
  if (next === "second") {
    return { next, Icon: IconLayers, title: "Expandir até a primeira hierarquia" };
  }
  return { next, Icon: IconCollapse, title: "Fechar a árvore" };
}

export function LayersFooter({
  query,
  onQueryChange,
  kinds,
  onToggleKind,
  onRemoveKind,
  expandMode,
  onCycleExpand,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  kinds: ReadonlySet<string>;
  onToggleKind: (kind: string) => void;
  onRemoveKind: (kind: string) => void;
  expandMode: ExpandMode;
  onCycleExpand: () => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [filterOpen]);

  const hasQuery = query.trim().length > 0;
  const hasChips = hasQuery || kinds.size > 0;
  const expand = nextExpand(expandMode);

  return (
    <div className="shrink-0 border-t border-[#2C2C2C] bg-[#141414]">
      {hasChips ? (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2">
          {hasQuery ? (
            <Chip label={`"${query.trim()}"`} onRemove={() => onQueryChange("")} />
          ) : null}
          {[...kinds].map((kind) => (
            <Chip key={kind} label={kindLabel(kind)} onRemove={() => onRemoveKind(kind)} />
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5 p-2">
        <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2">
          <IconSearch size={12} strokeWidth={1.8} className="shrink-0 text-[#7A7A7A]" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar camadas"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#F2F2F2] outline-none placeholder:text-[#6B6B6B]"
          />
        </div>

        <button
          type="button"
          onClick={onCycleExpand}
          aria-label={expand.title}
          title={expand.title}
          className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md border border-[#2C2C2C] bg-[#1E1E1E] text-[#9A9A9A] transition-colors hover:bg-[#2A2A2A] hover:text-[#F2F2F2]"
        >
          <expand.Icon size={13} strokeWidth={1.8} />
        </button>

        <div ref={filterRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-label="Filtrar camadas"
            title="Filtrar camadas"
            className={[
              "relative grid h-7 w-7 cursor-pointer place-items-center rounded-md border transition-colors",
              filterOpen || kinds.size > 0
                ? "border-[#3A3A3A] bg-[#2A2A2A] text-[#F2F2F2]"
                : "border-[#2C2C2C] bg-[#1E1E1E] text-[#9A9A9A] hover:bg-[#2A2A2A] hover:text-[#F2F2F2]",
            ].join(" ")}
          >
            <IconListFilter />
            {kinds.size > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#B69CFF] px-[3px] text-[8px] font-bold leading-none text-[#1A1A1A]">
                {kinds.size}
              </span>
            ) : null}
          </button>

          {filterOpen ? (
            <div
              className="absolute bottom-[calc(100%+6px)] right-0 z-[20] w-[200px] overflow-hidden rounded-[10px] border border-[#2C2C2C] bg-[#1A1A1A] p-3"
              style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}
            >
              <p className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-[#6B6B6B]">
                Filtrar por tipo
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LAYER_FILTER_KINDS.map((opt) => {
                  const active = kinds.has(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onToggleKind(opt.value)}
                      className={[
                        "h-[26px] cursor-pointer rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                        active
                          ? "border-[#F2F2F2] bg-[#F2F2F2] text-[#1A1A1A]"
                          : "border-[#2C2C2C] bg-transparent text-[#9A9A9A] hover:border-[#3A3A3A] hover:text-[#F2F2F2]",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full border border-[#2C2C2C] bg-[#1E1E1E] pl-2.5 pr-1 text-[11px] text-[#CFCFCF]">
      <span className="max-w-[120px] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        className="grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-full text-[#7A7A7A] hover:bg-[#2A2A2A] hover:text-[#F2F2F2]"
      >
        <IconClose size={9} strokeWidth={2} />
      </button>
    </span>
  );
}

function IconListFilter() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}
