import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { constrainAll } from "@/lib/editor/actions";
import { CANVAS_DOCUMENT_SAVED_EVENT, DRAFTS_CANVAS_STORAGE_KEY } from "@/lib/editor/storageKeys";
import type { CanvasDocument, ElementNode, ElementType } from "@/lib/editor/types";

type NodeType = "frame" | "component" | "text" | "image" | "ellipse" | "line" | "pen";

type Node = {
  id: string;
  name: string;
  type: NodeType;
  visible?: boolean;
  locked?: boolean;
  children?: Node[];
};

type DeviceType = "mobile" | "tablet" | "desktop";
export type ProjectTreeNode = {
  id: string;
  name: string;
  kind: "screen" | "component";
  children?: ProjectTreeNode[];
};

function initiallyOpen(node: Node, depth = 0, set: Set<string> = new Set()): Set<string> {
  if (depth <= 1 && (node.type === "frame" || node.type === "component")) {
    set.add(node.id);
  }
  (node.children || []).forEach((c) => initiallyOpen(c, depth + 1, set));
  return set;
}

function findNode(node: Node, id: string): Node | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function nodeTypeLabel(node: Node): string {
  switch (node.type) {
    case "text":    return "text";
    case "image":   return "img";
    case "ellipse": return "elipse";
    case "line":    return "line";
    case "pen":     return "pen";
    default:        return "div";
  }
}

function countNodes(node: Node | undefined): number {
  if (!node) return 0;
  let n = 0;
  const walk = (x: Node) => {
    n++;
    (x.children || []).forEach(walk);
  };
  (node.children || []).forEach(walk);
  return n;
}

function isCanvasDocument(value: unknown): value is CanvasDocument {
  const maybe = value as CanvasDocument;
  return Boolean(
    maybe &&
      maybe.canvas &&
      typeof maybe.canvas.width === "number" &&
      typeof maybe.canvas.height === "number" &&
      maybe.elements &&
      Array.isArray(maybe.rootIds),
  );
}

function readStoredCanvasDocument(storageKey: string): CanvasDocument | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isCanvasDocument(parsed) ? constrainAll(parsed) : null;
  } catch {
    return null;
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  componentName?: string;
  screenName?: string;
  document?: CanvasDocument | null;
  selectedNodeId?: string | null;
  canvasActive?: boolean;
  onSelectNode?: (nodeId: string) => void;
  onReorderNode?: (activeNodeId: string, overNodeId: string) => void;
  onToggleVisible?: (nodeId: string, visible: boolean) => void;
  onToggleLocked?: (nodeId: string, locked: boolean) => void;
  onToggleCanvasActive?: (active: boolean) => void;
  canOpenNodeCanvas?: (nodeId: string) => boolean;
  onOpenNodeCanvas?: (nodeId: string) => void;
  onOpenProjectNode?: (node: ProjectTreeNode) => void;
  activeTab?: "layers" | "drafts";
  onTabChange?: (tab: "layers" | "drafts") => void;
  projectType?: DeviceType;
  projectTree?: ProjectTreeNode[];
  parentNode?: ProjectTreeNode | null;
};

export function Tree({
  open,
  onClose,
  componentName,
  screenName,
  document,
  selectedNodeId,
  canvasActive = false,
  onSelectNode,
  onReorderNode,
  onToggleVisible,
  onToggleLocked,
  onToggleCanvasActive,
  canOpenNodeCanvas,
  onOpenNodeCanvas,
  onOpenProjectNode,
  activeTab: externalTab,
  onTabChange: externalOnTabChange,
  projectType,
  projectTree,
  parentNode,
}: Props) {
  const tree = useMemo(() => {
    if (document) return treeFromCanvasDocument(document, componentName || screenName || "Canvas");
    return treeFromCanvasDocument(null, componentName || screenName || "Canvas");
  }, [componentName, document, screenName]);
  const treeStructureKey = useMemo(() => structureKey(tree.root), [tree]);
  const [draftDocument, setDraftDocument] = useState<CanvasDocument | null>(() =>
    readStoredCanvasDocument(DRAFTS_CANVAS_STORAGE_KEY),
  );
  const draftsTree = useMemo(() => {
    return treeFromCanvasDocument(draftDocument, "Drafts");
  }, [draftDocument]);
  const draftsStructureKey = useMemo(() => structureKey(draftsTree.root), [draftsTree]);

  const [openSet, setOpenSet] = useState<Set<string>>(() => initiallyOpen(tree.root));
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [internalTab, setInternalTab] = useState<"layers" | "drafts">("layers");
  const activeTab = externalTab ?? internalTab;
  const setActiveTab = (tab: "layers" | "drafts") => {
    setInternalTab(tab);
    if (tab === "drafts") {
      setDraftDocument(readStoredCanvasDocument(DRAFTS_CANVAS_STORAGE_KEY));
    }
    externalOnTabChange?.(tab);
  };
  const [draftsOpenSet, setDraftsOpenSet] = useState<Set<string>>(() =>
    initiallyOpen(draftsTree.root),
  );
  const [draftsSelectedId, setDraftsSelectedId] = useState<string | null>(null);

  const totalCount = useMemo(() => countNodes(tree.root), [tree]);
  const draftsCount = useMemo(() => countNodes(draftsTree.root), [draftsTree]);
  const pickerTree = projectTree ?? [];
  const selectedId = selectedNodeId ?? localSelectedId;
  const visibleLayerIds = useMemo(
    () => visibleNodeIds(tree.root, openSet),
    [openSet, tree.root],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setOpenSet(initiallyOpen(tree.root));
  }, [tree.root.id, treeStructureKey]);

  useEffect(() => {
    setDraftsOpenSet(initiallyOpen(draftsTree.root));
  }, [draftsTree.root.id, draftsStructureKey]);

  useEffect(() => {
    const refreshDrafts = () => setDraftDocument(readStoredCanvasDocument(DRAFTS_CANVAS_STORAGE_KEY));
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ storageKey?: string }>).detail;
      if (detail?.storageKey === DRAFTS_CANVAS_STORAGE_KEY) refreshDrafts();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DRAFTS_CANVAS_STORAGE_KEY) refreshDrafts();
    };

    window.addEventListener(CANVAS_DOCUMENT_SAVED_EVENT, onSaved);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CANVAS_DOCUMENT_SAVED_EVENT, onSaved);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const selectLayer = (nodeId: string | null) => {
    setLocalSelectedId(nodeId);
    if (nodeId) onSelectNode?.(nodeId);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    onReorderNode?.(activeId, overId);
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener("pointerdown", handler, true);
    return () => window.removeEventListener("pointerdown", handler, true);
  }, [pickerOpen]);

  if (!open) return null;

  const headerName = componentName || screenName || "Frame";
  const isScreen = !componentName && !!screenName;

  return (
    <>
    <aside
      aria-label="Camadas"
      className="pointer-events-auto fixed bottom-3 left-3 top-16 z-[6] flex w-[300px] flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] text-[#F2F2F2]"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
      {/* Header: title with icon + close */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#2C2C2C] bg-[#141414] pl-3.5 pr-2.5">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-[#1E1E1E]"
        >
          <span className="grid shrink-0 place-items-center text-[#9A9A9A]">
            {isScreen ? <DeviceIcon device={projectType ?? "mobile"} /> : <TypeIcon type="component" hasChildren />}
          </span>
          <span
            className="truncate text-[13px] font-medium"
            style={{ color: "#F2F2F2", letterSpacing: "0.1px" }}
          >
            {headerName}
          </span>
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="ml-auto shrink-0"
            style={{ transform: pickerOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel"
          className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] border border-[#2C2C2C] bg-transparent text-[#9A9A9A] hover:bg-[#2A2A2A] hover:text-[var(--text)]"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex h-[34px] shrink-0 items-stretch justify-between gap-2 border-b border-[#2C2C2C] bg-[#171717] px-1.5">
        <div className="flex items-stretch gap-0.5">
          {([
            { id: "layers", label: "Camadas" },
            { id: "drafts", label: "Drafts" },
          ] as const).map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className="relative cursor-pointer border-0 bg-transparent px-2.5 font-semibold uppercase"
                style={{
                  color: isActive ? "#F2F2F2" : "#9A9A9A",
                  fontSize: "11.5px",
                  letterSpacing: "0.8px",
                }}
              >
                {t.label}
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute -bottom-px left-2 right-2 h-0.5 rounded-[2px] bg-[#F2F2F2]"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex items-center pr-1.5">
          <span
            className="text-[11px] text-[#6B6B6B]"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {activeTab === "layers" ? totalCount : draftsCount}
          </span>
        </div>
      </div>

      {activeTab === "layers" ? (
        <>
          {document ? (
            <CanvasStageRow
              active={canvasActive}
              label={tree.root.name}
              width={document.canvas.width}
              height={document.canvas.height}
              onToggle={() => onToggleCanvasActive?.(!canvasActive)}
            />
          ) : null}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleLayerIds}
              strategy={verticalListSortingStrategy}
            >
              <div role="tree" className="flex-1 overflow-y-auto pb-3 pt-1.5">
                {(tree.root.children || []).map((c) => (
                  <TreeRow
                    key={c.id}
                    node={c}
                    depth={0}
                    openSet={openSet}
                    setOpenSet={setOpenSet}
                    selectedId={selectedId}
                    setSelectedId={selectLayer}
                    sortable={Boolean(onReorderNode)}
                    onToggleVisible={onToggleVisible}
                    onToggleLocked={onToggleLocked}
                    canOpenNodeCanvas={canOpenNodeCanvas}
                    onOpenNodeCanvas={onOpenNodeCanvas}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {/* <Footer
            indicator={<span className="h-1.5 w-1.5 rounded-full bg-[#3FB950]" />}
            label="sincronizado"
            value={selectedId ? (findNode(tree.root, selectedId) ? nodeTypeLabel(findNode(tree.root, selectedId)!) : null) : null}
          /> */}
          <BackFooter
            parentNode={parentNode}
            onBack={() => parentNode && onOpenProjectNode?.(parentNode)}
          />
        </>
      ) : (
        <>
          <div role="tree" className="flex-1 overflow-y-auto pb-3 pt-1.5">
            {(draftsTree.root.children || []).length > 0 ? (
              (draftsTree.root.children || []).map((c) => (
                <TreeRow
                  key={c.id}
                  node={c}
                  depth={0}
                  openSet={draftsOpenSet}
                  setOpenSet={setDraftsOpenSet}
                  selectedId={draftsSelectedId}
                  setSelectedId={setDraftsSelectedId}
                />
              ))
            ) : (
              <div className="px-4 py-8 text-center text-[12px] leading-5 text-[#6B6B6B]">
                Canvas livre, sem elementos.
              </div>
            )}
          </div>
          {/* <Footer
            indicator={<span className="h-1.5 w-1.5 rounded-full bg-[#E0A33A]" />}
            label={`${draftsCount} rascunhos`}
            value={draftsSelectedId ? (findNode(draftsTree.root, draftsSelectedId) ? nodeTypeLabel(findNode(draftsTree.root, draftsSelectedId)!) : null) : null}
          /> */}
        </>
      )}
    </aside>

    {/* Component picker dropdown */}
    {pickerOpen && (
      <div
        ref={pickerRef}
        className="fixed z-[20] overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#141414]"
        style={{
          left: 12,
          top: 64 + 44 + 2,
          width: 300,
          maxHeight: 320,
          boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset",
        }}
      >
        <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
          {pickerTree.length > 0 ? (
            pickerTree.map((screen) => (
              <PickerNode
                key={screen.id}
                node={screen}
                depth={0}
                activeId={headerName}
                onSelect={(node) => {
                  setPickerOpen(false);
                  onOpenProjectNode?.(node);
                }}
              />
            ))
          ) : (
            <div className="px-4 py-6 text-[12px] text-[#6B6B6B]">
              Sem itens do projeto.
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}

function treeFromCanvasDocument(document: CanvasDocument | null | undefined, name = "Canvas"): { root: Node } {
  if (!document) {
    return {
      root: {
        id: "__canvas__",
        name,
        type: "frame",
        visible: true,
        locked: false,
        children: [],
      },
    };
  }

  const build = (node: ElementNode): Node => ({
    id: node.id,
    name: node.name,
    type: nodeTypeFromElement(node.type, node.children.length > 0),
    visible: node.visible,
    locked: node.locked,
    children: node.children
      .map((childId) => document.elements[childId])
      .filter((child): child is ElementNode => Boolean(child))
      .map(build),
  });

  return {
    root: {
      id: "__canvas__",
      name,
      type: "frame",
      visible: true,
      locked: false,
      children: document.rootIds
        .map((id) => document.elements[id])
        .filter((node): node is ElementNode => Boolean(node))
        .map(build),
    },
  };
}

function nodeTypeFromElement(type: ElementType, hasChildren: boolean): NodeType {
  if (type === "text") return "text";
  if (type === "image") return "image";
  return hasChildren ? "component" : "frame";
}

function structureKey(node: Node): string {
  return `${node.id}(${(node.children ?? []).map(structureKey).join(",")})`;
}

function visibleNodeIds(root: Node, openSet: Set<string>): string[] {
  const ids: string[] = [];
  const walk = (node: Node) => {
    ids.push(node.id);
    if (!openSet.has(node.id)) return;
    for (const child of node.children ?? []) walk(child);
  };
  for (const child of root.children ?? []) walk(child);
  return ids;
}

// function Footer({
//   indicator,
//   label,
//   value,
// }: {
//   indicator: React.ReactNode;
//   label: string;
//   value: string | null;
// }) {
//   return (
//     <div
//       className="flex shrink-0 items-center justify-between border-t border-[#2C2C2C] px-3.5 py-2.5 text-[12px] text-[#6B6B6B]"
//       style={{ letterSpacing: "0.2px" }}
//     >
//       <span className="inline-flex items-center gap-1.5">
//         {indicator}
//         {label}
//       </span>
//       <span className="max-w-[140px] truncate">{value || "—"}</span>
//     </div>
//   );
// }

function BackFooter({
  parentNode,
  onBack,
}: {
  parentNode?: ProjectTreeNode | null;
  onBack?: () => void;
}) {
  if (!parentNode) return null;

  return (
    <button
      type="button"
      onClick={onBack}
      className="group flex w-full shrink-0 items-center gap-2 border-t border-[#2C2C2C] px-2.5 py-2 text-left transition-colors duration-[90ms] hover:bg-[#1E1E1E]"
    >
      {/* chevron left */}
      <span className="grid h-5 w-5 shrink-0 place-items-center text-[#4A4A4A] transition-colors duration-[90ms] group-hover:text-[#CFCFCF]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </span>

      {/* parent info */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[10px] leading-none text-[#444] transition-colors duration-[90ms] group-hover:text-[#666]">
          Voltar para
        </span>
        <span className="truncate text-[12px] font-medium leading-none text-[#7A7A7A] transition-colors duration-[90ms] group-hover:text-[#CFCFCF]">
          {parentNode.name}
        </span>
      </span>

      {/* kind icon */}
      <span className="shrink-0 text-[#3A3A3A] transition-colors duration-[90ms] group-hover:text-[#5A5A5A]">
        {parentNode.kind === "screen" ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        )}
      </span>
    </button>
  );
}

function CanvasStageRow({
  active,
  label,
  width,
  height,
  onToggle,
}: {
  active: boolean;
  label: string;
  width: number;
  height: number;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[#2C2C2C] px-2 py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2.5 text-left hover:bg-[#242424]"
        style={{
          borderColor: active ? "rgba(13,153,255,0.65)" : "#2C2C2C",
          boxShadow: active ? "0 0 0 1px rgba(13,153,255,0.12) inset" : undefined,
        }}
      >
        <span
          className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] text-[10px] font-bold"
          style={{
            background: active ? "rgba(13,153,255,0.18)" : "#2A2A2A",
            color: active ? "#7CC7FF" : "#9A9A9A",
          }}
        >
          C
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-[#F2F2F2]">
            {label}
          </span>
          <span className="block text-[10.5px] text-[#6B6B6B]">
            {width}×{height}px
          </span>
        </span>
        <span
          className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            borderColor: active ? "rgba(13,153,255,0.5)" : "#333",
            color: active ? "#7CC7FF" : "#8A8A8A",
          }}
        >
          {active ? "Done" : "Edit"}
        </span>
      </button>
    </div>
  );
}

function TreeRow({
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
            aria-label="Abrir componente no canvas"
            title="Abrir componente no canvas"
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
            />
          ))
        : null}
    </>
  );
}

function TypeIcon({ type, hasChildren }: { type: NodeType; hasChildren?: boolean }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (hasChildren) {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }

  switch (type) {
    case "frame":
    case "component":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
    case "text":
      return (
        <svg {...common}>
          <path d="M5 6h14" />
          <path d="M12 6v13" />
          <path d="M9 19h6" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "ellipse":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="9" ry="6" />
        </svg>
      );
    case "line":
      return (
        <svg {...common}>
          <line x1="5" y1="19" x2="19" y2="5" />
          <path d="M14 5h5v5" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common}>
          <path d="M4 20c2-1 4-2 6-5s4-8 7-11" />
          <path d="M17 4l3 3" />
          <circle cx="4" cy="20" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

function DeviceIcon({ device }: { device: DeviceType }) {
  const common = {
    width: 13, height: 13, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor", strokeWidth: 1.7,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  if (device === "mobile") {
    return (
      <svg {...common}>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (device === "tablet") {
    return (
      <svg {...common}>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M11 18h2" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function PickerNode({
  node,
  depth,
  activeId,
  onSelect,
}: {
  node: ProjectTreeNode;
  depth: number;
  activeId: string;
  onSelect: (node: ProjectTreeNode) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = (node.children ?? []).length > 0;
  const isActive = node.name === activeId;

  return (
    <>
      <button
        type="button"
        className="flex w-full items-center gap-2 border-0 bg-transparent text-left transition-colors duration-75 hover:bg-[#1E1E1E]"
        style={{
          paddingLeft: 10 + depth * 14,
          paddingRight: 10,
          paddingTop: 6,
          paddingBottom: 6,
          background: isActive ? "rgba(255,255,255,0.06)" : undefined,
        }}
        onClick={() => onSelect(node)}
      >
        {/* expand/collapse chevron */}
        <span
          className="grid h-4 w-4 shrink-0 place-items-center text-[#555]"
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setOpen((v) => !v); }}
        >
          {hasChildren && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 100ms ease" }}
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          )}
        </span>

        {/* icon */}
        <span className="grid shrink-0 place-items-center text-[#666]">
          {node.kind === "screen" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          )}
        </span>

        <span
          className="truncate text-[12.5px]"
          style={{ color: isActive ? "#F2F2F2" : "#AAAAAA", fontWeight: isActive ? 500 : 400 }}
        >
          {node.name}
        </span>
      </button>

      {open && hasChildren && (node.children ?? []).map((child) => (
        <PickerNode
          key={child.id}
          node={child}
          depth={depth + 1}
          activeId={activeId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export function TreeToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  if (open) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir camadas"
      className="fixed bottom-6 left-3 z-[11] inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-lg border border-[#2C2C2C] bg-[#1E1E1E] px-3 text-[13px] font-medium text-[#CFCFCF] transition-colors hover:bg-[#2A2A2A] hover:text-[var(--text)]"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5h18M3 12h12M3 19h18" />
      </svg>
      Camadas
    </button>
  );
}
