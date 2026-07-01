import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { useDismissable } from "@/lib/hooks/useDismissable";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import {
  useEditorBridge,
  useEditorBridgeReader,
  type EditorBridgeValue,
} from "@/canvas/engine/bridge";
import type { CanvasDocument } from "@/canvas/engine/types";
import { useCanvasCommands } from "./useCanvasCommands";
import { windowKeyLabel, type CanvasWindowKey } from "@/canvas/canvasUtils";

import type { DeviceType, DropMode, ProjectTreeNode } from "./tree/treeTypes";
import {
  ancestorIdsForNodeIds,
  collectOpenableIds,
  documentTreeShapeEqual,
  filterTree,
  findNode,
  initiallyOpen,
  isLayerFilterActive,
  openToDepth,
  stringArraysEqual,
  structureKey,
  treeFromCanvasDocument,
  visibleNodeIds,
} from "./tree/treeHelpers";
import { BackFooter } from "./tree/BackFooter";
import { LayersFooter, type ExpandMode } from "./tree/LayersFooter";
import { CurrentSceneTreeRow } from "./tree/CurrentSceneTreeRow";
import { VersionsSubjectHeader } from "./tree/VersionsSubjectHeader";
import { PickerNode } from "./tree/PickerNode";
import { TreeRow } from "./tree/TreeRow";
import { TypeIcon } from "./tree/TypeIcon";
import { StackTreePanel } from "./tree/StackTreePanel";
import { IconClose, IconLayers, IconTrash } from "@/components/icons";
import { PanelResizeHandle } from "./PanelResizeHandle";

export type { ProjectTreeNode };

type TreeContextMenuState = {
  x: number;
  y: number;
  targetId: string | null;
} | null;

type TreeContextMenuItem =
  | { type: "action"; label: string; shortcut?: string; disabled?: boolean; action: () => void }
  | { type: "separator" };

// The drag source row is full panel width, so dnd-kit's default overlay placement
// (top-left of the source rect) leaves the small ghost chip far to the left of the
// cursor. This pins the chip's top-left just below-right of the pointer instead.
const snapOverlayToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const coords = getEventCoordinates(activatorEvent);
  if (!coords) return transform;
  return {
    ...transform,
    x: transform.x + coords.x - draggingNodeRect.left + 12,
    y: transform.y + coords.y - draggingNodeRect.top + 8,
  };
};

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const modLabel = isMac ? "⌘" : "Ctrl+";

function escapeCssAttributeValue(value: string): string {
  const css = globalThis.CSS as { escape?: (input: string) => string } | undefined;
  if (css?.escape) return css.escape(value);
  return value.replace(/["\\\u0000-\u001F\u007F]/g, (character) => {
    if (character === "\"") return "\\\"";
    if (character === "\\") return "\\\\";
    return `\\${character.charCodeAt(0).toString(16)} `;
  });
}

function scrollTreeNodeIntoView(container: HTMLDivElement | null, nodeId: string): void {
  const row = container?.querySelector<HTMLElement>(
    `[data-tree-node-id="${escapeCssAttributeValue(nodeId)}"]`,
  );
  row?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

type Props = {
  open: boolean;
  onClose: () => void;
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  componentName?: string;
  screenName?: string;
  // The subject name to show when the canvas is neither a component nor a screen
  // (e.g. an icon master, labelled by the icon's name instead of a generic "Frame").
  subjectName?: string;
  // The subject is an icon master (drives the subject-row glyph).
  isIcon?: boolean;
  // Editing a standalone subject with no project context (a draft/icon) — the
  // subject-switch dropdown is hidden since there is nothing to switch to.
  isolated?: boolean;
  document?: CanvasDocument | null;
  selectedNodeId?: string | null;
  selectedNodeIds?: readonly string[];
  autoRevealSelection?: boolean;
  canvasActive?: boolean;
  onSelectNode?: (nodeId: string) => void;
  onReorderNode?: (activeNodeId: string, overNodeId: string) => void;
  // Drag-and-drop move that can also reparent: `mode` says whether the active node
  // lands before/after `overNodeId` as a sibling, or nests inside it as a child.
  onMoveNode?: (activeNodeId: string, overNodeId: string, mode: DropMode) => void;
  onToggleVisible?: (nodeId: string, visible: boolean) => void;
  onToggleLocked?: (nodeId: string, locked: boolean) => void;
  onToggleCanvasActive?: (active: boolean) => void;
  canOpenNodeCanvas?: (nodeId: string) => boolean;
  onOpenNodeCanvas?: (nodeId: string) => void;
  // Versions window only: open a nested component row as a version-owned copy
  // (materialize it under the version's variant, then open it). Distinct from the
  // Current-window handlers, which resolve against the Current subject's scene.
  versionsCanOpenNodeCanvas?: (nodeId: string) => boolean;
  versionsOnOpenNodeCanvas?: (nodeId: string) => void;
  onGoToInstance?: (variantId: string) => void;
  onDetachNode?: (nodeId: string) => void;
  onOpenProjectNode?: (node: ProjectTreeNode) => void;
  activeTab?: CanvasWindowKey;
  projectType?: DeviceType;
  projectTree?: ProjectTreeNode[];
  parentNode?: ProjectTreeNode | null;
  // Parent of the Versions-window subject; the back footer re-points the versions
  // subject to it (staying in the Versions window) instead of navigating Current.
  versionsParentNode?: ProjectTreeNode | null;
  subjectSize?: { width: number; height: number };
  // Versions window: the subject's real versions (V1, V2…), the selected one, and the
  // setter. When the focused window is "versions" the header dropdown lists these
  // instead of the project's screens.
  versionOptions?: ReadonlyArray<{ id: string; label: string }>;
  selectedVersionId?: string | null;
  onSelectVersion?: (variantId: string) => void;
  onAddVersion?: () => void;
  // The id of the subject open in Current — highlighted (by id) in the "current" picker.
  currentSubjectId?: string | null;
  // Versions window: the selected subject (screen/component) shown in the first ("Screen")
  // dropdown — its id (for highlight), name + kind (for display), intrinsic size, and the
  // setter that roams the whole project tree.
  versionsSubjectId?: string | null;
  versionsSubjectName?: string;
  versionsSubjectIsScreen?: boolean;
  versionsSubjectSize?: { width: number; height: number };
  onSelectVersionsSubject?: (node: ProjectTreeNode) => void;
  // Re-points the Versions window at whatever subject is open in Current, so it follows
  // along to that element's versions.
  onLinkVersionsToCurrent?: () => void;
  // Back navigation for the Versions window: pops its drill-in history (or falls back to
  // the structural parent). Drives the back footer instead of a plain subject re-point.
  onVersionsBack?: () => void;
  onClearSketch?: () => void;
};

export function Tree({
  open,
  onClose,
  width,
  minWidth,
  maxWidth,
  onResize,
  componentName,
  screenName,
  subjectName,
  isIcon,
  isolated,
  document: documentProp,
  selectedNodeId,
  selectedNodeIds,
  autoRevealSelection = true,
  canvasActive = false,
  onSelectNode,
  onReorderNode,
  onMoveNode,
  onToggleVisible,
  onToggleLocked,
  onToggleCanvasActive,
  canOpenNodeCanvas,
  onOpenNodeCanvas,
  versionsCanOpenNodeCanvas,
  versionsOnOpenNodeCanvas,
  onGoToInstance,
  onDetachNode,
  onOpenProjectNode,
  activeTab = "current",
  projectType,
  projectTree,
  versionsParentNode,
  parentNode,
  subjectSize,
  versionOptions = [],
  selectedVersionId = null,
  onSelectVersion,
  onAddVersion,
  currentSubjectId,
  versionsSubjectId,
  versionsSubjectName,
  versionsSubjectIsScreen,
  versionsSubjectSize,
  onSelectVersionsSubject,
  onLinkVersionsToCurrent,
  onVersionsBack,
  onClearSketch,
}: Props) {
  const bridgeDocument = useEditorBridge(
    (value) => value?.state.document ?? null,
    documentTreeShapeEqual,
  );
  const document = documentProp !== undefined ? documentProp : bridgeDocument;
  const { settings: globalSettings } = useGlobalSettings();
  const revealSealedSvg = globalSettings.canvas.shell.tree.revealSealedComponentChildren;
  const tree = useMemo(() => {
    const label = componentName || screenName || subjectName || "Canvas";
    if (document) return treeFromCanvasDocument(document, label, revealSealedSvg);
    return treeFromCanvasDocument(null, label, revealSealedSvg);
  }, [componentName, document, screenName, subjectName, revealSealedSvg]);
  const treeStructureKey = useMemo(() => structureKey(tree.root), [tree]);

  const [openSet, setOpenSet] = useState<Set<string>>(() => initiallyOpen(tree.root));
  // Mirror of the latest open-set so the reveal effect can test "is this ancestor
  // already expanded?" without depending on `openSet` (which would re-run it — and
  // re-scroll to the selection — on every unrelated manual expand/collapse).
  const openSetRef = useRef(openSet);
  openSetRef.current = openSet;
  // Node whose scroll-into-view is deferred until an ancestor expansion commits.
  const pendingRevealRef = useRef<string | null>(null);
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  // Layers footer: text + type filtering and the 3-state expand/collapse control.
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilters, setKindFilters] = useState<Set<string>>(() => new Set());
  const [expandMode, setExpandMode] = useState<ExpandMode>("second");

  const filterActive = isLayerFilterActive({ query: searchQuery, kinds: kindFilters });
  // A filtered view is a flat list of matches — the hierarchy is discarded, so there
  // are no expandable rows and the open-set machinery does not apply.
  const filtered = useMemo(
    () => (filterActive ? filterTree(tree.root, { query: searchQuery, kinds: kindFilters }) : null),
    [filterActive, searchQuery, kindFilters, tree.root],
  );
  const displayRoot = filtered ? filtered.root : tree.root;

  const EMPTY_OPEN_SET = useMemo(() => new Set<string>(), []);
  const noopSetOpenSet = useCallback((_: Set<string>) => {}, []);
  const rowsOpenSet = filtered ? EMPTY_OPEN_SET : openSet;
  const rowsSetOpenSet = filtered ? noopSetOpenSet : setOpenSet;

  const cycleExpand = useCallback(() => {
    const order: ExpandMode[] = ["all", "second", "collapsed"];
    const next = order[(order.indexOf(expandMode) + 1) % order.length];
    setExpandMode(next);
    const set =
      next === "all"
        ? collectOpenableIds(tree.root)
        : next === "second"
          ? openToDepth(tree.root, 1)
          : new Set<string>();
    setOpenSet(set);
  }, [tree.root, expandMode]);

  const removeKindFilter = useCallback((kind: string) => {
    setKindFilters((prev) => {
      const next = new Set(prev);
      next.delete(kind);
      return next;
    });
  }, []);

  const toggleKindFilter = useCallback((kind: string) => {
    setKindFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const pickerTree = projectTree ?? [];
  const rawSelectedIds =
    selectedNodeIds ??
    (selectedNodeId != null
      ? [selectedNodeId]
      : localSelectedId
        ? [localSelectedId]
        : []);
  // `rawSelectedIds` is rebuilt every render, so hold a stable reference while its
  // contents are unchanged. Memos/effects below then depend on identity instead of
  // re-stringifying the array each render purely to drive a memo key (SHELL-3).
  const selectedIdsRef = useRef<readonly string[]>(rawSelectedIds);
  if (!stringArraysEqual(selectedIdsRef.current, rawSelectedIds)) {
    selectedIdsRef.current = rawSelectedIds;
  }
  const selectedIds = selectedIdsRef.current;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleLayerIds = useMemo(
    () => visibleNodeIds(displayRoot, rowsOpenSet),
    [displayRoot, rowsOpenSet],
  );
  const layerTreeRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setOpenSet(initiallyOpen(tree.root));
  }, [tree.root.id, treeStructureKey]);

  // On selection change, reveal the selected node. If its ancestors are already
  // open the node is in the DOM now, so scroll synchronously. If an ancestor is
  // collapsed, expand it and arm `pendingRevealRef`; the layout effect below
  // scrolls once that expansion is committed — no double-rAF "wait for layout".
  useLayoutEffect(() => {
    if (!autoRevealSelection || selectedIds.length === 0) return;

    const revealTargetId = selectedIds.find((id) => findNode(tree.root, id));
    if (!revealTargetId) return;

    const ancestorIds = ancestorIdsForNodeIds(tree.root, selectedIds);
    const currentOpen = openSetRef.current;
    let needsExpand = false;
    for (const id of ancestorIds) {
      if (!currentOpen.has(id)) {
        needsExpand = true;
        break;
      }
    }

    if (!needsExpand) {
      scrollTreeNodeIntoView(layerTreeRef.current, revealTargetId);
      return;
    }

    pendingRevealRef.current = revealTargetId;
    setOpenSet((current) => {
      const next = new Set(current);
      for (const id of ancestorIds) next.add(id);
      return next;
    });
  }, [autoRevealSelection, selectedIds, tree.root, treeStructureKey]);

  // Runs after an ancestor expansion is committed to the DOM (layout effect →
  // after mutation, before paint), so the just-revealed row already exists. The
  // ref guard keeps unrelated open/collapse toggles from re-scrolling.
  useLayoutEffect(() => {
    const targetId = pendingRevealRef.current;
    if (!targetId) return;
    pendingRevealRef.current = null;
    scrollTreeNodeIntoView(layerTreeRef.current, targetId);
  }, [rowsOpenSet]);

  // Controlled when the parent drives selection via selectedNodeIds/selectedNodeId;
  // only then does localSelectedId go unread (see the selectedIds derivation above).
  // Writing it in controlled mode creates a second, divergent source of truth (SHELL-2).
  const selectionControlled = selectedNodeIds != null || selectedNodeId != null;
  // Stable identity so the memoized TreeRow (SHELL-5) isn't invalidated every render.
  const selectLayer = useCallback(
    (nodeId: string | null) => {
      if (!selectionControlled) setLocalSelectedId(nodeId);
      if (nodeId) onSelectNode?.(nodeId);
    },
    [selectionControlled, onSelectNode],
  );
  // Drag-and-drop drop intent. As the row is dragged we resolve whether it will land
  // before/after the hovered row (sibling reorder) or inside it (reparent/nest),
  // based on where the pointer sits within the hovered row's height.
  const [dropTarget, setDropTarget] = useState<{ overId: string; mode: DropMode } | null>(
    null,
  );
  // The row currently being dragged — used to render the compact DragOverlay ghost.
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDragNode = activeDragId ? findNode(displayRoot, activeDragId) : null;

  const resolveDropTarget = (
    event: DragMoveEvent | DragEndEvent,
  ): { overId: string; mode: DropMode } | null => {
    const { active, over, delta, activatorEvent } = event;
    if (!over) return null;
    const overId = String(over.id);
    if (overId === String(active.id)) return null;
    const rect = over.rect;
    const startY =
      activatorEvent && "clientY" in activatorEvent
        ? (activatorEvent as PointerEvent).clientY
        : rect.top + rect.height / 2;
    const pointerY = startY + (delta?.y ?? 0);
    const ratio = rect.height > 0 ? (pointerY - rect.top) / rect.height : 0.5;
    const mode: DropMode = ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "inside";
    return { overId, mode };
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragMove = (event: DragMoveEvent) => {
    setDropTarget(resolveDropTarget(event));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const target = dropTarget ?? resolveDropTarget(event);
    setDropTarget(null);
    setActiveDragId(null);
    const activeId = String(event.active.id);
    if (!target || target.overId === activeId) return;
    if (onMoveNode) {
      onMoveNode(activeId, target.overId, target.mode);
    } else if (onReorderNode && target.mode !== "inside") {
      onReorderNode(activeId, target.overId);
    }
  };

  const handleDragCancel = () => {
    setDropTarget(null);
    setActiveDragId(null);
  };

  // Which header dropdown is open. The Current window has one ("current" → project tree);
  // the Versions window has two ("subject" → project tree, "version" → version list).
  const [openPicker, setOpenPicker] = useState<"current" | "subject" | "version" | null>(null);
  const pickerOpen = openPicker !== null;
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<TreeContextMenuState>(null);
  // Stable identity so the memoized TreeRow (SHELL-5) isn't invalidated every render.
  const handleContextMenuNode = useCallback((nodeId: string, x: number, y: number) => {
    setContextMenu({ x, y, targetId: nodeId });
  }, []);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerTriggerRef = useRef<HTMLDivElement>(null);
  const readEditor = useEditorBridgeReader();
  // The focus-on-node button is a draft-canvas affordance: the draft is huge and
  // freeform, so jumping the camera to a node is far more useful there than in a
  // tightly-bounded frame.
  const isDraftMode = useEditorBridge((value) => value?.state.viewportMode === "draft");
  const focusNode = useCallback(
    (nodeId: string) => {
      readEditor()?.dispatch({ type: "requestNodeFocus", nodeId });
    },
    [readEditor],
  );

  useDismissable(
    pickerOpen,
    () => setOpenPicker(null),
    [pickerRef, pickerTriggerRef],
    { capture: true, escape: false },
  );

  if (!open) return null;

  const headerName = componentName || screenName || subjectName || "Frame";
  const isScreen = !componentName && !!screenName;
  const focusedWindowLabel = activeTab === "current" ? null : windowKeyLabel(activeTab);
  const rowWidth = subjectSize?.width ?? document?.canvas.width;
  const rowHeight = subjectSize?.height ?? document?.canvas.height;
  // In the Versions window the header is two selects (screen + version). The version
  // tag (e.g. "V1") and size come from the selected subject's chosen version, not from
  // whatever is open in Current.
  const isVersionsWindow = activeTab === "versions";
  // The References window has no canvas-layer subject: its body is the open
  // reference's stack tree (StackTreePanel, fed by the ReferencesBridge), not the
  // editor document. So it suppresses the subject header and the layer filter/footer.
  const isReferencesWindow = activeTab === "references";
  const headerVersionTag = isVersionsWindow
    ? versionOptions.find((v) => v.id === selectedVersionId)?.label ?? versionOptions[0]?.label
    : undefined;
  const versionRowWidth = versionsSubjectSize?.width ?? document?.canvas.width;
  const versionRowHeight = versionsSubjectSize?.height ?? document?.canvas.height;

  return (
    <>
    <aside
      aria-label="Layers"
      className="pointer-events-auto fixed bottom-3 left-3 top-16 z-[6] flex flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] text-[#F2F2F2]"
      style={{ width, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <PanelResizeHandle
        side="right"
        width={width}
        min={minWidth}
        max={maxWidth}
        onResize={onResize}
      />
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2C2C2C] bg-[#141414] pl-3.5 pr-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9A9A9A]">
            Layers
          </span>
          {focusedWindowLabel ? (
            <span className="mt-0.5 truncate text-[9.5px] font-medium leading-none text-[#5F5F5F]">
              {focusedWindowLabel}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isDraftMode && onClearSketch ? (
            <button
              type="button"
              onClick={onClearSketch}
              aria-label="Clear sketch"
              title="Clear sketch"
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full border border-[#2C2C2C] bg-transparent text-[#9A9A9A] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
            >
              <IconTrash size={11} strokeWidth={1.8} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full border border-[#2C2C2C] bg-transparent text-[#9A9A9A] hover:bg-[#2A2A2A] hover:text-[var(--text)]"
          >
            <IconClose size={11} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      {isDraftMode ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[#222] bg-[#111] px-3.5 py-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#444]" />
          <span className="text-[10px] font-medium text-[#555]">
            Not saved to the database — local to this device
          </span>
        </div>
      ) : null}

      <>
        <div ref={pickerTriggerRef}>
          {isDraftMode || isReferencesWindow ? null : isVersionsWindow ? (
            <VersionsSubjectHeader
              active={canvasActive}
              subjectName={versionsSubjectName ?? headerName}
              isScreen={versionsSubjectIsScreen ?? isScreen}
              projectType={projectType ?? "mobile"}
              versionTag={headerVersionTag}
              width={versionRowWidth}
              height={versionRowHeight}
              hasVersion={Boolean(headerVersionTag)}
              subjectPickerOpen={openPicker === "subject"}
              versionPickerOpen={openPicker === "version"}
              onOpenSubjectPicker={(rect) => {
                setPickerAnchor({ left: rect.left, top: rect.bottom + 4 });
                setOpenPicker((m) => (m === "subject" ? null : "subject"));
              }}
              onOpenVersionPicker={(rect) => {
                setPickerAnchor({ left: rect.left, top: rect.bottom + 4 });
                setOpenPicker((m) => (m === "version" ? null : "version"));
              }}
              linkedToCurrent={versionsSubjectId != null && versionsSubjectId === currentSubjectId}
              onToggleEdit={() => onToggleCanvasActive?.(!canvasActive)}
              onLinkToCurrent={() => onLinkVersionsToCurrent?.()}
            />
          ) : (
            <CurrentSceneTreeRow
              active={canvasActive}
              label={headerName}
              tag={headerVersionTag}
              width={rowWidth}
              height={rowHeight}
              isScreen={isScreen}
              isIcon={isIcon}
              projectType={projectType ?? "mobile"}
              pickerOpen={pickerOpen}
              pickerEnabled={!isolated}
              onOpenPicker={(rect) => {
                setPickerAnchor({ left: rect.left, top: rect.bottom + 4 });
                setOpenPicker((m) => (m === "current" ? null : "current"));
              }}
              onToggleEdit={() => onToggleCanvasActive?.(!canvasActive)}
            />
          )}
        </div>
        {isReferencesWindow ? (
          <StackTreePanel />
        ) : (
        <>
        <BackFooter
          parentNode={isVersionsWindow ? versionsParentNode : parentNode}
          onBack={() => {
            if (isVersionsWindow) {
              // Stay in the Versions window: pop its drill-in history (or fall back to the
              // structural parent) instead of navigating the Current window.
              onVersionsBack?.();
            } else if (parentNode) {
              onOpenProjectNode?.(parentNode);
            }
          }}
        />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={visibleLayerIds}
            strategy={verticalListSortingStrategy}
          >
            <div ref={layerTreeRef} role="tree" className="flex-1 overflow-y-auto pb-3 pt-1">
              {displayRoot.children && displayRoot.children.length > 0 ? (
                displayRoot.children.map((c) => (
                  <TreeRow
                    key={c.id}
                    node={c}
                    depth={0}
                    openSet={rowsOpenSet}
                    setOpenSet={rowsSetOpenSet}
                    selectedIds={selectedIdSet}
                    setSelectedId={selectLayer}
                    sortable={Boolean(onMoveNode || onReorderNode) && !filterActive}
                    dropTargetId={dropTarget?.overId ?? null}
                    dropMode={dropTarget?.mode}
                    dragActive={activeDragId != null}
                    onToggleVisible={onToggleVisible}
                    onToggleLocked={onToggleLocked}
                    // The Current window opens a node against the Current subject's
                    // scene. The Versions window uses version-scoped handlers that
                    // materialize a copy owned by the selected version's variant (a
                    // versioned screen is a normal screen — the copy is owned by the
                    // version). Linked instances in either window keep their separate
                    // "go to master" link (onGoToInstance).
                    canOpenNodeCanvas={isVersionsWindow ? versionsCanOpenNodeCanvas : canOpenNodeCanvas}
                    onOpenNodeCanvas={isVersionsWindow ? versionsOnOpenNodeCanvas : onOpenNodeCanvas}
                    onGoToInstance={onGoToInstance}
                    onDetachNode={onDetachNode}
                    showFocusButton={isDraftMode}
                    onFocusNode={focusNode}
                    onContextMenuNode={handleContextMenuNode}
                  />
                ))
              ) : filterActive ? (
                <div className="px-4 py-6 text-center text-[12px] text-[#6B6B6B]">
                  No layers found.
                </div>
              ) : null}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null} modifiers={[snapOverlayToCursor]}>
            {activeDragNode ? (
              <div className="pointer-events-none inline-flex max-w-[240px] items-center gap-1.5 rounded-md border border-[#3A3A3A] bg-[#1E1E1E] py-1 pl-1.5 pr-2.5 text-[12px] text-[#F2F2F2] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                <span
                  className="grid w-[18px] shrink-0 place-items-center"
                  style={{ color: activeDragNode.linked ? "#8638E5" : "#9A9A9A" }}
                >
                  <TypeIcon
                    type={activeDragNode.type}
                    hasChildren={(activeDragNode.children || []).length > 0}
                    linked={activeDragNode.linked}
                  />
                </span>
                <span className="truncate">{activeDragNode.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        </>
        )}
      </>

      {isReferencesWindow ? null : (
        <LayersFooter
          query={searchQuery}
          onQueryChange={setSearchQuery}
          kinds={kindFilters}
          onToggleKind={toggleKindFilter}
          onRemoveKind={removeKindFilter}
          expandMode={expandMode}
          onCycleExpand={cycleExpand}
        />
      )}
    </aside>

    {pickerOpen && pickerAnchor && (
      <div
        ref={pickerRef}
        className="fixed z-[20] overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#141414]"
        style={{
          left: pickerAnchor.left,
          ...(pickerAnchor.top != null ? { top: pickerAnchor.top } : { bottom: pickerAnchor.bottom }),
          width: 300,
          maxHeight: 320,
          boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset",
        }}
      >
        <div className="overflow-y-auto p-1.5" style={{ maxHeight: 320 }}>
          {openPicker === "version" ? (
            <>
              {versionOptions.length > 0 ? (
                versionOptions.map((option) => {
                  const isSelected = option.id === selectedVersionId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setOpenPicker(null);
                        onSelectVersion?.(option.id);
                      }}
                      className={[
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100",
                        isSelected ? "bg-[#2A2233]" : "hover:bg-[#222]",
                      ].join(" ")}
                    >
                      <span
                        className="grid h-6 min-w-6 shrink-0 place-items-center rounded-md border px-1 text-[10px] font-semibold uppercase"
                        style={{
                          borderColor: isSelected ? "rgba(134,56,229,0.55)" : "#303030",
                          color: isSelected ? "#C4A1F2" : "#8A8A8A",
                          background: isSelected ? "rgba(134,56,229,0.16)" : "#1D1D1D",
                        }}
                      >
                        {option.label}
                      </span>
                      <span className="block truncate text-[12px] font-medium text-[#E2E2E2]">
                        {option.label}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-2.5 py-3 text-[12px] text-[#6B6B6B]">No versions yet.</div>
              )}
              {onAddVersion ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpenPicker(null);
                    onAddVersion();
                  }}
                  className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[#A6A6A6] transition-colors duration-100 hover:bg-[#222] hover:text-[#E2E2E2]"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-dashed border-[#3A3A3A] text-[13px] leading-none text-[#8A8A8A]">
                    +
                  </span>
                  New version
                </button>
              ) : null}
            </>
          ) : pickerTree.length > 0 ? (
            // Both the Current window's "current" picker and the Versions window's
            // "subject" picker browse the same project tree — they differ only in what
            // selecting a node does and which node is highlighted.
            pickerTree.map((screen) => (
              <PickerNode
                key={screen.id}
                node={screen}
                depth={0}
                activeId={openPicker === "subject" ? versionsSubjectId ?? null : currentSubjectId ?? null}
                onSelect={(node) => {
                  setOpenPicker(null);
                  if (openPicker === "subject") onSelectVersionsSubject?.(node);
                  else onOpenProjectNode?.(node);
                }}
              />
            ))
          ) : (
            <div className="px-4 py-6 text-[12px] text-[#6B6B6B]">
              No project items.
            </div>
          )}
        </div>
      </div>
    )}
    {contextMenu ? (
      <TreeContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        getEditor={readEditor}
      />
    ) : null}
    </>
  );
}

export function TreeToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  if (open) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open layers"
      className="inline-flex h-[42px] cursor-pointer items-center gap-[7px] rounded-lg border border-[#2C2C2C] bg-[#1E1E1E] px-3 text-[13px] font-medium text-[#CFCFCF] transition-colors hover:bg-[#2A2A2A] hover:text-[var(--text)]"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <IconLayers size={13} strokeWidth={1.7} />
      Layers
    </button>
  );
}

function TreeContextMenu({
  menu,
  onClose,
  getEditor,
}: {
  menu: NonNullable<TreeContextMenuState>;
  onClose: () => void;
  getEditor: ReturnType<typeof useEditorBridgeReader>;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const editor = getEditor();

  useDismissable(true, onClose, [menuRef], { capture: true });

  useEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let adjustedX = menu.x;
    let adjustedY = menu.y;
    if (rect.right > vw - 8) adjustedX = vw - rect.width - 8;
    if (rect.bottom > vh - 8) adjustedY = vh - rect.height - 8;
    if (adjustedX !== menu.x || adjustedY !== menu.y) {
      element.style.left = `${adjustedX}px`;
      element.style.top = `${adjustedY}px`;
    }
  }, [menu.x, menu.y]);

  if (!editor) return null;
  return <TreeContextMenuContent menu={menu} onClose={onClose} editor={editor} menuRef={menuRef} />;
}

function TreeContextMenuContent({
  menu,
  onClose,
  editor,
  menuRef,
}: {
  menu: NonNullable<TreeContextMenuState>;
  onClose: () => void;
  editor: EditorBridgeValue;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { state } = editor;
  const commands = useCanvasCommands(editor, onClose);
  const selectedIds = state.selectedIds;
  const hasSelection = selectedIds.length > 0;
  const singleId = selectedIds.length === 1 ? selectedIds[0] : null;
  const singleNode = singleId ? state.document.elements[singleId] : null;

  const items: TreeContextMenuItem[] = [
    { type: "action", label: "Copy", shortcut: `${modLabel}C`, disabled: !hasSelection, action: commands.copy },
    { type: "action", label: "Paste", shortcut: `${modLabel}V`, disabled: !editor.clipboard.has(), action: commands.paste },
    { type: "action", label: "Duplicate", shortcut: `${modLabel}D`, disabled: !hasSelection, action: commands.duplicate },
    { type: "separator" },
    { type: "action", label: "Bring to Front", shortcut: "]", disabled: !singleNode, action: commands.bringToFront },
    { type: "action", label: "Bring Forward", disabled: !singleNode, action: commands.bringForward },
    { type: "action", label: "Send Backward", disabled: !singleNode, action: commands.sendBackward },
    { type: "action", label: "Send to Back", shortcut: "[", disabled: !singleNode, action: commands.sendToBack },
    { type: "separator" },
    ...(singleNode ? [
      { type: "action" as const, label: singleNode.locked ? "Unlock" : "Lock", action: () => commands.setLocked(!singleNode.locked) },
      { type: "action" as const, label: singleNode.visible === false ? "Show" : "Hide", action: () => commands.setVisible(singleNode.visible === false) },
      { type: "separator" as const },
    ] : []),
    { type: "action", label: "Delete", shortcut: "Del", disabled: !hasSelection, action: commands.remove },
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) =>
        item.type === "separator" ? (
          <div key={`sep-${index}`} className="context-menu-separator" />
        ) : (
          <button
            key={`${item.label}-${index}`}
            className="context-menu-item"
            disabled={item.disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              item.action();
            }}
          >
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut ? <span className="context-menu-shortcut">{item.shortcut}</span> : null}
          </button>
        ),
      )}
    </div>
  );
}
