import type { PointerEvent as ReactPointerEvent } from "react";
import { mutateElementShallow, mutateElementWithStyles, shallowCloneDocument } from "@/canvas/engine/actions";
import {
  angleBetweenPoints,
  angleDelta,
  clamp,
  clampBorderRadiusForSize,
  clampRectToBounds,
  clampRotatedRectToBounds,
  getAbsoluteRect,
  getEffectiveRotation,
  getParentBounds,
  getParentSize,
  MIN_ELEMENT_SIZE,
  normalizeAngle,
  resizeBoxFromHandle,
  resizeRotatedRectFromHandle,
  rotatePoint,
  roundAngle,
  roundPixel,
  snapAngle,
} from "@/canvas/engine/geometry";
import { snapRect } from "@/canvas/engine/snapping";
import type { CanvasDocument, Point, Rect, SnapGuide } from "@/canvas/engine/types";
import { screenDeltaToWorldDelta, type ViewportState } from "@/canvas/engine/viewport";
import type {
  CanvasResizeInteraction,
  CanvasRotateInteraction,
  DragInteraction,
  RadiusInteraction,
  ResizeInteraction,
  RotateInteraction,
} from "./canvasInteractionTypes";
import { canvasDeltaToScreenDelta, screenDeltaToCanvasDelta } from "./canvasCoordinates";

export type DragMove = { delta: Point; guides: SnapGuide[] };

export function computeDragMoveFromWorldDelta(
  interaction: DragInteraction,
  worldDelta: Point,
): DragMove {
  let deltaX = worldDelta.x;
  let deltaY = worldDelta.y;
  const parentRotation =
    interaction.commonParentId != null
      ? getEffectiveRotation(interaction.beforeDocument, interaction.commonParentId)
      : 0;
  if (parentRotation !== 0) {
    const local = rotatePoint({ x: deltaX, y: deltaY }, { x: 0, y: 0 }, -parentRotation);
    deltaX = local.x;
    deltaY = local.y;
  }
  let nextBox: Rect = {
    ...interaction.startBox,
    x: interaction.startBox.x + deltaX,
    y: interaction.startBox.y + deltaY,
  };
  const snapped = snapRect(
    nextBox,
    interaction.beforeDocument,
    interaction.transformIds,
    interaction.parentBounds,
    interaction.commonParentId,
  );
  nextBox = clampRectToBounds(snapped.rect, interaction.parentBounds);
  return {
    delta: {
      x: nextBox.x - interaction.startBox.x,
      y: nextBox.y - interaction.startBox.y,
    },
    guides: snapped.guides,
  };
}

export function computeDragMove(
  interaction: DragInteraction,
  currentPoint: Point,
): DragMove {
  return computeDragMoveFromWorldDelta(interaction, {
    x: currentPoint.x - interaction.startPoint.x,
    y: currentPoint.y - interaction.startPoint.y,
  });
}

export function computeDragMoveFromScreenDelta(
  interaction: DragInteraction,
  screenDelta: Point,
): DragMove {
  return computeDragMoveFromWorldDelta(
    interaction,
    screenDeltaToWorldDelta(screenDelta, interaction.startWorldToScreenMatrix),
  );
}

export function computeDragMoveCommandFromWorldDelta(
  interaction: DragInteraction,
  worldDelta: Point,
  canvasBounds: Rect,
): DragMove {
  let nextBox: Rect = {
    ...interaction.startBox,
    x: interaction.startBox.x + worldDelta.x,
    y: interaction.startBox.y + worldDelta.y,
  };
  nextBox = clampRectToBounds(nextBox, canvasBounds);
  return {
    delta: {
      x: nextBox.x - interaction.startBox.x,
      y: nextBox.y - interaction.startBox.y,
    },
    guides: [],
  };
}

export function computeDragMoveCommand(
  interaction: DragInteraction,
  currentPoint: Point,
  canvasBounds: Rect,
): DragMove {
  return computeDragMoveCommandFromWorldDelta(
    interaction,
    {
      x: currentPoint.x - interaction.startPoint.x,
      y: currentPoint.y - interaction.startPoint.y,
    },
    canvasBounds,
  );
}

export function computeDragMoveCommandFromScreenDelta(
  interaction: DragInteraction,
  screenDelta: Point,
  canvasBounds: Rect,
): DragMove {
  return computeDragMoveCommandFromWorldDelta(
    interaction,
    screenDeltaToWorldDelta(screenDelta, interaction.startWorldToScreenMatrix),
    canvasBounds,
  );
}

export function commitDragMove(
  interaction: DragInteraction,
  delta: Point,
): CanvasDocument {
  const next = shallowCloneDocument(interaction.beforeDocument);
  for (const id of interaction.transformIds) {
    const source = interaction.beforeDocument.elements[id];
    const sourceRect = getAbsoluteRect(interaction.beforeDocument, id);
    if (!source || !sourceRect) continue;
    const node = mutateElementShallow(next, id);
    if (!node) continue;
    // Use interaction.parentBounds so draft mode (DRAFT_BOUNDS) is respected
    const parentBounds = source.parentId
      ? getParentBounds(interaction.beforeDocument, id)
      : interaction.parentBounds;
    const clampedRect = clampRotatedRectToBounds(
      { ...sourceRect, x: sourceRect.x + delta.x, y: sourceRect.y + delta.y },
      source.rotation,
      parentBounds,
    );
    node.x = roundPixel(clampedRect.x - parentBounds.x);
    node.y = roundPixel(clampedRect.y - parentBounds.y);
  }
  return next;
}

function resizeSingleElement(
  interaction: ResizeInteraction,
  currentPoint: Point,
  event: ReactPointerEvent,
): { document: CanvasDocument; guides: SnapGuide[] } {
  const id = interaction.transformIds[0];
  const source = interaction.beforeDocument.elements[id];
  const startRect = interaction.startRects[id];
  if (!source || !startRect) return { document: interaction.beforeDocument, guides: [] };
  // Use interaction.parentBounds for root-level elements so DRAFT_BOUNDS is respected
  const parentBounds = source.parentId
    ? getParentBounds(interaction.beforeDocument, id)
    : interaction.parentBounds;
  const parentSize = source.parentId
    ? getParentSize(interaction.beforeDocument, id)
    : { width: parentBounds.width, height: parentBounds.height };
  const handle = interaction.handle;
  let nextRect: Rect;
  if (source.rotation !== 0) {
    nextRect = resizeRotatedRectFromHandle(startRect, handle, currentPoint, source.rotation, {
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    });
    nextRect = clampRotatedRectToBounds(nextRect, source.rotation, parentBounds);
  } else {
    nextRect = resizeBoxFromHandle(startRect, interaction.startPoint, currentPoint, handle, {
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    });
    nextRect = clampRectToBounds(nextRect, parentBounds);
  }
  const width = roundPixel(clamp(nextRect.width, MIN_ELEMENT_SIZE, parentSize.width));
  const height = roundPixel(clamp(nextRect.height, MIN_ELEMENT_SIZE, parentSize.height));
  let absX: number;
  let absY: number;
  if (source.rotation !== 0 || event.altKey) {
    absX = nextRect.x;
    absY = nextRect.y;
  } else {
    const dirX = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
    const dirY = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
    if (dirX > 0) absX = startRect.x;
    else if (dirX < 0) absX = startRect.x + startRect.width - width;
    else absX = startRect.x;
    if (dirY > 0) absY = startRect.y;
    else if (dirY < 0) absY = startRect.y + startRect.height - height;
    else absY = startRect.y;
    absX = clamp(absX, parentBounds.x, parentBounds.x + parentBounds.width - width);
    absY = clamp(absY, parentBounds.y, parentBounds.y + parentBounds.height - height);
  }
  const next = shallowCloneDocument(interaction.beforeDocument);
  const sourceNode = next.elements[id];
  if (sourceNode) {
    const node =
      sourceNode.styles.borderRadius !== undefined
        ? mutateElementWithStyles(next, id)
        : mutateElementShallow(next, id);
    if (node) {
      node.width = width;
      node.height = height;
      if (node.styles.borderRadius !== undefined) {
        node.styles.borderRadius = roundPixel(clampBorderRadiusForSize(node.styles.borderRadius, width, height));
      }
      node.x = roundPixel(absX - parentBounds.x);
      node.y = roundPixel(absY - parentBounds.y);
    }
  }
  return { document: next, guides: [] };
}

export function resizeDocument(
  interaction: ResizeInteraction,
  currentPoint: Point,
  event: ReactPointerEvent,
): { document: CanvasDocument; guides: SnapGuide[] } {
  if (interaction.transformIds.length === 1) return resizeSingleElement(interaction, currentPoint, event);
  let nextBox = resizeBoxFromHandle(interaction.startBox, interaction.startPoint, currentPoint, interaction.handle, {
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  });
  nextBox = clampRectToBounds(nextBox, interaction.parentBounds);
  const scaleX = nextBox.width / Math.max(interaction.startBox.width, 1);
  const scaleY = nextBox.height / Math.max(interaction.startBox.height, 1);
  const next = shallowCloneDocument(interaction.beforeDocument);
  for (const id of interaction.transformIds) {
    const sourceNode = next.elements[id];
    const sourceRect = interaction.startRects[id];
    if (!sourceNode || !sourceRect) continue;
    const node =
      sourceNode.styles.borderRadius !== undefined
        ? mutateElementWithStyles(next, id)
        : mutateElementShallow(next, id);
    if (!node) continue;
    const parentBounds = getParentBounds(interaction.beforeDocument, id);
    const parentSize = getParentSize(next, id);
    const absoluteRect = {
      x: nextBox.x + (sourceRect.x - interaction.startBox.x) * scaleX,
      y: nextBox.y + (sourceRect.y - interaction.startBox.y) * scaleY,
      width: Math.max(sourceRect.width * scaleX, MIN_ELEMENT_SIZE),
      height: Math.max(sourceRect.height * scaleY, MIN_ELEMENT_SIZE),
    };
    node.width = roundPixel(Math.min(absoluteRect.width, parentSize.width));
    node.height = roundPixel(Math.min(absoluteRect.height, parentSize.height));
    if (node.styles.borderRadius !== undefined) {
      node.styles.borderRadius = roundPixel(clampBorderRadiusForSize(node.styles.borderRadius, node.width, node.height));
    }
    const clampedRect = clampRotatedRectToBounds(
      { x: absoluteRect.x, y: absoluteRect.y, width: node.width, height: node.height },
      node.rotation,
      parentBounds,
    );
    node.x = roundPixel(clampedRect.x - parentBounds.x);
    node.y = roundPixel(clampedRect.y - parentBounds.y);
  }
  return { document: next, guides: [] };
}

export function rotateDocument(
  interaction: RotateInteraction,
  currentPoint: Point,
  event: ReactPointerEvent,
): { document: CanvasDocument; guides: SnapGuide[] } {
  const currentAngle = angleBetweenPoints(interaction.center, currentPoint);
  const delta = angleDelta(interaction.startAngle, currentAngle);
  const next = shallowCloneDocument(interaction.beforeDocument);
  for (const id of interaction.transformIds) {
    const node = mutateElementShallow(next, id);
    if (!node) continue;
    const rawRotation = (interaction.startRotations[id] ?? 0) + delta;
    node.rotation = roundAngle(normalizeAngle(snapAngle(rawRotation, event.shiftKey)));
    const absoluteRect = getAbsoluteRect(next, id);
    if (absoluteRect) {
      const parentBounds = getParentBounds(next, id);
      const clampedRect = clampRotatedRectToBounds(absoluteRect, node.rotation, parentBounds);
      node.x = roundPixel(clampedRect.x - parentBounds.x);
      node.y = roundPixel(clampedRect.y - parentBounds.y);
    }
  }
  return { document: next, guides: [] };
}

export function radiusDocument(
  interaction: RadiusInteraction,
  currentPoint: Point,
): { document: CanvasDocument; guides: SnapGuide[] } {
  const element = interaction.beforeDocument.elements[interaction.elementId];
  if (!element) return { document: interaction.beforeDocument, guides: [] };
  const rect = getAbsoluteRect(interaction.beforeDocument, interaction.elementId);
  if (!rect) return { document: interaction.beforeDocument, guides: [] };
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const local = element.rotation
    ? rotatePoint(currentPoint, { x: cx, y: cy }, -element.rotation)
    : { x: currentPoint.x, y: currentPoint.y };
  let dx: number;
  let dy: number;
  switch (interaction.corner) {
    case "nw": dx = local.x - rect.x; dy = local.y - rect.y; break;
    case "ne": dx = rect.x + rect.width - local.x; dy = local.y - rect.y; break;
    case "se": dx = rect.x + rect.width - local.x; dy = rect.y + rect.height - local.y; break;
    case "sw": dx = local.x - rect.x; dy = rect.y + rect.height - local.y; break;
  }
  const newRadius = roundPixel(clampBorderRadiusForSize(Math.min(dx!, dy!), rect.width, rect.height));
  const next = shallowCloneDocument(interaction.beforeDocument);
  const node = mutateElementWithStyles(next, interaction.elementId);
  if (node) node.styles.borderRadius = newRadius;
  return { document: next, guides: [] };
}

export function resizeCanvasDocument(
  interaction: CanvasResizeInteraction,
  event: ReactPointerEvent,
): { document: CanvasDocument; viewport: ViewportState } {
  const handle = interaction.handle;
  const rotation = interaction.beforeDocument.canvas.rotation ?? 0;
  const delta = screenDeltaToCanvasDelta(
    event.clientX - interaction.startScreenPoint.x,
    event.clientY - interaction.startScreenPoint.y,
    rotation,
    interaction.displayZoom,
  );
  let newWidth = interaction.startWidth;
  let newHeight = interaction.startHeight;
  if (handle.includes("e")) newWidth = interaction.startWidth + delta.x;
  if (handle.includes("w")) newWidth = interaction.startWidth - delta.x;
  if (handle.includes("s")) newHeight = interaction.startHeight + delta.y;
  if (handle.includes("n")) newHeight = interaction.startHeight - delta.y;
  if (event.shiftKey && handle.length === 2) {
    const aspect = interaction.startWidth / Math.max(interaction.startHeight, 1);
    if (Math.abs(delta.x) > Math.abs(delta.y)) newHeight = newWidth / aspect;
    else newWidth = newHeight * aspect;
  }
  const next = shallowCloneDocument(interaction.beforeDocument);
  const width = Math.round(Math.max(50, newWidth));
  const height = Math.round(Math.max(50, newHeight));
  next.canvas.width = width;
  next.canvas.height = height;
  const originShift = canvasDeltaToScreenDelta(
    handle.includes("w") ? interaction.startWidth - width : 0,
    handle.includes("n") ? interaction.startHeight - height : 0,
    rotation,
    interaction.displayZoom,
  );
  return {
    document: next,
    viewport: {
      zoom: interaction.zoom,
      offsetX: interaction.startOffsetX + originShift.x,
      offsetY: interaction.startOffsetY + originShift.y,
    },
  };
}

export function rotateCanvasDocument(
  interaction: CanvasRotateInteraction,
  currentPoint: Point,
  event: ReactPointerEvent,
): CanvasDocument {
  const currentAngle = angleBetweenPoints(interaction.center, currentPoint);
  const delta = angleDelta(interaction.startAngle, currentAngle);
  const rawRotation = interaction.startRotation + delta;
  const newRotation = roundAngle(normalizeAngle(snapAngle(rawRotation, event.shiftKey)));
  const next = shallowCloneDocument(interaction.beforeDocument);
  next.canvas.rotation = newRotation;
  return next;
}
