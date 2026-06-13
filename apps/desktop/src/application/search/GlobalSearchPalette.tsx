import { useEffect, useMemo, useRef, useState } from "react";

import {
  IconDiamond,
  IconFolder,
  IconImage,
  IconLayers,
  IconLightning,
  IconScreen,
  IconSearch,
} from "@/components/icons";
import type { SearchItem, SearchItemKind, SearchScope } from "@/domain/search/searchTypes";
import { useSearch } from "./SearchProvider";

const KIND_META: Record<SearchItemKind, { label: string; color: string; icon: React.ReactNode }> = {
  element: { label: "Element", color: "#CFCFCF", icon: <IconLayers size={13} strokeWidth={1.7} /> },
  screen: { label: "Screen", color: "#9DD0FF", icon: <IconScreen size={13} strokeWidth={1.7} /> },
  component: { label: "Component", color: "#D7C2FF", icon: <IconDiamond size={13} strokeWidth={1.7} /> },
  reference: { label: "Reference", color: "#9AE6B4", icon: <IconImage size={13} strokeWidth={1.7} /> },
  project: { label: "Project", color: "#FFD79A", icon: <IconFolder size={13} strokeWidth={1.7} /> },
  command: { label: "Command", color: "#9AE6B4", icon: <IconLightning size={13} strokeWidth={1.7} /> },
};

// Scopes are ranked per active location: the current scope first, then the
// scopes most likely to be useful from there. The boost is large enough to keep
// locally-relevant results above fuzzy matches from other scopes.
const SCOPE_ORDER: Record<SearchScope, SearchScope[]> = {
  canvas: ["canvas", "project", "workspace"],
  project: ["project", "workspace", "canvas"],
  workspace: ["workspace", "project", "canvas"],
};

function scopeBoost(itemScope: SearchScope, activeScope: SearchScope): number {
  const order = SCOPE_ORDER[activeScope];
  const index = order.indexOf(itemScope);
  return (order.length - (index < 0 ? order.length : index)) * 1000;
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const n = text.toLowerCase();
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

/** Best score across the item's name and any keywords. */
function itemScore(query: string, item: SearchItem): number {
  let best = fuzzyScore(query, item.name);
  for (const keyword of item.keywords ?? []) {
    best = Math.max(best, fuzzyScore(query, keyword));
  }
  return best;
}

export function GlobalSearchPalette() {
  const { isOpen, query, setQuery, close, sources, activeScope } = useSearch();
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isCommandMode = query.startsWith(">");
  const effectiveQuery = isCommandMode ? query.slice(1).trimStart() : query;

  useEffect(() => {
    if (!isOpen) return;
    setActiveIdx(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [isOpen]);

  const results = useMemo(() => {
    if (!isOpen) return [];
    const targetMode = isCommandMode ? "command" : "search";
    const pool: SearchItem[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
      for (const item of source()) {
        if ((item.mode ?? "search") !== targetMode) continue;
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        pool.push(item);
      }
    }
    return pool
      .map((item) => ({ item, score: itemScore(effectiveQuery, item) }))
      .filter((r) => r.score >= 0)
      .sort(
        (a, b) =>
          scopeBoost(b.item.scope, activeScope) +
          b.score -
          (scopeBoost(a.item.scope, activeScope) + a.score),
      )
      .slice(0, 20)
      .map((r) => r.item);
  }, [isOpen, sources, effectiveQuery, isCommandMode, activeScope]);

  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = results[activeIdx];
        if (item) {
          item.run();
          close();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, results, activeIdx, close]);

  useEffect(() => {
    const node = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!isOpen) return null;

  const placeholder = isCommandMode
    ? "Run a command…"
    : "Search elements, screens, components, projects…  (type > for commands)";

  return (
    <div
      role="dialog"
      aria-modal
      onClick={close}
      className="fixed inset-0 z-[80] flex justify-center items-start bg-black/55 pt-[14vh] backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[min(640px,90vw)] flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#161616]"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px rgba(0,0,0,0.6), 0 6px 18px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-[#2C2C2C] px-3.5 py-3">
          {isCommandMode ? (
            <span className="font-mono text-[14px] font-semibold text-[#9AE6B4]">›</span>
          ) : (
            <IconSearch size={14} strokeWidth={1.8} className="text-[var(--text-faint)]" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder={placeholder}
            className="h-7 flex-1 border-0 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <span className="rounded border border-[#2C2C2C] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-faint)]">
            ESC
          </span>
        </div>

        <div ref={listRef} className="flex max-h-[52vh] flex-col overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-[var(--text-faint)]">
              {isCommandMode ? "No matching command." : "Nothing found."}
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
                  onClick={() => {
                    item.run();
                    close();
                  }}
                  className={[
                    "flex cursor-pointer items-center gap-2.5 border-0 px-3.5 py-2.5 text-left",
                    active ? "bg-[#2A2A2A]" : "bg-transparent",
                  ].join(" ")}
                >
                  <span
                    className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md border border-[#2C2C2C] bg-[#1E1E1E]"
                    style={{ color: meta.color }}
                  >
                    {meta.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-medium text-[var(--text)]">{item.name}</span>
                    {item.subtitle && (
                      <span className="truncate text-[11.5px] text-[var(--text-muted)]">{item.subtitle}</span>
                    )}
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
          <span>↑ ↓ navigate · ↵ open · › commands</span>
          <span className="font-mono">⌘⇧P</span>
        </footer>
      </div>
    </div>
  );
}
