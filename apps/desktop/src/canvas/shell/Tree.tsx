import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import {
  bringToFront,
  deleteElements,
  duplicateElements,
  reorderElement,
  sendToBack,
  setElementLocked,
  setElementVisible,
} from "@/canvas/engine/actions";
import { copyElements, hasClipboard, pasteElements } from "@/canvas/engine/clipboard";
import { useEditorBridge, useEditorBridgeReader } from "@/canvas/engine/bridge";
import type { CanvasDocument } from "@/canvas/engine/types";
import { CANVAS_WINDOW_LABELS, type CanvasWindowType } from "@/canvas/canvasUtils";

import type { DeviceType, ProjectTreeNode } from "./tree/treeTypes";
import {
  ancestorIdsForNodeIds,
  documentTreeShapeEqual,
  findNode,
  initiallyOpen,
  structureKey,
  treeFromCanvasDocument,
  visibleNodeIds,
} from "./tree/treeHelpers";
import { BackFooter } from "./tree/BackFooter";
import { CurrentSceneTreeRow } from "./tree/CurrentSceneTreeRow";
import { PickerNode } from "./tree/PickerNode";
import { TreeRow } from "./tree/TreeRow";
import { IconClose, IconLayers } from "@/components/icons";

export type { ProjectTreeNode };

type TreeContextMenuState = {
  x: number;
  y: number;
  targetId: string | null;
} | null;

type TreeContextMenuItem =
  | { type: "action"; label: string; shortcut?: string; disabled?: boolean; action: () => void }
  | { type: "separator" };

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
  componentName?: string;
  screenName?: string;
  document?: CanvasDocument | null;
  selectedNodeId?: string | null;
  selectedNodeIds?: readonly string[];
  autoRevealSelection?: boolean;
  canvasActive?: boolean;
  onSelectNode?: (nodeId: string) => void;
  onReorderNode?: (activeNodeId: string, overNodeId: string) => void;
  onToggleVisible?: (nodeId: string, visible: boolean) => void;
  onToggleLocked?: (nodeId: string, locked: boolean) => void;
  onToggleCanvasActive?: (active: boolean) => void;
  canOpenNodeCanvas?: (nodeId: string) => boolean;
  onOpenNodeCanvas?: (nodeId: string) => void;
  onGoToInstance?: (variantId: string) => void;
  onDetachNode?: (nodeId: string) => void;
  onOpenProjectNode?: (node: ProjectTreeNode) => void;
  activeTab?: CanvasWindowType;
  enabledTabs?: readonly CanvasWindowType[];
  onTabChange?: (tab: CanvasWindowType) => void;
  projectType?: DeviceType;
  projectTree?: ProjectTreeNode[];
  parentNode?: ProjectTreeNode | null;
  subjectSize?: { width: number; height: number };
};

export function Tree({
  open,
  onClose,
  componentName,
  screenName,
  document: documentProp,
  selectedNodeId,
  selectedNodeIds,
  autoRevealSelection = true,
  canvasActive = false,
  onSelectNode,
  onReorderNode,
  onToggleVisible,
  onToggleLocked,
  onToggleCanvasActive,
  canOpenNodeCanvas,
  onOpenNodeCanvas,
  onGoToInstance,
  onDetachNode,
  onOpenProjectNode,
  activeTab = "current",
  projectType,
  projectTree,
  parentNode,
  subjectSize,
}: Props) {
  const bridgeDocument = useEditorBridge(
    (value) => value?.state.document ?? null,
    documentTreeShapeEqual,
  );
  const document = documentProp !== undefined ? documentProp : bridgeDocument;
  const tree = useMemo(() => {
    if (document) return treeFromCanvasDocument(document, componentName || screenName || "Canvas");
    return treeFromCanvasDocument(null, componentName || screenName || "Canvas");
  }, [componentName, document, screenName]);
  const treeStructureKey = useMemo(() => structureKey(tree.root), [tree]);

  const [openSet, setOpenSet] = useState<Set<string>>(() => initiallyOpen(tree.root));
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  const pickerTree = projectTree ?? [];
  const selectedIds =
    selectedNodeIds ??
    (selectedNodeId != null
      ? [selectedNodeId]
      : localSelectedId
        ? [localSelectedId]
        : []);
  const selectedIdsKey = JSON.stringify(selectedIds);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIdsKey]);
  const visibleLayerIds = useMemo(
    () => visibleNodeIds(tree.root, openSet),
    [openSet, tree.root],
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

  useEffect(() => {
    if (!autoRevealSelection || selectedIds.length === 0) return;

    const revealTargetId = selectedIds.find((id) => findNode(tree.root, id));
    if (!revealTargetId) return;

    const ancestorIds = ancestorIdsForNodeIds(tree.root, selectedIds);
    if (ancestorIds.size > 0) {
      setOpenSet((current) => {
        const next = new Set(current);
        let changed = false;
        for (const id of ancestorIds) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        scrollTreeNodeIntoView(layerTreeRef.current, revealTargetId);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [autoRevealSelection, selectedIdsKey, tree.root, treeStructureKey]);

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
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<TreeContextMenuState>(null);
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

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: PointerEvent) => {
      if (
        !pickerRef.current?.contains(e.target as Node) &&
        !pickerTriggerRef.current?.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    };
    window.addEventListener("pointerdown", handler, true);
    return () => window.removeEventListener("pointerdown", handler, true);
  }, [pickerOpen]);

  if (!open) return null;

  const headerName = componentName || screenName || "Frame";
  const isScreen = !componentName && !!screenName;
  const focusedWindowLabel = activeTab === "current" ? null : CANVAS_WINDOW_LABELS[activeTab];
  const rowWidth = subjectSize?.width ?? document?.canvas.width;
  const rowHeight = subjectSize?.height ?? document?.canvas.height;

  return (
    <>
    <aside
      aria-label="Camadas"
      className="pointer-events-auto fixed bottom-3 left-3 top-16 z-[6] flex w-[300px] flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] text-[#F2F2F2]"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
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

      <>
        <div ref={pickerTriggerRef}>
          <CurrentSceneTreeRow
            active={canvasActive}
            label={headerName}
            width={rowWidth}
            height={rowHeight}
            isScreen={isScreen}
            projectType={projectType ?? "mobile"}
            pickerOpen={pickerOpen}
            onOpenPicker={(rect) => {
              setPickerAnchor({ left: rect.left, top: rect.bottom + 4 });
              setPickerOpen((v) => !v);
            }}
            onToggleEdit={() => onToggleCanvasActive?.(!canvasActive)}
          />
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleLayerIds}
            strategy={verticalListSortingStrategy}
          >
            <div ref={layerTreeRef} role="tree" className="flex-1 overflow-y-auto pb-3 pt-1">
              {(tree.root.children || []).map((c) => (
                <TreeRow
                  key={c.id}
                  node={c}
                  depth={0}
                  openSet={openSet}
                  setOpenSet={setOpenSet}
                  selectedIds={selectedIdSet}
                  setSelectedId={selectLayer}
                  sortable={Boolean(onReorderNode)}
                  onToggleVisible={onToggleVisible}
                  onToggleLocked={onToggleLocked}
                  canOpenNodeCanvas={canOpenNodeCanvas}
                  onOpenNodeCanvas={onOpenNodeCanvas}
                  onGoToInstance={onGoToInstance}
                  onDetachNode={onDetachNode}
                  showFocusButton={isDraftMode}
                  onFocusNode={focusNode}
                  onContextMenuNode={(nodeId, x, y) => {
                    setContextMenu({ x, y, targetId: nodeId });
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </>

      <BackFooter
        parentNode={parentNode}
        onBack={() => parentNode && onOpenProjectNode?.(parentNode)}
      />
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
      className="fixed bottom-6 left-3 z-[11] inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-lg border border-[#2C2C2C] bg-[#1E1E1E] px-3 text-[13px] font-medium text-[#CFCFCF] transition-colors hover:bg-[#2A2A2A] hover:text-[var(--text)]"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <IconLayers size={13} strokeWidth={1.7} />
      Camadas
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

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

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
  const { state, dispatch } = editor;
  const selectedIds = state.selectedIds;
  const hasSelection = selectedIds.length > 0;
  const singleId = selectedIds.length === 1 ? selectedIds[0] : null;
  const singleNode = singleId ? state.document.elements[singleId] : null;

  const commit = (document: CanvasDocument, ids?: string[]) => {
    dispatch({ type: "commitDocument", document, selectedIds: ids ?? state.selectedIds });
    onClose();
  };

  const items: TreeContextMenuItem[] = [
    { type: "action", label: "Copy", shortcut: `${modLabel}C`, disabled: !hasSelection, action: () => { copyElements(state.document, selectedIds); onClose(); } },
    { type: "action", label: "Paste", shortcut: `${modLabel}V`, disabled: !hasClipboard(), action: () => { const result = pasteElements(state.document); if (result) commit(result.document, result.selectedIds); else onClose(); } },
    { type: "action", label: "Duplicate", shortcut: `${modLabel}D`, disabled: !hasSelection, action: () => { const result = duplicateElements(state.document, selectedIds); commit(result.document, result.selectedIds); } },
    { type: "separator" },
    { type: "action", label: "Bring to Front", shortcut: "]", disabled: !singleNode, action: () => { if (singleId) commit(bringToFront(state.document, singleId)); } },
    { type: "action", label: "Bring Forward", disabled: !singleNode, action: () => { if (singleId) commit(reorderElement(state.document, singleId, "forward")); } },
    { type: "action", label: "Send Backward", disabled: !singleNode, action: () => { if (singleId) commit(reorderElement(state.document, singleId, "backward")); } },
    { type: "action", label: "Send to Back", shortcut: "[", disabled: !singleNode, action: () => { if (singleId) commit(sendToBack(state.document, singleId)); } },
    { type: "separator" },
    ...(singleNode ? [
      { type: "action" as const, label: singleNode.locked ? "Unlock" : "Lock", action: () => commit(setElementLocked(state.document, singleId!, !singleNode.locked)) },
      { type: "action" as const, label: singleNode.visible === false ? "Show" : "Hide", action: () => commit(setElementVisible(state.document, singleId!, singleNode.visible === false)) },
      { type: "separator" as const },
    ] : []),
    { type: "action", label: "Delete", shortcut: "Del", disabled: !hasSelection, action: () => commit(deleteElements(state.document, selectedIds), []) },
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
