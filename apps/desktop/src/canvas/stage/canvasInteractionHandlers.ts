import type React from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { getToolElementDefinition } from "@/canvas/engine/elementDefinitions";
import { createElementForTool, reparentElements, shallowCloneDocument } from "@/canvas/engine/actions";
import { mutateElementShallow } from "@/canvas/engine/mutations/coreUtils";
import { applyTextFitSizingInPlace } from "@/canvas/engine/mutations/elementGeometry";
import { clamp, getDescendantIds, roundPixel } from "@/canvas/engine/geometry";
import type { CanvasDocument, EditorState, ElementFontTokens, Point, Rect } from "@/canvas/engine/types";
import type { EditorAction } from "@/canvas/engine/store";
import { clampViewportState } from "@/canvas/engine/viewport";
import type { Size } from "@/canvas/engine/viewport";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { isModifierCommandActive } from "@/domain/settings/resolve";
import type { GlobalSettings } from "@/domain/settings/types";
import {
  commitDragMove,
  computeDragMoveCommandFromScreenDelta,
  computeDragMoveFromScreenDelta,
  radiusDocument,
  resizeCanvasDocument,
  resizeDocument,
  rotateCanvasDocument,
  rotateDocument,
} from "./canvasDocumentMutations";
import { findDropTarget } from "./canvasHitTesting";
import { getCanvasSize } from "./canvasCoordinates";
import { findElementsInMarquee } from "./canvasToolingUtils";
import type { CanvasAlignmentLogInput } from "./canvasAlignmentLog";
import type {
  CanvasResizeInteraction,
  CanvasRotateInteraction,
  DragInteraction,
  DrawInteraction,
  MarqueeInteraction,
  PanInteraction,
  RadiusInteraction,
  ResizeInteraction,
  RotateInteraction,
} from "./canvasInteractionTypes";
import type { CanvasDropTarget } from "./canvasStageTypes";
import type { NoticeStore } from "@/canvas/engine/noticeStore";

type Dispatch = React.Dispatch<EditorAction>;

function isSameParentDropTarget(
  interaction: DragInteraction,
  targetId: string | null,
): boolean {
  return targetId !== null && interaction.transformIds.every(
    (id) => interaction.beforeDocument.elements[id]?.parentId === targetId,
  );
}

function getSharedCurrentParentId(interaction: DragInteraction): string | null {
  let sharedParentId: string | null | undefined;
  for (const id of interaction.transformIds) {
    const parentId = interaction.beforeDocument.elements[id]?.parentId ?? null;
    if (!parentId) return null;
    if (sharedParentId === undefined) {
      sharedParentId = parentId;
      continue;
    }
    if (sharedParentId !== parentId) return null;
  }
  return sharedParentId ?? null;
}

function getReparentChangedIds(
  interaction: DragInteraction,
  newParentId: string | null,
): string[] {
  const ids = new Set(interaction.transformIds);
  for (const id of interaction.transformIds) {
    const oldParentId = interaction.beforeDocument.elements[id]?.parentId ?? null;
    if (oldParentId) ids.add(oldParentId);
  }
  if (newParentId) ids.add(newParentId);
  return Array.from(ids);
}

function elementCreationOptions(
  elementSizeScale?: number,
  fontTokens?: ElementFontTokens,
): { sizeScale?: number; allowedFontSizes?: number[]; defaultFontFamily?: string } | undefined {
  const options: { sizeScale?: number; allowedFontSizes?: number[]; defaultFontFamily?: string } = {};
  if (elementSizeScale !== undefined) options.sizeScale = elementSizeScale;
  if (fontTokens?.allowedFontSizes?.length) options.allowedFontSizes = fontTokens.allowedFontSizes;
  if (fontTokens?.defaultFontFamily) options.defaultFontFamily = fontTokens.defaultFontFamily;
  return Object.keys(options).length > 0 ? options : undefined;
}

// === MOVE HANDLERS ===

export function handlePanMove(
  interaction: PanInteraction,
  event: ReactPointerEvent,
  document: CanvasDocument,
  getCurrentViewportSize: () => Size,
  dispatch: Dispatch,
  navigableBounds?: Rect | null,
): void {
  const raw = {
    zoom: interaction.zoom,
    offsetX: interaction.startOffsetX + event.clientX - interaction.startScreenPoint.x,
    offsetY: interaction.startOffsetY + event.clientY - interaction.startScreenPoint.y,
  };
  const next = clampViewportState(raw, getCurrentViewportSize(), getCanvasSize(document), false, interaction.viewportMode, navigableBounds);
  interaction.moved =
    interaction.moved ||
    Math.hypot(event.clientX - interaction.startScreenPoint.x, event.clientY - interaction.startScreenPoint.y) > 0.5;
  dispatch({ type: "setViewport", zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
}

export function handleDrawMove(
  interaction: DrawInteraction,
  event: ReactPointerEvent,
  point: Point,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): void {
  const distance = Math.hypot(point.x - interaction.startPoint.x, point.y - interaction.startPoint.y);
  interaction.moved = interaction.moved || distance > 2;

  const node = createElementForTool(
    interaction.tool,
    0,
    0,
    interaction.beforeDocument.canvas,
    settings,
    elementCreationOptions(interaction.elementSizeScale, interaction.fontTokens),
  );
  const def = getToolElementDefinition(interaction.tool);
  const drawMode = def?.capabilities.drawMode ?? "free";
  const constrainAspect = isModifierCommandActive(event, settings, "canvas.transform.constrainAspect");

  const isHorizontal = drawMode === "horizontal";
  const isProportional = drawMode === "proportional";
  const next = shallowCloneDocument(interaction.beforeDocument);
  node.id = interaction.elementId;

  const c = def?.capabilities.constraints;
  const minW = c?.width.min ?? 1;
  const minH = c?.height.min ?? 1;
  const maxH = c?.height.max;

  if (isHorizontal) {
    const dx = point.x - interaction.startPoint.x;
    const dy = point.y - interaction.startPoint.y;
    const len = Math.hypot(dx, dy);
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
    const h = node.height; // already at default, which respects constraints
    const cx = (interaction.startPoint.x + point.x) / 2;
    const cy = (interaction.startPoint.y + point.y) / 2;
    node.x = roundPixel(cx - len / 2);
    node.y = roundPixel(cy - h / 2);
    node.width = roundPixel(Math.max(len, minW));
    node.height = h;
    node.rotation = angleDeg;
  } else {
    const rawW = Math.abs(point.x - interaction.startPoint.x);
    const rawH = constrainAspect || isProportional
      ? rawW
      : Math.abs(point.y - interaction.startPoint.y);
    node.x = roundPixel(Math.min(interaction.startPoint.x, point.x));
    node.y = roundPixel(Math.min(interaction.startPoint.y, point.y));
    node.width = roundPixel(Math.max(rawW, minW));
    node.height = roundPixel(clamp(Math.max(rawH, minH), minH, maxH ?? rawH));
  }
  next.elements[interaction.elementId] = node;
  if (!next.rootIds.includes(interaction.elementId)) next.rootIds.push(interaction.elementId);
  interaction.lastDocument = next;
  latestDocumentRef.current = next;
  dispatch({ type: "setDocumentTransient", document: next, changedIds: [interaction.elementId] });
}

export function handleMarqueeMove(
  interaction: MarqueeInteraction,
  point: Point,
  document: CanvasDocument,
  setMarqueeRect: (rect: Rect | null) => void,
  dispatch: Dispatch,
): void {
  const distance = Math.hypot(point.x - interaction.startPoint.x, point.y - interaction.startPoint.y);
  interaction.moved = interaction.moved || distance > 2;
  interaction.currentPoint = point;
  if (!interaction.moved) return;
  const rect: Rect = {
    x: Math.min(interaction.startPoint.x, point.x),
    y: Math.min(interaction.startPoint.y, point.y),
    width: Math.abs(point.x - interaction.startPoint.x),
    height: Math.abs(point.y - interaction.startPoint.y),
  };
  setMarqueeRect(rect);
  dispatch({ type: "setSelected", selectedIds: findElementsInMarquee(document, rect) });
}

export function handleDragMove(
  interaction: DragInteraction,
  event: ReactPointerEvent,
  point: Point,
  document: CanvasDocument,
  commandModeRef: React.MutableRefObject<boolean>,
  updateDropTarget: (target: CanvasDropTarget | null) => void,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): void {
  const screenDelta = {
    x: event.clientX - interaction.startScreenPoint.x,
    y: event.clientY - interaction.startScreenPoint.y,
  };
  interaction.moved = interaction.moved || Math.hypot(screenDelta.x, screenDelta.y) > 0.5;

  let move;
  let nextDocument: CanvasDocument;
  let changedIds = interaction.transformIds;
  if (isModifierCommandActive(event, settings, "canvas.drag.reparent")) {
    commandModeRef.current = true;
    const canvasBounds: Rect = { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
    move = computeDragMoveCommandFromScreenDelta(interaction, screenDelta, canvasBounds);
    const committed = commitDragMove(interaction, move.delta, { clampBounds: canvasBounds });
    const excludeIds =
      interaction.reparentExcludeIds ??
      (interaction.reparentExcludeIds = (() => {
        const ids = new Set<string>(interaction.transformIds);
        for (const id of interaction.transformIds) {
          for (const desc of getDescendantIds(interaction.beforeDocument, id)) ids.add(desc);
        }
        return ids;
      })());
    const targetId = findDropTarget(committed, point, excludeIds);
    const detachParentId = targetId === null ? getSharedCurrentParentId(interaction) : null;
    updateDropTarget(
      targetId
        ? { targetId, intent: "insert" }
        : detachParentId
          ? { targetId: detachParentId, intent: "detach" }
          : null,
    );
    // While the reparent modifier is held, the dragged element floats free of any
    // parent: it is detached to the canvas root so it tracks the cursor without
    // being clipped by — or leaving a stale "trail" copy inside — the components it
    // sweeps over. Re-nesting into the hovered component every frame instead would
    // leave the prior frame's parent painting a ghost (its memoized subtree is not
    // in `changedIds`), which is exactly the trail this avoids. Only the drop-target
    // highlight signals where it will land; the actual reparent into that target
    // happens once on release in `finishMovedInteraction`.
    nextDocument = reparentElements(committed, interaction.transformIds, null);
    changedIds = getReparentChangedIds(interaction, null);
  } else {
    if (commandModeRef.current) { commandModeRef.current = false; updateDropTarget(null); }
    move = computeDragMoveFromScreenDelta(interaction, screenDelta);
    nextDocument = commitDragMove(interaction, move.delta);
  }

  interaction.currentDelta = move.delta;
  interaction.lastGuides = move.guides;
  interaction.lastDocument = nextDocument;
  latestDocumentRef.current = nextDocument;
  dispatch({
    type: "setDocumentTransient",
    document: nextDocument,
    guides: move.guides,
    changedIds,
  });
}

export function handleCanvasResizeMove(
  interaction: CanvasResizeInteraction,
  event: ReactPointerEvent,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): void {
  const result = resizeCanvasDocument(interaction, event, settings);
  interaction.lastDocument = result.document;
  latestDocumentRef.current = result.document;
  // Canvas resize only mutates canvas dimensions, not any element — empty
  // changedIds keeps the scene render set empty so no element re-renders.
  dispatch({ type: "setDocumentTransient", document: result.document, changedIds: [] });
  dispatch({ type: "setViewport", zoom: result.viewport.zoom, offsetX: result.viewport.offsetX, offsetY: result.viewport.offsetY });
}

export function handleCanvasRotateMove(
  interaction: CanvasRotateInteraction,
  point: Point,
  event: ReactPointerEvent,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): void {
  const next = rotateCanvasDocument(interaction, point, event, settings);
  interaction.lastDocument = next;
  latestDocumentRef.current = next;
  // Canvas rotation only mutates canvas.rotation (applied at the stage transform),
  // not any element — empty changedIds avoids re-rendering the whole scene.
  dispatch({ type: "setDocumentTransient", document: next, changedIds: [] });
}

// The Scale tool mutates every descendant of the resized element(s), so the
// transient render set must include them — unlike a normal resize, where nested
// children move with their parent via layout and don't re-render.
function resizeScaleChangedIds(interaction: ResizeInteraction): string[] {
  const ids = new Set<string>(interaction.transformIds);
  for (const id of interaction.transformIds) {
    for (const descId of getDescendantIds(interaction.beforeDocument, id)) ids.add(descId);
  }
  return Array.from(ids);
}

export function handleTransformMove(
  interaction: ResizeInteraction | RotateInteraction | RadiusInteraction,
  point: Point,
  event: ReactPointerEvent,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): void {
  const result =
    interaction.type === "resize"
      ? resizeDocument(interaction, point, event, settings)
      : interaction.type === "radius"
        ? radiusDocument(
            interaction,
            point,
            isModifierCommandActive(event, settings, "canvas.radius.perCorner"),
          )
        : rotateDocument(interaction, point, event, settings);
  interaction.lastDocument = result.document;
  if ("lastGuides" in interaction) interaction.lastGuides = result.guides;
  latestDocumentRef.current = result.document;
  const changedIds =
    interaction.type === "radius"
      ? [interaction.elementId]
      : interaction.type === "resize" && interaction.scaleMode
        ? resizeScaleChangedIds(interaction)
        : interaction.transformIds;
  dispatch({
    type: "setDocumentTransient",
    document: result.document,
    guides: result.guides,
    changedIds,
  });
}

// === FINISH HELPERS ===

export function finishDrawInteraction(
  interaction: DrawInteraction,
  dispatch: Dispatch,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
  noticeStore?: NoticeStore,
): void {
  if (interaction.moved) {
    let finalDocument = interaction.lastDocument;
    // A drag-drawn text box keeps the width the user drew but hugs its content
    // vertically (Figma: fixed width + auto height). Click-created text stays on
    // the creation default (auto-width, see createElementForTool) (G4).
    if (finalDocument.elements[interaction.elementId]?.type === "text") {
      const next = shallowCloneDocument(finalDocument);
      const node = mutateElementShallow(next, interaction.elementId);
      if (node) {
        node.sizing = { width: "fixed", height: "fit" };
        applyTextFitSizingInPlace(next, interaction.elementId);
        finalDocument = next;
      }
    }
    dispatch({
      type: "commitDocument",
      beforeDocument: interaction.beforeDocument,
      document: finalDocument,
      selectedIds: [interaction.elementId],
    });
  } else {
    const next = shallowCloneDocument(interaction.beforeDocument);
    const node = createElementForTool(
      interaction.tool,
      interaction.startPoint.x,
      interaction.startPoint.y,
      interaction.beforeDocument.canvas,
      settings,
      elementCreationOptions(interaction.elementSizeScale, interaction.fontTokens),
    );
    node.id = interaction.elementId;
    next.elements[node.id] = node;
    if (!next.rootIds.includes(node.id)) next.rootIds.push(node.id);
    if (node.type === "text") {
      // Size the new auto-width box to its placeholder content right away and
      // keep it centered on the click point (the default centering used the
      // pre-fit size), clamped inside the frame.
      applyTextFitSizingInPlace(next, node.id);
      const canvas = next.canvas;
      node.x = roundPixel(clamp(interaction.startPoint.x - node.width / 2, 0, Math.max(0, canvas.width - node.width)));
      node.y = roundPixel(clamp(interaction.startPoint.y - node.height / 2, 0, Math.max(0, canvas.height - node.height)));
    }
    dispatch({
      type: "commitDocument",
      beforeDocument: interaction.beforeDocument,
      document: next,
      selectedIds: [node.id],
    });
  }
  dispatch({ type: "setTool", tool: "select" });
  // The wrapper tool draws an element with no fill or border — invisible on the
  // canvas — so confirm the addition with a transient toolbar notice.
  if (interaction.tool === "wrapper") noticeStore?.show("Wrapper added");
}

export function finishMovedInteraction(
  interaction: DragInteraction | ResizeInteraction | RotateInteraction | RadiusInteraction,
  wasCommandMode: boolean,
  capturedDropTarget: CanvasDropTarget | null,
  dispatch: Dispatch,
  scheduleCanvasAlignmentLog: (input: CanvasAlignmentLogInput) => void,
  state: EditorState,
): void {
  let finalDoc: CanvasDocument;
  if (interaction.type === "drag") {
    const targetId =
      capturedDropTarget?.intent === "insert" ? capturedDropTarget.targetId : null;
    const canvasBounds: Rect = {
      x: 0,
      y: 0,
      width: interaction.beforeDocument.canvas.width,
      height: interaction.beforeDocument.canvas.height,
    };
    const useCanvasBounds = wasCommandMode && !isSameParentDropTarget(interaction, targetId);
    const committed = useCanvasBounds
      ? commitDragMove(interaction, interaction.currentDelta, { clampBounds: canvasBounds })
      : commitDragMove(interaction, interaction.currentDelta);
    finalDoc = wasCommandMode
      ? reparentElements(committed, interaction.transformIds, targetId)
      : committed;
  } else {
    finalDoc = interaction.lastDocument;
  }
  dispatch({
    type: "commitDocument",
    beforeDocument: interaction.beforeDocument,
    document: finalDoc,
    selectedIds: interaction.selectedIds,
  });
  scheduleCanvasAlignmentLog({
    reason: "interaction-finish",
    interactionType: interaction.type,
    document: finalDoc,
    selectedIds: interaction.selectedIds,
    zoom: state.zoom,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
  });
}
