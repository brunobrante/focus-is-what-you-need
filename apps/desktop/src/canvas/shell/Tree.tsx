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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { constrainAll } from "@/canvas/engine/actions";
import { useEditorBridge } from "@/canvas/engine/bridge";
import { CANVAS_DOCUMENT_SAVED_EVENT, DRAFTS_CANVAS_STORAGE_KEY } from "@/canvas/engine/storageKeys";
import type { CanvasDocument } from "@/canvas/engine/types";

import type { DeviceType, ProjectTreeNode } from "./tree/treeTypes";
import {
  countNodes,
  documentTreeShapeEqual,
  initiallyOpen,
  structureKey,
  treeFromCanvasDocument,
  visibleNodeIds,
} from "./tree/treeHelpers";
import { BackFooter } from "./tree/BackFooter";
import { CurrentSceneTreeRow } from "./tree/CurrentSceneTreeRow";
import { PickerNode } from "./tree/PickerNode";
import { TreeRow } from "./tree/TreeRow";

export type { ProjectTreeNode };

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
  document: documentProp,
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
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerTriggerRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
    <aside
      aria-label="Camadas"
      className="pointer-events-auto fixed bottom-3 left-3 top-16 z-[6] flex w-[300px] flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] text-[#F2F2F2]"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <div className="flex h-11 shrink-0 items-stretch justify-between border-b border-[#2C2C2C] bg-[#141414] pl-1.5 pr-2">
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
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] text-[#6B6B6B]"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {activeTab === "layers" ? totalCount : draftsCount}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] border border-[#2C2C2C] bg-transparent text-[#9A9A9A] hover:bg-[#2A2A2A] hover:text-[var(--text)]"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      {activeTab === "layers" ? (
        <>
          <div ref={pickerTriggerRef}>
            <CurrentSceneTreeRow
              active={canvasActive}
              label={headerName}
              width={document?.canvas.width}
              height={document?.canvas.height}
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
              <div role="tree" className="flex-1 overflow-y-auto pb-3 pt-1">
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
        </>
      ) : (
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
      )}

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
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5h18M3 12h12M3 19h18" />
      </svg>
      Camadas
    </button>
  );
}
