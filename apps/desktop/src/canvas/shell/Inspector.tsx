import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  windowKeyLabel,
  type CanvasWindowKey,
  type CanvasFeatureFlags,
  type CanvasFeatureWindowType,
} from "@/canvas/canvasUtils";
import { useEditorBridge, useEditorBridgeReader } from "@/canvas/engine/bridge";
import { getVisibleWindowRect } from "@/canvas/engine/geometry";
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
  applyTextRunStyles,
  updateShellBackground,
  updateShellGrid,
  flattenElementToPath,
  applyBooleanToSelection,
  DEFAULT_SHELL_GRID,
} from "@/canvas/engine/actions";
import type { BooleanOp } from "@/canvas/engine/vector/boolean";
import type {
  AncestorOverlayItem,
  AncestorOverlayState,
  CanvasDocument,
  CanvasProperties,
  ElementNode,
  ElementSizing,
  ElementStyles,
  Rect,
} from "@/canvas/engine/types";
import { partitionRunStyles } from "@/domain/canvas/textRuns";
import type { TextSelection } from "@/canvas/engine/textSelectionStore";
import { ancestorOverlayItemFor, type AncestorFrame } from "@/canvas/canvasUtils";
import { getAbsoluteRect, getInstanceRootId } from "@/canvas/engine/geometry";
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
const EMPTY_IDS: string[] = [];
const EMPTY_NODES: ElementNode[] = [];

// Equality functions for the bridge selectors below (P4). A selector that builds a
// fresh array/object every call would defeat the bridge's identity cache and
// re-render on every published frame — these let it bail on unchanged values.
function sameRefs<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * The caret/selection of the active text-editing session (G10). It lives in a
 * per-editor store rather than the reducer, so the bridge gives us the store and
 * we subscribe to its value — the Inspector re-renders on a selection change, and
 * on nothing else the store publishes.
 */
function useActiveTextSelection(): TextSelection | null {
  const store = useEditorBridge((v) => v?.textSelectionStore ?? null);
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? (() => {}),
    [store],
  );
  const getSnapshot = useCallback(() => store?.get() ?? null, [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The selection to style, or null when the whole element should be styled. */
function runStyleSelection(
  node: ElementNode | null,
  selection: TextSelection | null,
): { start: number; end: number } | null {
  if (!node || node.type !== "text" || !selection) return null;
  if (selection.nodeId !== node.id || selection.end <= selection.start) return null;
  return { start: selection.start, end: selection.end };
}

type InspectorTab = "element" | "canvas" | "shell" | "layout";

export function Inspector({
  open,
  onClose,
  width,
  minWidth,
  maxWidth,
  onResize,
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

  // P4 — never subscribe to the whole document. A drag publishes a fresh document
  // ref every frame, so a `v.state.document` selector re-renders this entire panel
  // at 60 Hz even when the dragged element isn't the selected one. Instead each
  // slice the body actually renders gets its own selector (with value equality
  // where the slice is a freshly-built object), and every commit callback reads the
  // LIVE document at event time through `readDocument()` rather than closing over a
  // render-time snapshot — which is what made the full subscription load-bearing.
  const bridgeSelectedId = useEditorBridge((v) => v?.state.selectedIds[0] ?? null);
  const bridgeSelectedIds = useEditorBridge((v) => v?.state.selectedIds ?? EMPTY_IDS, sameRefs);
  const bridgeCanvasStageActive = useEditorBridge((v) => v?.state.canvasStageActive ?? false);
  const bridgeActiveGradientEdit = useEditorBridge((v) => v?.state.activeGradientEdit ?? null);
  const bridgeSourceId = useEditorBridge((v) => v?.sourceId ?? null);
  const bridgeAncestorOverlay = useEditorBridge((v) => v?.state.ancestorOverlay ?? null);
  const bridgeHasDocument = useEditorBridge((v) => v?.state.document != null);
  const bridgeCanvas = useEditorBridge((v) => v?.state.document.canvas ?? null);
  const bridgeShellBackground = useEditorBridge((v) => v?.state.document.shellBackground ?? null);
  const bridgeShellGrid = useEditorBridge((v) => v?.state.document.shellGrid ?? null);
  const getEditorSnapshot = useEditorBridgeReader();
  const activeTextSelection = useActiveTextSelection();

  // References window: the Element tab inspects the selected stack node (shared via
  // ReferencesBridge) rather than a canvas element. When active it overrides the
  // editor-driven body/header below.
  const referencesBridge = useReferencesBridge();
  const isReferencesActive = activeCanvasTab === "references";
  const referenceNode =
    isReferencesActive && referencesBridge.stackMode && referencesBridge.selectedNodeId
      ? findStackNode(referencesBridge.tree, referencesBridge.selectedNodeId)
      : null;

  const selectedId = bridgeSelectedId;
  // The selected node and everything the body derives from it. Each is its own
  // selector so an unrelated element's drag — which changes the document ref but
  // none of these values — publishes a frame that this panel ignores entirely.
  // `rect` walks ancestors, so it must be selected from the document: an ancestor
  // can move without the node's own ref changing.
  const node = useEditorBridge((v) => (selectedId ? v?.state.document.elements[selectedId] ?? null : null));
  const rect = useEditorBridge(
    (v) => (v && selectedId ? getAbsoluteRect(v.state.document, selectedId) : null),
    sameRect,
  );
  const parentStyles = useEditorBridge((v) => {
    if (!v || !selectedId) return null;
    const parentId = v.state.document.elements[selectedId]?.parentId;
    return parentId ? v.state.document.elements[parentId]?.styles ?? null : null;
  });
  // Linked instances are read-only in the inspector (Versioning.md §2). The fields stay
  // visible but locked; detaching or "go to component" is the only way to edit. This
  // holds for both an instance ROOT and any element INSIDE it (a descendant), in every
  // window — a placed/global linked component reads the same read-only way it does in
  // the Versions window. The root can still be moved/resized/detached as a whole on the
  // canvas (its node is not locked); only its editable *properties* are gated here.
  const instanceRootId = useEditorBridge((v) => (v ? getInstanceRootId(v.state.document, selectedId) : null));
  // The master variant to open from the banner link — the root's link (works whether the
  // root itself or one of its descendants is selected).
  const lockedInstanceVariantId = useEditorBridge((v) => {
    if (!v || !instanceRootId) return null;
    return v.state.document.elements[instanceRootId]?.instanceOf?.variantId ?? null;
  });
  const multiSelectNodes = useEditorBridge((v) => {
    if (!v || v.state.selectedIds.length < 2) return EMPTY_NODES;
    return v.state.selectedIds
      .map((id) => v.state.document.elements[id])
      .filter((n): n is ElementNode => Boolean(n));
  }, sameRefs);

  const ancestorOverlay = bridgeAncestorOverlay ?? EMPTY_ANCESTOR_OVERLAY;
  const selectedCount = bridgeSelectedIds.length;
  const canvasStageActive = bridgeCanvasStageActive;
  const activeGradientEdit = bridgeActiveGradientEdit;
  const hasDocument = bridgeHasDocument;
  const canvas = bridgeCanvas;
  const sourceLabel = windowKeyLabel(bridgeSourceId ?? "current");
  const isInstanceDescendant = instanceRootId != null && instanceRootId !== selectedId;
  const elementLocked = isInstanceDescendant || node?.instanceOf != null;

  /** The live document, read at event time — never closed over at render (P4). */
  const readDocument = (): CanvasDocument | null => getEditorSnapshot()?.state.document ?? null;

  useEffect(() => {
    if (canvasStageActive) setActiveTab("canvas");
    else if (node) setActiveTab("element");
  }, [node?.id, canvasStageActive]);

  if (!open) return null;

  const commitDocument = (nextDocument: CanvasDocument | null, selectedIds?: string[]) => {
    if (!nextDocument) return;
    const editor = getEditorSnapshot();
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

  /** Apply a mutation to the live document and commit the result. */
  const commitWith = (mutate: (live: CanvasDocument) => CanvasDocument) => {
    const live = readDocument();
    if (live) commitDocument(mutate(live));
  };

  // Begin a scrub: snapshot the committed document as the single undo baseline.
  const onScrubStart = () => {
    if (scrubbingRef.current) return;
    scrubbingRef.current = true;
    scrubBeforeRef.current = readDocument();
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
      getEditorSnapshot()?.dispatch({
        type: "commitDocument",
        document: last,
        beforeDocument: before,
      });
    }
  };

  const dispatchAncestor = (action: EditorAction) => {
    getEditorSnapshot()?.dispatch(action);
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
    const live = readDocument();
    if (!live) return;
    commitDocument(updateCanvasProperties(live, props));
  };

  const commitStyle = (styles: Partial<ElementStyles>) => {
    const live = readDocument();
    if (!live || !node) return;
    // With characters selected in the text editor, the per-run half of the patch
    // (font, weight, italic, color, spacing, strike) styles just those characters
    // and the rest still applies to the element (G10).
    const selection = runStyleSelection(node, activeTextSelection);
    if (!selection) {
      commitDocument(updateElementStyles(live, node.id, styles));
      return;
    }
    const { runPatch, elementPatch } = partitionRunStyles(styles);
    let next = live;
    if (Object.keys(elementPatch).length > 0) next = updateElementStyles(next, node.id, elementPatch);
    if (Object.keys(runPatch).length > 0) {
      next = applyTextRunStyles(next, node.id, selection.start, selection.end, runPatch);
    }
    commitDocument(next);
  };

  // The Fill panel can change the style (`fills` / `background`) AND the image
  // `src` together; commit both in ONE document so the second mutation doesn't
  // overwrite the first (both read the same snapshot).
  const commitFill = (styles: Partial<ElementStyles>, src?: string) => {
    const live = readDocument();
    if (!live || !node) return;
    let next = updateElementStyles(live, node.id, styles);
    if (src !== undefined) next = updateElementImageSource(next, node.id, src);
    commitDocument(next);
  };

  const commitSizing = (sizing: ElementSizing) => {
    const live = readDocument();
    if (!live || !node) return;
    commitDocument(setTextElementSizing(live, node.id, sizing));
  };

  const onEditPath = () => {
    if (!node) return;
    getEditorSnapshot()?.dispatch({ type: "enterPathEdit", pathEditId: node.id });
  };
  const onFlattenToPath = () => {
    const live = readDocument();
    if (!live || !node) return;
    commitDocument(flattenElementToPath(live, node.id), [node.id]);
  };
  const onBooleanOp = (op: BooleanOp) => {
    const editor = getEditorSnapshot();
    if (!editor) return;
    const result = applyBooleanToSelection(editor.state.document, editor.state.selectedIds, op);
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
      ? `${canvas?.width ?? 0}×${canvas?.height ?? 0}px`
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
                  getEditorSnapshot()?.dispatch({ type: "setCanvasStageActive", active: false });
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
        ) : !hasDocument || !canvas ? (
          <EmptyState title="No active canvas" body="Select a canvas window to inspect." />
        ) : activeTab === "canvas" ? (
          <CanvasTab
            canvas={canvas}
            active={canvasStageActive}
            onToggleActive={(active) => getEditorSnapshot()?.dispatch({ type: "setCanvasStageActive", active })}
            onUpdate={commitCanvas}
          />
        ) : activeTab === "shell" ? (
          <ShellTab
            background={bridgeShellBackground ?? "#000000"}
            shellGrid={bridgeShellGrid ?? DEFAULT_SHELL_GRID}
            onUpdateBackground={(background) => {
              const live = readDocument();
              if (live) commitDocument(updateShellBackground(live, background));
            }}
            onUpdateGrid={(grid) => {
              const live = readDocument();
              if (live) commitDocument(updateShellGrid(live, grid));
            }}
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
              nodes={multiSelectNodes}
              getDocument={readDocument}
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
            rect={rect}
            parentStyles={parentStyles}
            textSelection={runStyleSelection(node, activeTextSelection)}
            getDocument={readDocument}
            onUpdateName={(name) => commitWith((live) => renameElement(live, node.id, name))}
            onUpdateText={(text) => commitWith((live) => updateElementText(live, node.id, text))}
            onUpdateGeometry={(patch) => commitWith((live) => updateElementGeometry(live, node.id, patch))}
            onUpdateRotation={(rotation) => commitWith((live) => updateElementRotation(live, node.id, rotation))}
            onUpdateStyle={commitStyle}
            onUpdateFill={commitFill}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
            onUpdateSizing={commitSizing}
            onAlign={(edge) =>
              commitWith((live) =>
                alignElements(
                  live,
                  [node.id],
                  edge,
                  // Read the transient scroll lazily (no re-render subscription) so a
                  // root element aligns to the window the user is looking at.
                  getVisibleWindowRect(live, getEditorSnapshot()?.state.contentScroll ?? 0),
                ),
              )
            }
            canvasEditFillIndex={
              activeGradientEdit?.elementId === node.id ? activeGradientEdit.fillIndex : null
            }
            onToggleCanvasEdit={(fillIndex) =>
              getEditorSnapshot()?.dispatch({
                type: "setActiveGradientEdit",
                target: fillIndex === null ? null : { elementId: node.id, fillIndex },
              })
            }
            onEditPath={onEditPath}
            onFlattenToPath={onFlattenToPath}
            onToggleLocked={(locked) => commitWith((live) => setElementLocked(live, node.id, locked))}
            onToggleVisible={(visible) => {
              const editor = getEditorSnapshot();
              if (!editor) return;
              commitDocument(
                setElementVisible(editor.state.document, node.id, visible),
                visible ? editor.state.selectedIds : [],
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
          {node ? `${node.width}×${node.height} px` : canvas ? `${canvas.width}×${canvas.height} px` : "—"}
        </span>
      </div>
    </aside>
  );
}
