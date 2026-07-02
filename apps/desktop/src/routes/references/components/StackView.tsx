import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { ReferenceCard } from "@/components/references/ReferenceCard";
import type { ReferenceStackData } from "@/lib/references/stackTypes";
import { stackRootIds } from "@/lib/references/stackTypes";
import type { StackTreeNode } from "../types";
import type { StackRootEntry } from "../lib/stackHelpers";

export function StackCompositeView({
  data, urls, selectedId, onSelect, rootId = null,
}: {
  data: ReferenceStackData;
  urls: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  rootId?: string | null;
}) {
  const rootIds = stackRootIds(data);
  const scopedRoot = rootId ? data.roots?.find((r) => r.id === rootId) : undefined;
  const defaultRootId = rootId ?? data.roots?.find((r) => r.isDefault)?.id ?? data.rootComponentId;
  const bgUrl = defaultRootId ? urls[defaultRootId] : undefined;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const frame = scopedRoot
    ? { x: scopedRoot.box.x, y: scopedRoot.box.y, w: scopedRoot.box.w, h: scopedRoot.box.h }
    : { x: 0, y: 0, w: data.original.w, h: data.original.h };

  const overlayCuts = data.components.filter(
    (cut) => !rootIds.has(cut.id) && (rootId ? cut.rootId === rootId : true),
  );

  return (
    <div className="relative leading-[0]" onClick={() => onSelect(null)}>
      {bgUrl ? (
        <img
          src={bgUrl}
          alt="original"
          className="block max-h-[calc(100vh-220px)] max-w-full rounded-[10px]"
          draggable={false}
        />
      ) : (
        <div
          className="rounded-[10px] bg-[var(--surface)]"
          style={{ width: frame.w, height: frame.h, maxWidth: "100%", maxHeight: "calc(100vh - 220px)" }}
        />
      )}
      {overlayCuts.map((cut) => {
        const isSelected = cut.id === selectedId;
        const isHovered = cut.id === hoveredId;
        const cutUrl = urls[cut.id];
        return (
          <button
            key={cut.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(cut.id); }}
            onMouseEnter={() => setHoveredId(cut.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="absolute cursor-pointer bg-transparent p-0"
            style={{
              left: `${((cut.box.x - frame.x) / frame.w) * 100}%`,
              top: `${((cut.box.y - frame.y) / frame.h) * 100}%`,
              width: `${(cut.box.w / frame.w) * 100}%`,
              height: `${(cut.box.h / frame.h) * 100}%`,
              boxSizing: "border-box",
              outline: isSelected
                ? "2px solid #89C4FF"
                : isHovered
                ? "2px solid rgba(137,196,255,0.7)"
                : "none",
              outlineOffset: isSelected ? "-2px" : "-1.5px",
            }}
          >
            {cutUrl && (
              <img
                src={cutUrl}
                alt={cut.name}
                className="block h-full w-full"
                draggable={false}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function StackRootsGallery({
  roots, urls, onOpen,
}: {
  roots: StackRootEntry[];
  urls: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="min-h-0 max-h-full w-full overflow-y-auto">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {roots.map((root) => (
          <ReferenceCard
            key={root.id}
            kind="stack-root"
            thumbnailUrl={urls[root.id]}
            title={root.name}
            badge="Stack"
            onClick={() => onOpen(root.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function StackTreeRows({
  node, selectedId, onSelect, onIsolate, onRename,
}: {
  node: StackTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onIsolate?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
}) {
  const id = node.component.id;
  const active = selectedId === id;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.component.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(node.component.name); }, [node.component.name]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== node.component.name) onRename?.(id, trimmed);
    else setDraft(node.component.name);
  }

  return (
    <>
      <div
        className={[
          "group mb-1 flex min-h-8 w-full items-center rounded-[7px] border transition-colors",
          active
            ? "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]"
            : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => onSelect(id)}
          className="flex min-h-8 flex-1 cursor-pointer items-center gap-2 bg-transparent py-1.5 text-left"
          style={{ paddingLeft: `${8 + node.depth * 14}px` }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-55" />
          <span className="min-w-0 flex-1">
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commit(); }
                  if (e.key === "Escape") { setDraft(node.component.name); setEditing(false); }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className="block w-full rounded bg-[var(--surface-hover)] px-1 text-[11.5px] font-medium text-[var(--text)] outline-none"
                autoFocus
              />
            ) : (
              <span
                className="block truncate text-[11.5px] font-medium"
                onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
              >
                {node.component.name}
              </span>
            )}
            <span className="block text-[10px] tabular-nums text-[var(--text-faint)]">
              {Math.round(node.component.box.w)} × {Math.round(node.component.box.h)}
            </span>
          </span>
        </button>
        <button
          type="button"
          title="View in isolation"
          onClick={() => onIsolate?.(id)}
          className="mr-1 grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] bg-transparent opacity-0 transition-opacity hover:bg-[var(--surface-hover)] group-hover:opacity-100 text-current"
        >
          <Eye size={11} />
        </button>
      </div>
      {node.children.map((child) => (
        <StackTreeRows
          key={child.component.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
          onIsolate={onIsolate}
          onRename={onRename}
        />
      ))}
    </>
  );
}
