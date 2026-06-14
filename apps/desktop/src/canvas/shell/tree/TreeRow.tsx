import { useSortable } from "@dnd-kit/sortable";
import type { DropMode, Node } from "./treeTypes";
import { TypeIcon } from "./TypeIcon";
import { IconChevronRight, IconCrosshair, IconEye, IconEyeOff, IconLink, IconLock, IconOpenCanvas, IconUnlink, IconUnlock } from "@/components/icons";

export function TreeRow({
  node,
  depth,
  openSet,
  setOpenSet,
  selectedIds,
  setSelectedId,
  sortable = false,
  onToggleVisible,
  onToggleLocked,
  canOpenNodeCanvas,
  onOpenNodeCanvas,
  showFocusButton,
  onFocusNode,
  onContextMenuNode,
  onGoToInstance,
  onDetachNode,
  dropTargetId,
  dropMode,
  dragActive,
}: {
  node: Node;
  depth: number;
  openSet: Set<string>;
  setOpenSet: (s: Set<string>) => void;
  selectedIds: ReadonlySet<string>;
  setSelectedId: (id: string | null) => void;
  sortable?: boolean;
  // Drag-and-drop drop indicator: the row whose id matches `dropTargetId` shows a
  // before/after insertion line or an "inside" nesting highlight per `dropMode`.
  dropTargetId?: string | null;
  dropMode?: DropMode;
  // True while any row in the tree is being dragged. Suppresses the imperative hover
  // background so it can't stomp the drop-target highlight.
  dragActive?: boolean;
  onToggleVisible?: (nodeId: string, visible: boolean) => void;
  onToggleLocked?: (nodeId: string, locked: boolean) => void;
  canOpenNodeCanvas?: (nodeId: string) => boolean;
  onOpenNodeCanvas?: (nodeId: string) => void;
  showFocusButton?: boolean;
  onFocusNode?: (nodeId: string) => void;
  onContextMenuNode?: (nodeId: string, x: number, y: number) => void;
  // Linked instance actions. onGoToInstance opens the master variant; onDetachNode
  // breaks the link, turning the instance into editable own content.
  onGoToInstance?: (variantId: string) => void;
  onDetachNode?: (nodeId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({ id: node.id, disabled: !sortable });
  const hasChildren = (node.children || []).length > 0;
  const isOpen = openSet.has(node.id);
  const isSelected = selectedIds.has(node.id);
  const visible = node.visible !== false;
  const locked = node.locked === true;
  const canOpenCanvas = Boolean(onOpenNodeCanvas && (canOpenNodeCanvas?.(node.id) ?? false));
  const canFocus = Boolean(showFocusButton && onFocusNode);
  const isLinked = node.linked === true;
  const isDropTarget = dropTargetId === node.id;
  const dropInside = isDropTarget && dropMode === "inside";
  const dropBefore = isDropTarget && dropMode === "before";
  const dropAfter = isDropTarget && dropMode === "after";
  const indicatorLeft = 6 + depth * 14;

  const baseColor = isLinked
    ? isSelected
      ? "#D9C9FF"
      : "#B69CFF"
    : isSelected
      ? "#FFFFFF"
      : "#CFCFCF";

  return (
    <>
      <div
        ref={setNodeRef}
        data-tree-node-id={node.id}
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
          if (!isSelected) setSelectedId(node.id);
          onContextMenuNode?.(node.id, e.clientX, e.clientY);
        }}
        onMouseEnter={(e) => {
          if (dragActive) return;
          if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.035)";
        }}
        onMouseLeave={(e) => {
          if (dragActive) return;
          if (!isSelected) e.currentTarget.style.background = "transparent";
        }}
        className="relative flex h-[30px] select-none items-center gap-1.5 pr-2.5 text-[13px]"
        style={{
          paddingLeft: 6 + depth * 14,
          color: baseColor,
          background: dropInside
            ? "rgba(182,156,255,0.14)"
            : isSelected
              ? "rgba(255,255,255,0.07)"
              : "transparent",
          boxShadow: dropInside ? "inset 0 0 0 1.5px #B69CFF" : undefined,
          cursor: "default",
          // The dragged row stays put (dimmed) — a DragOverlay ghost follows the
          // cursor instead, so the tree never reflows mid-drag.
          opacity: isDragging ? 0.4 : 1,
        }}
      >
        {dropBefore ? (
          <span
            className="pointer-events-none absolute right-1.5 top-0 z-[3] h-0.5 rounded-full bg-[#B69CFF]"
            style={{ left: indicatorLeft }}
          />
        ) : null}
        {dropAfter ? (
          <span
            className="pointer-events-none absolute bottom-0 right-1.5 z-[3] h-0.5 rounded-full bg-[#B69CFF]"
            style={{ left: indicatorLeft }}
          />
        ) : null}
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
            <IconChevronRight
              size={11} strokeWidth={2.4}
              className={isOpen ? "rotate-90 transition-transform duration-100" : "rotate-0 transition-transform duration-100"}
            />
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
        {canFocus ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocusNode?.(node.id);
            }}
            aria-label="Focus on canvas"
            title="Focus on canvas"
            className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent text-[#7A7A7A] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
            style={{ opacity: 0.72 }}
          >
            <IconCrosshair size={12} strokeWidth={1.8} />
          </button>
        ) : null}
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
            <IconOpenCanvas size={12} strokeWidth={1.8} />
          </button>
        ) : null}
        {isLinked && onGoToInstance && node.instanceVariantId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGoToInstance(node.instanceVariantId!);
            }}
            aria-label="Go to component"
            title="Go to component"
            className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent text-[#B69CFF] hover:bg-[#2A2A2A] hover:text-[#D9C9FF]"
            style={{ opacity: 0.85 }}
          >
            <IconLink size={12} strokeWidth={1.8} />
          </button>
        ) : null}
        {isLinked && onDetachNode ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDetachNode(node.id);
            }}
            aria-label="Detach instance"
            title="Detach instance"
            className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent text-[#B69CFF] hover:bg-[#2A2A2A] hover:text-[#D9C9FF]"
            style={{ opacity: 0.85 }}
          >
            <IconUnlink size={12} strokeWidth={1.8} />
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
              <IconLock size={11} strokeWidth={1.8} />
            ) : (
              <IconUnlock size={11} strokeWidth={1.8} />
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
              <IconEye size={12} strokeWidth={1.8} />
            ) : (
              <IconEyeOff size={12} strokeWidth={1.8} />
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
              selectedIds={selectedIds}
              setSelectedId={setSelectedId}
              sortable={sortable}
              onToggleVisible={onToggleVisible}
              onToggleLocked={onToggleLocked}
              canOpenNodeCanvas={canOpenNodeCanvas}
              onOpenNodeCanvas={onOpenNodeCanvas}
              showFocusButton={showFocusButton}
              onFocusNode={onFocusNode}
              onContextMenuNode={onContextMenuNode}
              onGoToInstance={onGoToInstance}
              onDetachNode={onDetachNode}
              dropTargetId={dropTargetId}
              dropMode={dropMode}
              dragActive={dragActive}
            />
          ))
        : null}
    </>
  );
}
