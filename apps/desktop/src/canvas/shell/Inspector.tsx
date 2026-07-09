import { useEffect, useRef, useState } from "react";
import {
  windowKeyLabel,
  type CanvasWindowKey,
  type CanvasFeatureFlags,
  type CanvasFeatureWindowType,
} from "@/canvas/canvasUtils";
import { useEditorBridge, useEditorBridgeReader, type EditorBridgeValue } from "@/canvas/engine/bridge";
import type { EditorAction } from "@/canvas/engine/store";
import {
  alignElements,
  renameElement,
  setTextElementSizing,
  setElementLocked,
  setElementVisible,
  updateCanvasProperties,
  updateElementGeometry,
  updateElementImageSource,
  updateElementRotation,
  updateElementStyles,
  updateElementText,
  updateShellBackground,
  updateShellGrid,
  flattenElementToPath,
  applyBooleanToSelection,
  DEFAULT_SHELL_GRID,
} from "@/canvas/engine/actions";
import type { BooleanOp } from "@/canvas/engine/vector/boolean";
import type { AncestorOverlayItem, AncestorOverlayState, CanvasDocument, CanvasProperties, ElementSizing, ElementStyles } from "@/canvas/engine/types";
import { ancestorOverlayItemFor, type AncestorFrame } from "@/canvas/canvasUtils";
import { getInstanceRootId } from "@/canvas/engine/geometry";
import { ElementTab, elementTypeLabel } from "./inspector/ElementTab";
import { MultiSelectTab } from "./inspector/MultiSelectTab";
import { CanvasTab } from "./inspector/CanvasTab";
import { LayoutTab } from "./inspector/LayoutTab";
import { ShellTab, type ShellControlVisibility } from "./inspector/ShellTab";
import { EmptyState } from "./inspector/InsComponents";
import { ReferencesElementTab } from "./inspector/ReferencesElementTab";
import { ReferencesShellTab } from "./inspector/ReferencesShellTab";
import { useReferencesBridge } from "@/canvas/shell/references/ReferencesBridge";
import { findStackNode } from "@/routes/references/lib/stackHelpers";
import { TypeIcon } from "./tree/TypeIcon";
import { IconClose, IconEllipse, IconImage } from "@/components/icons";
import { PanelResizeHandle } from "./PanelResizeHandle";

type InspectorProps = {
  open: boolean;
  onClose: () => void;
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  editor?: EditorBridgeValue | null;
  shellDeviceVisibility: ShellControlVisibility;
  shellBackVisibility: ShellControlVisibility;
  shellZoomVisibility: ShellControlVisibility;
  shellExpandVisibility: ShellControlVisibility;
  onShellDeviceVisibilityChange: (v: ShellControlVisibility) => void;
  onShellBackVisibilityChange: (v: ShellControlVisibility) => void;
  onShellZoomVisibilityChange: (v: ShellControlVisibility) => void;
  onShellExpandVisibilityChange: (v: ShellControlVisibility) => void;
  /** Incrementing this counter forces the Shell tab to become active. */
  openShellTabSignal?: number;
  isComponent?: boolean;
  inheritParentBackground?: boolean;
  hasParent?: boolean;
  onInheritParentBackgroundChange?: (value: boolean) => void;
  ancestorFrames?: AncestorFrame[];
  /** Opens the master variant a linked instance points to (used by the locked banner). */
  onGoToInstance?: (variantId: string) => void;
  /** The focused canvas window. When "references" the Element tab inspects the
   * selected reference stack node (via ReferencesBridge) instead of a canvas element. */
  activeCanvasTab?: CanvasWindowKey;
  /** Window controls for the Layout tab (always shown when provided). */
  canvasFeatures?: CanvasFeatureFlags;
  onCanvasFeatureChange?: (feature: CanvasFeatureWindowType, enabled: boolean) => void;
};

const EMPTY_ANCESTOR_OVERLAY: AncestorOverlayState = { enabled: false, items: {} };

type InspectorTab = "element" | "canvas" | "shell" | "layout";

export function Inspector({
  open,
  onClose,
  width,
  minWidth,
  maxWidth,
  onResize,
  editor: editorProp,
  isComponent = false,
  inheritParentBackground = false,
  hasParent = false,
  onInheritParentBackgroundChange,
  ancestorFrames = [],
  onGoToInstance,
  activeCanvasTab,
  shellDeviceVisibility,
  shellBackVisibility,
  shellZoomVisibility,
  shellExpandVisibility,
  onShellDeviceVisibilityChange,
  onShellBackVisibilityChange,
  onShellZoomVisibilityChange,
  onShellExpandVisibilityChange,
  openShellTabSignal,
  canvasFeatures,
  onCanvasFeatureChange,
}: InspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("element");
  const layoutTabAvailable = !!canvasFeatures && !!onCanvasFeatureChange;
  // The Layout tab vanishes once a second window is enabled (the nav takes over) —
  // fall back to Element so the body never points at a missing tab.
  useEffect(() => {
    if (!layoutTabAvailable && activeTab === "layout") setActiveTab("element");
  }, [layoutTabAvailable, activeTab]);
  // Slider / native-color scrubbing (H3): while dragging, style/fill edits dispatch
  // transient frames and coalesce into a single commit on release, instead of one
  // full-document clone + undo entry per input tick (which overflowed the 80-cap
  // history and wiped all prior undo steps).
  const scrubbingRef = useRef(false);
  const scrubBeforeRef = useRef<CanvasDocument | null>(null);
  const scrubLastRef = useRef<CanvasDocument | null>(null);
  const prevShellTabSignalRef = useRef(openShellTabSignal ?? 0);
  useEffect(() => {
    if (openShellTabSignal !== undefined && openShellTabSignal !== prevShellTabSignalRef.current) {
      prevShellTabSignalRef.current = openShellTabSignal;
      setActiveTab("shell");
    }
  }, [openShellTabSignal]);

  const bridgeDocument = useEditorBridge((v) => v?.state.document ?? null);
  const bridgeSelectedId = useEditorBridge((v) => v?.state.selectedIds[0] ?? null);
  const bridgeSelectedCount = useEditorBridge((v) => v?.state.selectedIds.length ?? 0);
  const bridgeCanvasStageActive = useEditorBridge((v) => v?.state.canvasStageActive ?? false);
  const bridgeActiveGradientEdit = useEditorBridge((v) => v?.state.activeGradientEdit ?? null);
  const bridgeSourceId = useEditorBridge((v) => v?.sourceId ?? null);
  const bridgeAncestorOverlay = useEditorBridge((v) => v?.state.ancestorOverlay ?? null);
  const getEditorSnapshot = useEditorBridgeReader();

  // References window: the Element tab inspects the selected stack node (shared via
  // ReferencesBridge) rather than a canvas element. When active it overrides the
  // editor-driven body/header below.
  const referencesBridge = useReferencesBridge();
  const isReferencesActive = activeCanvasTab === "references";
  const referenceNode =
    isReferencesActive && referencesBridge.stackMode && referencesBridge.selectedNodeId
      ? findStackNode(referencesBridge.tree, referencesBridge.selectedNodeId)
      : null;

  const document = editorProp !== undefined ? (editorProp?.state.document ?? null) : bridgeDocument;
  const ancestorOverlay =
    (editorProp !== undefined ? editorProp?.state.ancestorOverlay : bridgeAncestorOverlay) ?? EMPTY_ANCESTOR_OVERLAY;
  const selectedId = editorProp !== undefined ? (editorProp?.state.selectedIds[0] ?? null) : bridgeSelectedId;
  const selectedCount = editorProp !== undefined ? (editorProp?.state.selectedIds.length ?? 0) : bridgeSelectedCount;
  const canvasStageActive = editorProp !== undefined ? (editorProp?.state.canvasStageActive ?? false) : bridgeCanvasStageActive;
  const activeGradientEdit =
    editorProp !== undefined ? (editorProp?.state.activeGradientEdit ?? null) : bridgeActiveGradientEdit;
  const sourceId = editorProp !== undefined ? editorProp?.sourceId : bridgeSourceId;
  const sourceLabel = windowKeyLabel(sourceId ?? "current");
  const node = document && selectedId ? document.elements[selectedId] ?? null : null;
  // Linked instances are read-only in the inspector (Versioning.md §2). The fields stay
  // visible but locked; detaching or "go to component" is the only way to edit. This
  // holds for both an instance ROOT and any element INSIDE it (a descendant), in every
  // window — a placed/global linked component reads the same read-only way it does in
  // the Versions window. The root can still be moved/resized/detached as a whole on the
  // canvas (its node is not locked); only its editable *properties* are gated here.
  const instanceRootId = document ? getInstanceRootId(document, selectedId) : null;
  const isInstanceDescendant = instanceRootId != null && instanceRootId !== selectedId;
  const elementLocked = isInstanceDescendant || node?.instanceOf != null;
  // The master variant to open from the banner link — the root's link (works whether the
  // root itself or one of its descendants is selected).
  const lockedInstanceVariantId = instanceRootId
    ? document?.elements[instanceRootId]?.instanceOf?.variantId ?? null
    : null;

  useEffect(() => {
    if (canvasStageActive) setActiveTab("canvas");
    else if (node) setActiveTab("element");
  }, [node?.id, canvasStageActive]);

  if (!open) return null;

  const commitDocument = (nextDocument: CanvasDocument | null = document, selectedIds?: string[]) => {
    if (!nextDocument) return;
    const editor = editorProp ?? getEditorSnapshot();
    // While scrubbing a slider / native color input, route every tick through a
    // transient frame (no history entry) and remember the latest frame so the
    // release can commit it as one undo step (H3).
    if (scrubbingRef.current) {
      scrubLastRef.current = nextDocument;
      editor?.dispatch({
        type: "setDocumentTransient",
        document: nextDocument,
        ...(node ? { changedIds: [node.id] } : {}),
      });
      return;
    }
    editor?.dispatch({
      type: "commitDocument",
      document: nextDocument,
      ...(selectedIds !== undefined ? { selectedIds } : {}),
    });
  };

  // Begin a scrub: snapshot the committed document as the single undo baseline.
  const onScrubStart = () => {
    if (scrubbingRef.current) return;
    scrubbingRef.current = true;
    scrubBeforeRef.current = (editorProp ?? getEditorSnapshot())?.state.document ?? document ?? null;
    scrubLastRef.current = null;
  };
  // End a scrub: commit the last transient frame as one entry, against the baseline.
  const onScrubEnd = () => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    const before = scrubBeforeRef.current;
    const last = scrubLastRef.current;
    scrubBeforeRef.current = null;
    scrubLastRef.current = null;
    if (before && last) {
      (editorProp ?? getEditorSnapshot())?.dispatch({
        type: "commitDocument",
        document: last,
        beforeDocument: before,
      });
    }
  };

  const dispatchAncestor = (action: EditorAction) => {
    (editorProp ?? getEditorSnapshot())?.dispatch(action);
  };
  const onToggleAncestorOverlay = (enabled: boolean) => {
    dispatchAncestor({ type: "setAncestorOverlayEnabled", enabled });
  };
  const onUpdateAncestorItem = (id: string, patch: Partial<AncestorOverlayItem>) => {
    dispatchAncestor({ type: "updateAncestorOverlayItem", id, patch });
    // When the last visible frame drops to 0% there is nothing left to show, so
    // turn the whole overlay off automatically.
    if (patch.opacity === 0) {
      const allZero = ancestorFrames.every((frame) => {
        const opacity = frame.id === id ? 0 : ancestorOverlayItemFor(ancestorOverlay, frame.id).opacity;
        return opacity === 0;
      });
      if (allZero) dispatchAncestor({ type: "setAncestorOverlayEnabled", enabled: false });
    }
  };

  const commitCanvas = (props: Partial<CanvasProperties>) => {
    if (!document) return;
    commitDocument(updateCanvasProperties(document, props));
  };

  const commitStyle = (styles: Partial<ElementStyles>) => {
    if (!document || !node) return;
    commitDocument(updateElementStyles(document, node.id, styles));
  };

  // The Fill panel can change the style (`fills` / `background`) AND the image
  // `src` together; commit both in ONE document so the second mutation doesn't
  // overwrite the first (both read the same snapshot).
  const commitFill = (styles: Partial<ElementStyles>, src?: string) => {
    if (!document || !node) return;
    let next = updateElementStyles(document, node.id, styles);
    if (src !== undefined) next = updateElementImageSource(next, node.id, src);
    commitDocument(next);
  };

  const commitSizing = (sizing: ElementSizing) => {
    if (!document || !node) return;
    commitDocument(setTextElementSizing(document, node.id, sizing));
  };

  const onEditPath = () => {
    if (!node) return;
    (editorProp ?? getEditorSnapshot())?.dispatch({ type: "enterPathEdit", pathEditId: node.id });
  };
  const onFlattenToPath = () => {
    if (!document || !node) return;
    commitDocument(flattenElementToPath(document, node.id), [node.id]);
  };
  const onBooleanOp = (op: BooleanOp) => {
    if (!document) return;
    const ids = (editorProp ?? getEditorSnapshot())?.state.selectedIds ?? [];
    const result = applyBooleanToSelection(document, ids, op);
    if (result) commitDocument(result.document, [result.selectedId]);
  };

  const headerTitle = isReferencesActive
    ? referenceNode?.component.name ?? "Inspector"
    : canvasStageActive
      ? "Frame"
      : node
        ? node.name
        : "Inspector";
  const headerMeta = isReferencesActive
    ? referenceNode?.component.type ?? sourceLabel
    : canvasStageActive
      ? `${document?.canvas.width ?? 0}×${document?.canvas.height ?? 0}px`
      : node
        ? elementTypeLabel(node.type)
        : sourceLabel;

  return (
    <aside
      aria-label="Inspector"
      className="pointer-events-auto relative flex h-full shrink-0 flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] text-[#F2F2F2]"
      style={{ width, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <PanelResizeHandle
        side="left"
        width={width}
        min={minWidth}
        max={maxWidth}
        onResize={onResize}
      />
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#2C2C2C] pl-3 pr-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid shrink-0 place-items-center text-[#9A9A9A]" style={{ width: 16, height: 16 }}>
            {isReferencesActive ? (
              <IconImage size={14} strokeWidth={1.7} />
            ) : canvasStageActive || node ? (
              <TypeIcon type={node?.type ?? "frame"} />
            ) : (
              <IconEllipse size={14} strokeWidth={1.7} />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium">{headerTitle}</span>
            <span className="block truncate text-[10.5px] text-[#6B6B6B]">{headerMeta}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[7px] border border-transparent bg-transparent text-[#9A9A9A] transition-colors hover:bg-[#2C2C2C] hover:text-[#EDEDED]"
        >
          <IconClose size={11} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex shrink-0 border-b border-[#2C2C2C] px-1.5">
        {((isReferencesActive
          ? [
              { id: "element", label: "Element" },
              { id: "shell", label: "Shell" },
            ]
          : [
              { id: "element", label: "Element" },
              { id: "canvas", label: "Frame" },
              { id: "shell", label: "Shell" },
              ...(layoutTabAvailable ? [{ id: "layout", label: "Layout" }] : []),
            ]) as { id: InspectorTab; label: string }[]
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "element" && canvasStageActive) {
                  (editorProp ?? getEditorSnapshot())?.dispatch({ type: "setCanvasStageActive", active: false });
                }
              }}
              className="relative cursor-pointer border-0 bg-transparent px-2.5 py-2 text-[12px] font-medium"
              style={{ color: isActive ? "#F2F2F2" : "#9A9A9A" }}
            >
              {tab.label}
              {isActive ? (
                <span aria-hidden className="absolute -bottom-px left-2 right-2 h-0.5 rounded-[2px] bg-[#F2F2F2]" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {isReferencesActive ? (
          activeTab === "shell" ? (
            <ReferencesShellTab
              zoomVisibility={shellZoomVisibility}
              expandVisibility={shellExpandVisibility}
              onZoomVisibilityChange={onShellZoomVisibilityChange}
              onExpandVisibilityChange={onShellExpandVisibilityChange}
            />
          ) : (
            <ReferencesElementTab />
          )
        ) : activeTab === "layout" && canvasFeatures && onCanvasFeatureChange ? (
          <LayoutTab canvasFeatures={canvasFeatures} onCanvasFeatureChange={onCanvasFeatureChange} />
        ) : !document ? (
          <EmptyState title="No active canvas" body="Select a canvas window to inspect." />
        ) : activeTab === "canvas" ? (
          <CanvasTab
            canvas={document.canvas}
            active={canvasStageActive}
            onToggleActive={(active) => (editorProp ?? getEditorSnapshot())?.dispatch({ type: "setCanvasStageActive", active })}
            onUpdate={commitCanvas}
          />
        ) : activeTab === "shell" ? (
          <ShellTab
            background={document.shellBackground ?? "#000000"}
            shellGrid={document.shellGrid ?? DEFAULT_SHELL_GRID}
            onUpdateBackground={(background) => commitDocument(updateShellBackground(document, background))}
            onUpdateGrid={(grid) => commitDocument(updateShellGrid(document, grid))}
            deviceVisibility={shellDeviceVisibility}
            backVisibility={shellBackVisibility}
            zoomVisibility={shellZoomVisibility}
            expandVisibility={shellExpandVisibility}
            onDeviceVisibilityChange={onShellDeviceVisibilityChange}
            onBackVisibilityChange={onShellBackVisibilityChange}
            onZoomVisibilityChange={onShellZoomVisibilityChange}
            onExpandVisibilityChange={onShellExpandVisibilityChange}
            isComponent={isComponent}
            inheritParentBackground={inheritParentBackground}
            hasParent={hasParent}
            onInheritParentBackgroundChange={onInheritParentBackgroundChange}
            ancestorFrames={ancestorFrames}
            ancestorOverlay={ancestorOverlay}
            onToggleAncestorOverlay={onToggleAncestorOverlay}
            onUpdateAncestorItem={onUpdateAncestorItem}
          />
        ) : selectedCount > 1 ? (
          <div className="flex flex-col">
            <MultiSelectTab
              nodes={((editorProp ?? getEditorSnapshot())?.state.selectedIds ?? [])
                .map((id) => document.elements[id])
                .filter((n): n is NonNullable<typeof n> => Boolean(n))}
              document={document}
              commitDocument={(next) => commitDocument(next)}
            />
            <div className="flex flex-col gap-2 border-t border-[#2C2C2C] px-3 py-3">
              <span className="text-[11px] font-medium text-[#9A9A9A]">Boolean</span>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ["union", "Union"],
                  ["subtract", "Subtract"],
                  ["intersect", "Intersect"],
                  ["exclude", "Exclude"],
                ] as const).map(([op, label]) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => onBooleanOp(op)}
                    className="flex h-[30px] cursor-pointer items-center justify-center rounded-[8px] bg-[#242424] px-2 text-[12px] font-medium text-[#EDEDED] transition-colors hover:bg-[#2E2E2E]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : !node ? (
          <EmptyState title="No element selected" body="Select an element in the tree or canvas." />
        ) : (
          <ElementTab
            node={node}
            document={document}
            onUpdateName={(name) => commitDocument(renameElement(document, node.id, name))}
            onUpdateText={(text) => commitDocument(updateElementText(document, node.id, text))}
            onUpdateGeometry={(patch) => commitDocument(updateElementGeometry(document, node.id, patch))}
            onUpdateRotation={(rotation) => commitDocument(updateElementRotation(document, node.id, rotation))}
            onUpdateStyle={commitStyle}
            onUpdateFill={commitFill}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
            onUpdateSizing={commitSizing}
            onAlign={(edge) => commitDocument(alignElements(document, [node.id], edge))}
            canvasEditFillIndex={
              activeGradientEdit?.elementId === node.id ? activeGradientEdit.fillIndex : null
            }
            onToggleCanvasEdit={(fillIndex) =>
              (editorProp ?? getEditorSnapshot())?.dispatch({
                type: "setActiveGradientEdit",
                target: fillIndex === null ? null : { elementId: node.id, fillIndex },
              })
            }
            onEditPath={onEditPath}
            onFlattenToPath={onFlattenToPath}
            onToggleLocked={(locked) => commitDocument(setElementLocked(document, node.id, locked))}
            onToggleVisible={(visible) => {
              const ids = (editorProp ?? getEditorSnapshot())?.state.selectedIds ?? [];
              commitDocument(
                setElementVisible(document, node.id, visible),
                visible ? ids : [],
              );
            }}
            locked={elementLocked}
            lockedInstanceVariantId={lockedInstanceVariantId}
            onGoToInstance={onGoToInstance}
          />
        )}
      </div>

      <div
        className="flex shrink-0 items-center justify-between border-t border-[#2C2C2C] px-3 py-2 text-[11px] text-[#6B6B6B]"
        style={{ letterSpacing: "0.2px" }}
      >
        <span>auto-save</span>
        <span className="truncate" style={{ fontFeatureSettings: '"tnum"' }}>
          {node ? `${node.width}×${node.height} px` : document ? `${document.canvas.width}×${document.canvas.height} px` : "—"}
        </span>
      </div>
    </aside>
  );
}
