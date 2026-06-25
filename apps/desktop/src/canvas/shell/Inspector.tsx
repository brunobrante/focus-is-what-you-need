import { useEffect, useRef, useState } from "react";
import { windowKeyLabel } from "@/canvas/canvasUtils";
import { useEditorBridge, useEditorBridgeReader, type EditorBridgeValue } from "@/canvas/engine/bridge";
import {
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
import { CanvasTab } from "./inspector/CanvasTab";
import { ShellTab, type ShellControlVisibility } from "./inspector/ShellTab";
import { EmptyState } from "./inspector/InsComponents";
import { TypeIcon } from "./tree/TypeIcon";
import { IconClose, IconEllipse } from "@/components/icons";

type InspectorProps = {
  open: boolean;
  onClose: () => void;
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
};

const EMPTY_ANCESTOR_OVERLAY: AncestorOverlayState = { enabled: false, items: {} };

type InspectorTab = "element" | "canvas" | "shell";

export function Inspector({
  open,
  onClose,
  editor: editorProp,
  isComponent = false,
  inheritParentBackground = false,
  hasParent = false,
  onInheritParentBackgroundChange,
  ancestorFrames = [],
  onGoToInstance,
  shellDeviceVisibility,
  shellBackVisibility,
  shellZoomVisibility,
  shellExpandVisibility,
  onShellDeviceVisibilityChange,
  onShellBackVisibilityChange,
  onShellZoomVisibilityChange,
  onShellExpandVisibilityChange,
  openShellTabSignal,
}: InspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("element");
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
  const bridgeSourceId = useEditorBridge((v) => v?.sourceId ?? null);
  const bridgeAncestorOverlay = useEditorBridge((v) => v?.state.ancestorOverlay ?? null);
  const getEditorSnapshot = useEditorBridgeReader();

  const document = editorProp !== undefined ? (editorProp?.state.document ?? null) : bridgeDocument;
  const ancestorOverlay =
    (editorProp !== undefined ? editorProp?.state.ancestorOverlay : bridgeAncestorOverlay) ?? EMPTY_ANCESTOR_OVERLAY;
  const selectedId = editorProp !== undefined ? (editorProp?.state.selectedIds[0] ?? null) : bridgeSelectedId;
  const selectedCount = editorProp !== undefined ? (editorProp?.state.selectedIds.length ?? 0) : bridgeSelectedCount;
  const canvasStageActive = editorProp !== undefined ? (editorProp?.state.canvasStageActive ?? false) : bridgeCanvasStageActive;
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
    (editorProp ?? getEditorSnapshot())?.dispatch({
      type: "commitDocument",
      document: nextDocument,
      ...(selectedIds !== undefined ? { selectedIds } : {}),
    });
  };

  const dispatchAncestor = (action: { type: string } & Record<string, unknown>) => {
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

  const headerTitle = canvasStageActive ? "Frame" : node ? node.name : "Inspector";
  const headerMeta = canvasStageActive
    ? `${document?.canvas.width ?? 0}×${document?.canvas.height ?? 0}px`
    : node
      ? elementTypeLabel(node.type)
      : sourceLabel;

  return (
    <aside
      aria-label="Inspetor"
      className="pointer-events-auto flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] text-[#F2F2F2]"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2C2C2C] pl-3.5 pr-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid shrink-0 place-items-center text-[#9A9A9A]" style={{ width: 16, height: 16 }}>
            {canvasStageActive || node ? (
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
          className="grid h-6 w-6 cursor-pointer place-items-center rounded-md border border-[#2C2C2C] bg-transparent text-[#9A9A9A] hover:bg-[#2A2A2A] hover:text-[var(--text)]"
        >
          <IconClose size={11} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex shrink-0 border-b border-[#2C2C2C] px-2">
        {([
          { id: "element", label: "Element" },
          { id: "canvas", label: "Frame" },
          { id: "shell", label: "Shell" },
        ] as const).map((tab) => {
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
              className="relative cursor-pointer border-0 bg-transparent px-2.5 py-2.5 text-[12px] font-medium"
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
        {!document ? (
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
            <EmptyState title={`${selectedCount} elementos selecionados`} body="Use the canvas to move the group or select a layer to edit properties." />
            <div className="flex flex-col gap-1.5 border-t border-[#2C2C2C] px-3.5 py-3">
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
                    className="cursor-pointer rounded-md border border-[#2C2C2C] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[#F2F2F2] hover:bg-[#2A2A2A]"
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
            onUpdateImageSource={(src) => commitDocument(updateElementImageSource(document, node.id, src))}
            onUpdateGeometry={(patch) => commitDocument(updateElementGeometry(document, node.id, patch))}
            onUpdateRotation={(rotation) => commitDocument(updateElementRotation(document, node.id, rotation))}
            onUpdateStyle={commitStyle}
            onUpdateSizing={commitSizing}
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
        className="flex shrink-0 items-center justify-between border-t border-[#2C2C2C] px-3 py-2.5 text-[11px] text-[#6B6B6B]"
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
