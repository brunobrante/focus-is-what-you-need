import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Node } from "./treeTypes";
import { TypeIcon } from "./TypeIcon";

export function TreeRow({
  node,
  depth,
  openSet,
  setOpenSet,
  selectedId,
  setSelectedId,
  sortable = false,
  onToggleVisible,
  onToggleLocked,
  canOpenNodeCanvas,
  onOpenNodeCanvas,
  onContextMenuNode,
}: {
  node: Node;
  depth: number;
  openSet: Set<string>;
  setOpenSet: (s: Set<string>) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  sortable?: boolean;
  onToggleVisible?: (nodeId: string, visible: boolean) => void;
  onToggleLocked?: (nodeId: string, locked: boolean) => void;
  canOpenNodeCanvas?: (nodeId: string) => boolean;
  onOpenNodeCanvas?: (nodeId: string) => void;
  onContextMenuNode?: (nodeId: string, x: number, y: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id, disabled: !sortable });
  const hasChildren = (node.children || []).length > 0;
  const isOpen = openSet.has(node.id);
  const isSelected = selectedId === node.id;
  const visible = node.visible !== false;
  const locked = node.locked === true;
  const canOpenCanvas = Boolean(onOpenNodeCanvas && (canOpenNodeCanvas?.(node.id) ?? false));

  const baseColor = isSelected ? "#FFFFFF" : "#CFCFCF";

  return (
    <>
      <div
        ref={setNodeRef}
        {...(sortable ? attributes : {})}
        {...(sortable ? listeners : {})}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isOpen : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId(node.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedId(node.id);
          onContextMenuNode?.(node.id, e.clientX, e.clientY);
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.035)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = "transparent";
        }}
        className="relative flex h-[30px] select-none items-center gap-1.5 pr-2.5 text-[13px]"
        style={{
          paddingLeft: 6 + depth * 14,
          color: baseColor,
          background: isSelected ? "rgba(255,255,255,0.07)" : "transparent",
          cursor: "default",
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.55 : 1,
          zIndex: isDragging ? 2 : undefined,
        }}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (!hasChildren) return;
            const next = new Set(openSet);
            if (next.has(node.id)) next.delete(node.id);
            else next.add(node.id);
            setOpenSet(next);
          }}
          aria-hidden={!hasChildren}
          className="grid h-[30px] w-4 shrink-0 place-items-center text-[#7A7A7A]"
          style={{ cursor: hasChildren ? "pointer" : "default" }}
        >
          {hasChildren ? (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 100ms ease",
              }}
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          ) : null}
        </span>
        <span
          className="grid w-[18px] shrink-0 place-items-center"
          style={{ color: "#9A9A9A" }}
        >
          <TypeIcon type={node.type} hasChildren={hasChildren} />
        </span>
        <span
          className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            fontWeight: node.type === "frame" ? 500 : 400,
            letterSpacing: "0.05px",
            opacity: visible ? 1 : 0.5,
          }}
        >
          {node.name}
        </span>
        {canOpenCanvas ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenNodeCanvas?.(node.id);
            }}
            aria-label="Open component in canvas"
            title="Open component in canvas"
            className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent text-[#7A7A7A] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
            style={{ opacity: 0.72 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M9 9h6v6" />
              <path d="M15 9l-7 7" />
            </svg>
          </button>
        ) : null}
        {onToggleLocked ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLocked(node.id, !locked);
            }}
            aria-label={locked ? "Destravar" : "Travar"}
            className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent text-[#7A7A7A] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
            style={{ opacity: locked ? 1 : 0.55 }}
          >
            {locked ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 7.5-2" />
              </svg>
            )}
          </button>
        ) : null}
        {onToggleVisible ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisible(node.id, !visible);
            }}
            aria-label={visible ? "Ocultar" : "Mostrar"}
            className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent text-[#7A7A7A] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
            style={{ opacity: visible ? 0.55 : 1 }}
          >
            {visible ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a18.45 18.45 0 0 1-3.17 4.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <path d="M1 1l22 22" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      {hasChildren && isOpen
        ? node.children!.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              openSet={openSet}
              setOpenSet={setOpenSet}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              sortable={sortable}
              onToggleVisible={onToggleVisible}
              onToggleLocked={onToggleLocked}
              canOpenNodeCanvas={canOpenNodeCanvas}
              onOpenNodeCanvas={onOpenNodeCanvas}
              onContextMenuNode={onContextMenuNode}
            />
          ))
        : null}
    </>
  );
}
