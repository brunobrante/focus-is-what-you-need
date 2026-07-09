import type { PointerEvent as ReactPointerEvent } from "react";
import { mutateElementShallow, mutateElementWithStyles, scaledPath, shallowCloneDocument } from "@/canvas/engine/actions";
import {
  angleBetweenPoints,
  angleDelta,
  canvasPointToParentContentSpace,
  clamp,
  clampBorderRadiusForSize,
  clampRectToBounds,
  clampRotatedRectToBounds,
  getAbsoluteCenter,
  getAbsoluteRect,
  getDescendantIds,
  getEffectiveRotation,
  getParentBounds,
  getParentSize,
  maxBorderRadiusForSize,
  MIN_ELEMENT_SIZE,
  normalizeAngle,
  rectCenterX,
  rectCenterY,
  resizeBoxFromHandle,
  resizeRotatedRectFromHandle,
  rotatePoint,
  roundAngle,
  roundPixel,
  snapAngle,
} from "@/canvas/engine/geometry";
import { buildSnapCandidates, SNAP_DISTANCE, snapRectWithCandidates } from "@/canvas/engine/snapping";
import { getElementDefinition } from "@/canvas/engine/elementDefinitions";
import { applyChildConstraintsInPlace } from "@/canvas/engine/mutations/elementConstraints";
import { applyTextFitSizingInPlace } from "@/canvas/engine/mutations/elementGeometry";
import type { CanvasDocument, ElementNode, Point, RadiusCorner, Rect, SnapGuide } from "@/canvas/engine/types";
import { screenDeltaToWorldDelta, type ViewportState } from "@/canvas/engine/viewport";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { isModifierCommandActive } from "@/domain/settings/resolve";
import type { GlobalSettings } from "@/domain/settings/types";
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
  // Snap targets are static for the whole drag; build them once and reuse.
  const candidates =
    interaction.snapCandidates ??
    (interaction.snapCandidates = buildSnapCandidates(
      interaction.beforeDocument,
      interaction.transformIds,
      interaction.parentBounds,
      interaction.commonParentId,
    ));
  // Convert the screen-px snap radius to world space so magnetism feels constant
  // at any zoom (M3). The world→screen matrix scale (a == d, no viewport rotation)
  // is the display zoom.
  const displayZoom = interaction.startWorldToScreenMatrix.a || 1;
  const snapped = snapRectWithCandidates(
    nextBox,
    candidates,
    interaction.parentBounds,
    SNAP_DISTANCE / displayZoom,
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
  options: { clampBounds?: Rect } = {},
): CanvasDocument {
  const next = shallowCloneDocument(interaction.beforeDocument);
  for (const id of interaction.transformIds) {
    const source = interaction.beforeDocument.elements[id];
    const sourceRect = getAbsoluteRect(interaction.beforeDocument, id);
    if (!source || !sourceRect) continue;
    const node = mutateElementShallow(next, id);
    if (!node) continue;
    // Use interaction.parentBounds so the active surface policy is respected.
    // Per-id parent bounds depend only on beforeDocument (constant for the drag),
    // so cache them to avoid an ancestor walk per element per frame.
    let parentBounds: Rect;
    if (source.parentId) {
      const cache = (interaction.parentBoundsById ??= {});
      parentBounds = cache[id] ?? (cache[id] = getParentBounds(interaction.beforeDocument, id));
    } else {
      parentBounds = interaction.parentBounds;
    }
    const clampBounds = options.clampBounds ?? parentBounds;
    const clampedRect = clampRotatedRectToBounds(
      { ...sourceRect, x: sourceRect.x + delta.x, y: sourceRect.y + delta.y },
      source.rotation,
      clampBounds,
    );
    node.x = roundPixel(clampedRect.x - parentBounds.x);
    node.y = roundPixel(clampedRect.y - parentBounds.y);
  }
  return next;
}

// Bake a box resize into a path's anchors so no scale is left on the element
// (Penpot's model). `node` already has its NEW width/height; `source` holds the
// pre-resize dimensions. The path lives in a 1-unit = 1-px space, so multiplying
// every coordinate by the box ratio keeps the stroke a uniform width instead of
// stretching it (the "fat line" bug, B1). `node.path` is a shallow ref to the
// source path, so we replace it with a fresh scaled graph rather than mutating.
function bakePathResize(node: ElementNode, source: ElementNode): void {
  if (node.type !== "path" || !node.path) return;
  const sx = source.width ? node.width / source.width : 1;
  const sy = source.height ? node.height / source.height : 1;
  if (sx === 1 && sy === 1) return;
  node.path = scaledPath(node.path, sx, sy);
  node.viewBox = { width: node.width, height: node.height };
}

function resizeSingleElement(
  interaction: ResizeInteraction,
  currentPoint: Point,
  event: ReactPointerEvent,
  settings: GlobalSettings,
): { document: CanvasDocument; guides: SnapGuide[] } {
  const id = interaction.transformIds[0];
  const source = interaction.beforeDocument.elements[id];
  const startRect = interaction.startRects[id];
  if (!source || !startRect) return { document: interaction.beforeDocument, guides: [] };
  // Use interaction.parentBounds for root-level elements so the active surface policy is respected.
  const parentBounds = source.parentId
    ? getParentBounds(interaction.beforeDocument, id)
    : interaction.parentBounds;
  const parentSize = source.parentId
    ? getParentSize(interaction.beforeDocument, id)
    : { width: parentBounds.width, height: parentBounds.height };
  const handle = interaction.handle;
  const def = getElementDefinition(source.type).capabilities;
  const lockAspect = def.lockAspectRatio;
  const fromCenter = isModifierCommandActive(event, settings, "canvas.resize.fromCenter");
  const constrainAspect =
    isModifierCommandActive(event, settings, "canvas.transform.constrainAspect") || lockAspect;
  const minW = def.constraints.width.min;
  const maxW = Math.min(parentSize.width, def.constraints.width.max ?? parentSize.width);
  const minH = def.constraints.height.min;
  const maxH = Math.min(parentSize.height, def.constraints.height.max ?? parentSize.height);

  // Line/arrow endpoint editing (G12): dragging an end handle moves that
  // ENDPOINT freely — the opposite endpoint stays pinned and the element's
  // length AND angle follow the cursor (Figma's two-point line), instead of a
  // rotation-preserving axis resize. Height (line thickness) is untouched.
  if ((source.type === "line" || source.type === "arrow") && (handle === "e" || handle === "w")) {
    const effectiveRotation = getEffectiveRotation(interaction.beforeDocument, id);
    const absCenter = getAbsoluteCenter(interaction.beforeDocument, id);
    if (absCenter) {
      const theta = (effectiveRotation * Math.PI) / 180;
      const dir = { x: Math.cos(theta), y: Math.sin(theta) };
      const half = startRect.width / 2;
      const anchor =
        handle === "e"
          ? { x: absCenter.x - dir.x * half, y: absCenter.y - dir.y * half }
          : { x: absCenter.x + dir.x * half, y: absCenter.y + dir.y * half };
      const dx = currentPoint.x - anchor.x;
      const dy = currentPoint.y - anchor.y;
      const rawLength = Math.hypot(dx, dy);
      const length = roundPixel(clamp(rawLength, minW, maxW));
      // Shift-constrain snaps the angle to 15° steps (same modifier as
      // constrain-aspect elsewhere). A zero-length drag keeps the old angle.
      let angleDeg =
        rawLength < 0.0001
          ? effectiveRotation + (handle === "w" ? 180 : 0)
          : (Math.atan2(dy, dx) * 180) / Math.PI;
      if (constrainAspect) angleDeg = Math.round(angleDeg / 15) * 15;
      const angleRad = (angleDeg * Math.PI) / 180;
      const unit = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
      const movingEnd = { x: anchor.x + unit.x * length, y: anchor.y + unit.y * length };
      const newCanvasCenter = { x: (anchor.x + movingEnd.x) / 2, y: (anchor.y + movingEnd.y) / 2 };
      // The dragged handle is the EAST end when handle === "e", so the element's
      // axis points anchor→cursor; for "w" the axis points cursor→anchor.
      const elementAngle = handle === "e" ? angleDeg : angleDeg + 180;
      const localCenter = canvasPointToParentContentSpace(interaction.beforeDocument, id, newCanvasCenter);
      const next = shallowCloneDocument(interaction.beforeDocument);
      const node = mutateElementShallow(next, id);
      if (node && localCenter) {
        node.width = length;
        node.x = roundPixel(localCenter.x - length / 2);
        node.y = roundPixel(localCenter.y - node.height / 2);
        node.rotation = roundAngle(normalizeAngle(elementAngle - (effectiveRotation - source.rotation)));
      }
      return { document: next, guides: [] };
    }
  }

  // Nested under a rotated ancestor: the handles are drawn with the full effective
  // rotation, so the resize must run in that same rotated visual frame (M1). The
  // common no-ancestor-rotation path below is left untouched. This branch skips the
  // parent-bounds clamp (rotation-blind bounds don't align with a rotated frame);
  // the size still respects the element's own min/max.
  const ancestorRotation = getEffectiveRotation(interaction.beforeDocument, id) - source.rotation;
  if (ancestorRotation !== 0) {
    const effectiveRotation = getEffectiveRotation(interaction.beforeDocument, id);
    const absCenter = getAbsoluteCenter(interaction.beforeDocument, id);
    if (absCenter) {
      const visualRect: Rect = {
        x: absCenter.x - startRect.width / 2,
        y: absCenter.y - startRect.height / 2,
        width: startRect.width,
        height: startRect.height,
      };
      const resized = resizeRotatedRectFromHandle(visualRect, handle, currentPoint, effectiveRotation, {
        altKey: fromCenter,
        shiftKey: constrainAspect,
      });
      const width = roundPixel(clamp(resized.width, minW, maxW));
      const height = roundPixel(clamp(resized.height, minH, maxH));
      const newCanvasCenter = {
        x: resized.x + resized.width / 2,
        y: resized.y + resized.height / 2,
      };
      const localCenter = canvasPointToParentContentSpace(interaction.beforeDocument, id, newCanvasCenter);
      const next = shallowCloneDocument(interaction.beforeDocument);
      const node =
        source.styles.borderRadius !== undefined
          ? mutateElementWithStyles(next, id)
          : mutateElementShallow(next, id);
      if (node && localCenter) {
        const widthFit = source.type === "text" && source.sizing?.width === "fit";
        const heightFit = source.type === "text" && source.sizing?.height === "fit";
        node.width = widthFit ? source.width : width;
        node.height = heightFit ? source.height : height;
        // Corner radius is stored verbatim and clamped only at render (D1) — a pill
        // (e.g. 9999) stays a pill across a resize instead of being re-corrected.
        node.x = widthFit ? source.x : roundPixel(localCenter.x - node.width / 2);
        node.y = heightFit ? source.y : roundPixel(localCenter.y - node.height / 2);
        bakePathResize(node, source);
        applyTextFitSizingInPlace(next, id);
        // Reflow pinned children when the container's size changed (G5).
        applyChildConstraintsInPlace(
          next,
          id,
          { width: source.width, height: source.height },
          { width: node.width, height: node.height },
        );
      }
      return { document: next, guides: [] };
    }
  }

  let nextRect: Rect;
  if (source.rotation !== 0) {
    nextRect = resizeRotatedRectFromHandle(startRect, handle, currentPoint, source.rotation, {
      altKey: fromCenter,
      shiftKey: constrainAspect,
    });
    nextRect = clampRotatedRectToBounds(nextRect, source.rotation, parentBounds);
  } else {
    nextRect = resizeBoxFromHandle(startRect, interaction.startPoint, currentPoint, handle, {
      altKey: fromCenter,
      shiftKey: constrainAspect,
    });
    nextRect = clampRectToBounds(nextRect, parentBounds);
  }
  const width = roundPixel(clamp(nextRect.width, minW, maxW));
  const height = roundPixel(clamp(nextRect.height, minH, maxH));
  let absX: number;
  let absY: number;
  if (source.rotation !== 0 || fromCenter) {
    absX = nextRect.x;
    absY = nextRect.y;
  } else {
    const dirX = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
    const dirY = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
    const dx = currentPoint.x - interaction.startPoint.x;
    const dy = currentPoint.y - interaction.startPoint.y;
    // Anchor the edge opposite the (post-flip) growth direction, so a resize
    // dragged past its anchor mirrors like resizeBoxFromHandle does (F1) rather
    // than pinning. Identical to the plain min/max anchoring when not flipped.
    const growsRight = (dirX !== 0 && startRect.width + dx * dirX < 0 ? -dirX : dirX) > 0;
    const growsDown = (dirY !== 0 && startRect.height + dy * dirY < 0 ? -dirY : dirY) > 0;
    if (dirX === 0) absX = startRect.x;
    else {
      const anchorX = dirX > 0 ? startRect.x : startRect.x + startRect.width;
      absX = growsRight ? anchorX : anchorX - width;
    }
    if (dirY === 0) absY = startRect.y;
    else {
      const anchorY = dirY > 0 ? startRect.y : startRect.y + startRect.height;
      absY = growsDown ? anchorY : anchorY - height;
    }
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
      const widthFit = source.type === "text" && source.sizing?.width === "fit";
      const heightFit = source.type === "text" && source.sizing?.height === "fit";
      node.width = widthFit ? source.width : width;
      node.height = heightFit ? source.height : height;
      // Corner radius kept verbatim, clamped only at render (D1) — pill survives resize.
      node.x = widthFit ? source.x : roundPixel(absX - parentBounds.x);
      node.y = heightFit ? source.y : roundPixel(absY - parentBounds.y);
      bakePathResize(node, source);
      applyTextFitSizingInPlace(next, id);
      // Reflow pinned children when the container's size changed (G5).
      applyChildConstraintsInPlace(
        next,
        id,
        { width: source.width, height: source.height },
        { width: node.width, height: node.height },
      );
    }
  }
  return { document: next, guides: [] };
}

/**
 * The fixed point of a proportional scale, derived from the handle being dragged.
 * Dragging a corner anchors the opposite corner; dragging an edge anchors the
 * opposite edge's midline; Alt (resize-from-center) anchors the box center.
 */
function scaleAnchor(box: Rect, handle: string, fromCenter: boolean): Point {
  if (fromCenter) return { x: rectCenterX(box), y: rectCenterY(box) };
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;
  let x = rectCenterX(box);
  let y = rectCenterY(box);
  if (handle.includes("w")) x = right;
  else if (handle.includes("e")) x = left;
  if (handle.includes("n")) y = bottom;
  else if (handle.includes("s")) y = top;
  return { x, y };
}

/** Numeric style properties scaled alongside an element's geometry. */
const SCALABLE_STYLE_KEYS = ["fontSize", "borderRadius", "borderWidth", "gap", "padding"] as const;

// The Scale tool shrinks proportionally, so the normal 8px resize floor would make
// elements "stick" at 8px instead of scaling smoothly down. Allow scaling far below
// that — clamped only to keep dimensions positive (not zero/negative).
const SCALE_MIN_ELEMENT_SIZE = 1;

function applyScaledNode(
  doc: CanvasDocument,
  id: string,
  geom: Rect,
  scale: number,
): void {
  const node = mutateElementWithStyles(doc, id);
  if (!node) return;
  const oldW = node.width;
  const oldH = node.height;
  node.x = roundPixel(geom.x);
  node.y = roundPixel(geom.y);
  node.width = roundPixel(Math.max(geom.width, SCALE_MIN_ELEMENT_SIZE));
  node.height = roundPixel(Math.max(geom.height, SCALE_MIN_ELEMENT_SIZE));
  if (node.type === "path" && node.path) {
    const sx = oldW ? node.width / oldW : 1;
    const sy = oldH ? node.height / oldH : 1;
    if (sx !== 1 || sy !== 1) {
      node.path = scaledPath(node.path, sx, sy);
      node.viewBox = { width: node.width, height: node.height };
    }
  }
  for (const key of SCALABLE_STYLE_KEYS) {
    const value = node.styles[key];
    if (typeof value === "number") node.styles[key] = roundPixel(value * scale);
  }
  // Per-corner radii scale with geometry the same way the uniform radius does.
  if (node.styles.cornerRadii) {
    node.styles.cornerRadii = node.styles.cornerRadii.map((r) => roundPixel(r * scale)) as [
      number,
      number,
      number,
      number,
    ];
  }
}

/**
 * Scale tool: resize the selected element(s) uniformly (proportionally) about the
 * handle's anchor, and apply the same scale factor to every descendant — position,
 * size, font size, radii, padding — so the whole subtree grows or shrinks together.
 *
 * Unlike a normal resize, dragging any handle (edge or corner) produces a single
 * uniform scale factor, so the aspect ratio is always preserved.
 */
export function scaleDocument(
  interaction: ResizeInteraction,
  currentPoint: Point,
  event: ReactPointerEvent,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): { document: CanvasDocument; guides: SnapGuide[] } {
  const fromCenter = isModifierCommandActive(event, settings, "canvas.resize.fromCenter");
  // Force aspect lock (shiftKey) so the box scales uniformly regardless of handle.
  const nextBox = resizeBoxFromHandle(interaction.startBox, interaction.startPoint, currentPoint, interaction.handle, {
    altKey: fromCenter,
    shiftKey: true,
    minSize: SCALE_MIN_ELEMENT_SIZE,
  });
  const scale = nextBox.width / Math.max(interaction.startBox.width, 1);
  const anchor = scaleAnchor(interaction.startBox, interaction.handle, fromCenter);

  const next = shallowCloneDocument(interaction.beforeDocument);
  for (const id of interaction.transformIds) {
    const startRect = interaction.startRects[id];
    if (!startRect) continue;
    // Selected element: similarity transform about the anchor in absolute space,
    // then back to parent-relative coordinates (the parent itself is not scaled).
    const parentBounds = getParentBounds(interaction.beforeDocument, id);
    applyScaledNode(
      next,
      id,
      {
        x: anchor.x + (startRect.x - anchor.x) * scale - parentBounds.x,
        y: anchor.y + (startRect.y - anchor.y) * scale - parentBounds.y,
        width: startRect.width * scale,
        height: startRect.height * scale,
      },
      scale,
    );
    // Descendants render nested inside the parent, so their parent-relative
    // coordinates simply scale by the same factor.
    for (const descId of getDescendantIds(interaction.beforeDocument, id)) {
      const source = interaction.beforeDocument.elements[descId];
      if (!source) continue;
      applyScaledNode(
        next,
        descId,
        {
          x: source.x * scale,
          y: source.y * scale,
          width: source.width * scale,
          height: source.height * scale,
        },
        scale,
      );
    }
  }
  return { document: next, guides: [] };
}

export function resizeDocument(
  interaction: ResizeInteraction,
  currentPoint: Point,
  event: ReactPointerEvent,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): { document: CanvasDocument; guides: SnapGuide[] } {
  if (interaction.scaleMode) return scaleDocument(interaction, currentPoint, event, settings);
  if (interaction.transformIds.length === 1) return resizeSingleElement(interaction, currentPoint, event, settings);
  const fromCenter = isModifierCommandActive(event, settings, "canvas.resize.fromCenter");
  const constrainAspect = isModifierCommandActive(event, settings, "canvas.transform.constrainAspect");
  let nextBox = resizeBoxFromHandle(interaction.startBox, interaction.startPoint, currentPoint, interaction.handle, {
    altKey: fromCenter,
    shiftKey: constrainAspect,
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
    const nc = getElementDefinition(node.type).capabilities.constraints;
    const widthFit = node.type === "text" && node.sizing?.width === "fit";
    const heightFit = node.type === "text" && node.sizing?.height === "fit";
    node.width = widthFit
      ? sourceNode.width
      : roundPixel(clamp(absoluteRect.width, nc.width.min, Math.min(parentSize.width, nc.width.max ?? parentSize.width)));
    node.height = heightFit
      ? sourceNode.height
      : roundPixel(clamp(absoluteRect.height, nc.height.min, Math.min(parentSize.height, nc.height.max ?? parentSize.height)));
    // Corner radius kept verbatim, clamped only at render (D1).
    const clampedRect = clampRotatedRectToBounds(
      { x: absoluteRect.x, y: absoluteRect.y, width: node.width, height: node.height },
      node.rotation,
      parentBounds,
    );
    node.x = widthFit ? sourceNode.x : roundPixel(clampedRect.x - parentBounds.x);
    node.y = heightFit ? sourceNode.y : roundPixel(clampedRect.y - parentBounds.y);
    bakePathResize(node, sourceNode);
    applyTextFitSizingInPlace(next, id);
  }
  return { document: next, guides: [] };
}

export function rotateDocument(
  interaction: RotateInteraction,
  currentPoint: Point,
  event: ReactPointerEvent,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): { document: CanvasDocument; guides: SnapGuide[] } {
  const currentAngle = angleBetweenPoints(interaction.center, currentPoint);
  const delta = angleDelta(interaction.startAngle, currentAngle);
  const next = shallowCloneDocument(interaction.beforeDocument);
  for (const id of interaction.transformIds) {
    const node = mutateElementShallow(next, id);
    if (!node) continue;
    const rawRotation = (interaction.startRotations[id] ?? 0) + delta;
    node.rotation = roundAngle(
      normalizeAngle(
        snapAngle(rawRotation, isModifierCommandActive(event, settings, "canvas.rotate.snap")),
      ),
    );
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

// Inward 45° projection of `local` onto the rail the corner's radius handle slides
// along (equal offset on both axes). The projection is invariant to movement
// perpendicular to the rail, so perpendicular cursor drift never changes the radius.
function radiusCornerOffset(corner: RadiusCorner, local: Point, rect: Rect): number {
  let dx = 0;
  let dy = 0;
  switch (corner) {
    case "nw": dx = local.x - rect.x; dy = local.y - rect.y; break;
    case "ne": dx = rect.x + rect.width - local.x; dy = local.y - rect.y; break;
    case "se": dx = rect.x + rect.width - local.x; dy = rect.y + rect.height - local.y; break;
    case "sw": dx = local.x - rect.x; dy = rect.y + rect.height - local.y; break;
  }
  return (dx + dy) / 2;
}

// How far (canvas units) the cursor must travel toward one corner of a stacked pair
// before the gesture commits to that corner. Measured as relative divergence between
// the pair's offsets, so it is immune to where exactly the grab landed on the ball.
const RADIUS_COMMIT_EPSILON = 0.5;

// The two corners that share the SHORT edge the grabbed handle lives on — the pair
// whose handles stack at the maximum radius. The grabbed corner may be either one;
// the hit test reports whichever is drawn on top, so we resolve the full pair here.
function radiusEdgeCorners(
  corner: RadiusCorner,
  width: number,
  height: number,
): [RadiusCorner, RadiusCorner] {
  if (width >= height) {
    // wide (or square): short edges are vertical → pair across the height
    return corner === "nw" || corner === "sw" ? ["nw", "sw"] : ["ne", "se"];
  }
  // tall: short edges are horizontal → pair across the width
  return corner === "nw" || corner === "ne" ? ["nw", "ne"] : ["sw", "se"];
}

const ALL_RADIUS_CORNERS: RadiusCorner[] = ["nw", "ne", "se", "sw"];

// styles.cornerRadii is [top-left, top-right, bottom-right, bottom-left].
const RADIUS_CORNER_TO_INDEX: Record<RadiusCorner, 0 | 1 | 2 | 3> = {
  nw: 0,
  ne: 1,
  se: 2,
  sw: 3,
};

// The corner's current radius as the user sees it: its per-corner entry when
// per-corner radii exist, else the uniform radius.
function effectiveCornerRadius(styles: ElementNode["styles"], corner: RadiusCorner): number {
  return styles.cornerRadii?.[RADIUS_CORNER_TO_INDEX[corner]] ?? styles.borderRadius ?? 0;
}

// The set of corners whose handles stack at the maximum radius and therefore compete
// for the grab. A rectangle only stacks the two handles on the short edge. A perfect
// square collapses ALL FOUR handles onto the center, so any corner is a valid target —
// the grab must be allowed to commit toward any of them, not just one short-edge pair.
function radiusStackedCorners(
  corner: RadiusCorner,
  width: number,
  height: number,
): RadiusCorner[] {
  if (Math.abs(width - height) < 0.5) return ALL_RADIUS_CORNERS;
  return radiusEdgeCorners(corner, width, height);
}

export function radiusDocument(
  interaction: RadiusInteraction,
  currentPoint: Point,
  // Round only the grabbed corner (Alt by default, `canvas.radius.perCorner`),
  // writing styles.cornerRadii instead of the uniform borderRadius (F4).
  perCorner = false,
): { document: CanvasDocument; guides: SnapGuide[] } {
  const element = interaction.beforeDocument.elements[interaction.elementId];
  if (!element) return { document: interaction.beforeDocument, guides: [] };
  const absRect = getAbsoluteRect(interaction.beforeDocument, interaction.elementId);
  const absCenter = getAbsoluteCenter(interaction.beforeDocument, interaction.elementId);
  if (!absRect || !absCenter) return { document: interaction.beforeDocument, guides: [] };
  // Center on the element's true visual center (which accounts for ancestor
  // rotation) and un-rotate the cursor by the full effective rotation, so a rect
  // nested under a rotated parent tracks the radius ball correctly (M1). With no
  // ancestor rotation this reduces exactly to the element's own center + rotation.
  const rect: Rect = {
    x: absCenter.x - absRect.width / 2,
    y: absCenter.y - absRect.height / 2,
    width: absRect.width,
    height: absRect.height,
  };
  const center = { x: absCenter.x, y: absCenter.y };
  const effectiveRotation = getEffectiveRotation(interaction.beforeDocument, interaction.elementId);
  const local = effectiveRotation
    ? rotatePoint(currentPoint, center, -effectiveRotation)
    : { x: currentPoint.x, y: currentPoint.y };

  // When the grab starts at the maximum radius, the handles that share the short edge
  // (two of them for a rectangle, all four for a square) sit one on top of the other
  // and we cannot yet tell which corner the user means. The FIRST drag that diverges
  // toward one corner commits to it for the rest of the gesture; afterwards only that
  // corner drives the radius, so the ball can be brought back to the lock (the clamped
  // maximum) but cannot cross it into another corner.
  const candidates = radiusStackedCorners(interaction.corner, rect.width, rect.height);
  const maxRadius = maxBorderRadiusForSize(rect.width, rect.height);
  const grabbedAtMax =
    effectiveCornerRadius(element.styles, interaction.corner) >= maxRadius - RADIUS_COMMIT_EPSILON;

  if (!interaction.committedCorner) {
    if (perCorner || element.styles.cornerRadii) {
      // Per-corner mode targets exactly the grabbed ball; and with mixed radii
      // the handles no longer stack pairwise, so the ambiguity dance is moot.
      interaction.committedCorner = interaction.corner;
    } else if (!grabbedAtMax) {
      // Unstacked grab: the reported corner is unambiguous, lock to it immediately.
      interaction.committedCorner = interaction.corner;
    } else {
      const startLocal = effectiveRotation
        ? rotatePoint(interaction.startPoint, center, -effectiveRotation)
        : interaction.startPoint;
      // Pulling the ball toward a corner drives that corner's offset down fastest, so
      // the candidate whose offset has dropped the most since the grab is the one the
      // user is dragging toward. Commit to it once it clearly separates from the
      // runner-up (the relative measure makes this immune to where the grab landed).
      const deltas = candidates
        .map((corner) => ({
          corner,
          delta:
            radiusCornerOffset(corner, local, rect) -
            radiusCornerOffset(corner, startLocal, rect),
        }))
        .sort((a, b) => a.delta - b.delta);
      if (deltas.length > 1 && deltas[1].delta - deltas[0].delta > RADIUS_COMMIT_EPSILON) {
        interaction.committedCorner = deltas[0].corner;
      }
    }
  }

  const offset = interaction.committedCorner
    ? radiusCornerOffset(interaction.committedCorner, local, rect)
    : Math.min(...candidates.map((corner) => radiusCornerOffset(corner, local, rect)));
  const newRadius = roundPixel(clampBorderRadiusForSize(offset, rect.width, rect.height));
  const next = shallowCloneDocument(interaction.beforeDocument);
  const node = mutateElementWithStyles(next, interaction.elementId);
  if (node) {
    // A manual radius drag takes over from a bound radius token (G14) — same
    // rule as the inspector fields: editing the concrete value clears the ref.
    node.styles.radiusRef = undefined;
    if (perCorner) {
      const uniform = node.styles.borderRadius ?? 0;
      const radii = (node.styles.cornerRadii ?? [uniform, uniform, uniform, uniform]).slice() as [
        number,
        number,
        number,
        number,
      ];
      radii[RADIUS_CORNER_TO_INDEX[interaction.committedCorner ?? interaction.corner]] = newRadius;
      if (radii.every((r) => r === radii[0])) {
        // All corners converged back to one value — collapse to the uniform field,
        // mirroring the inspector's convention (per-corner off ⇒ cornerRadii unset).
        node.styles.borderRadius = radii[0];
        node.styles.cornerRadii = undefined;
      } else {
        node.styles.cornerRadii = radii;
      }
    } else {
      // Uniform drag rounds every corner; clear a per-corner override so it
      // doesn't keep masking the uniform value at render.
      node.styles.borderRadius = newRadius;
      node.styles.cornerRadii = undefined;
    }
  }
  return { document: next, guides: [] };
}

export function resizeCanvasDocument(
  interaction: CanvasResizeInteraction,
  event: ReactPointerEvent,
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
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
  if (isModifierCommandActive(event, settings, "canvas.transform.constrainAspect") && handle.length === 2) {
    const aspect = interaction.startWidth / Math.max(interaction.startHeight, 1);
    if (Math.abs(delta.x) > Math.abs(delta.y)) newHeight = newWidth / aspect;
    else newWidth = newHeight * aspect;
  }
  const next = shallowCloneDocument(interaction.beforeDocument);
  const width = Math.round(Math.max(50, newWidth));
  const height = Math.round(Math.max(50, newHeight));
  next.canvas.width = width;
  next.canvas.height = height;
  // Reflow pinned root elements against the frame's new size (G5).
  applyChildConstraintsInPlace(
    next,
    null,
    { width: interaction.startWidth, height: interaction.startHeight },
    { width, height },
  );
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
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): CanvasDocument {
  const currentAngle = angleBetweenPoints(interaction.center, currentPoint);
  const delta = angleDelta(interaction.startAngle, currentAngle);
  const rawRotation = interaction.startRotation + delta;
  const newRotation = roundAngle(
    normalizeAngle(
      snapAngle(rawRotation, isModifierCommandActive(event, settings, "canvas.rotate.snap")),
    ),
  );
  const next = shallowCloneDocument(interaction.beforeDocument);
  next.canvas.rotation = newRotation;
  return next;
}
