// Coordinate mapping between a path element's CANVAS box (node.x/y/width/height)
// and its INTRINSIC viewBox space, where anchors live. Keeping anchors in viewBox
// space lets resize/rotate reuse the existing geometry pipeline untouched: the box
// stretches, viewBox stays fixed, and the path scales for free (see Versioning §2.4).
//
// The canvas↔path mappings go through the element's full transform (accumulated
// ancestor translation + rotation, plus the element's own rotation) so that a path
// nested under a parent, or rotated, still maps the cursor correctly (M2).

import type { CanvasDocument, ElementNode } from "../types";
import {
  canvasToElementLocal,
  elementLocalToCanvas,
  getEffectiveRotation,
  rotatePoint,
} from "../geometry";

export function pathScale(node: ElementNode): { sx: number; sy: number } {
  const vb = node.viewBox ?? { width: node.width || 1, height: node.height || 1 };
  const sx = vb.width > 0 ? node.width / vb.width : 1;
  const sy = vb.height > 0 ? node.height / vb.height : 1;
  return { sx: sx || 1, sy: sy || 1 };
}

/** Canvas-space point → path (viewBox) space, through the element's full transform. */
export function canvasToPathSpace(
  document: CanvasDocument,
  node: ElementNode,
  px: number,
  py: number,
): { x: number; y: number } {
  const { sx, sy } = pathScale(node);
  // Fall back to the plain offset if the ancestor chain is momentarily broken.
  const local = canvasToElementLocal(document, node.id, { x: px, y: py }) ?? {
    x: px - node.x,
    y: py - node.y,
  };
  return { x: local.x / sx, y: local.y / sy };
}

/** Path (viewBox) space → canvas-space point, through the element's full transform. */
export function pathSpaceToCanvas(
  document: CanvasDocument,
  node: ElementNode,
  x: number,
  y: number,
): { px: number; py: number } {
  const { sx, sy } = pathScale(node);
  const canvas = elementLocalToCanvas(document, node.id, { x: x * sx, y: y * sy }) ?? {
    x: node.x + x * sx,
    y: node.y + y * sy,
  };
  return { px: canvas.x, py: canvas.y };
}

/** Canvas-space delta → path-space delta: un-rotate by the effective rotation
 *  (ancestor chain + own rotation), then divide by the box scale. */
export function canvasDeltaToPathSpace(
  document: CanvasDocument,
  node: ElementNode,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const { sx, sy } = pathScale(node);
  const effectiveRotation = getEffectiveRotation(document, node.id);
  const d = effectiveRotation ? rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -effectiveRotation) : { x: dx, y: dy };
  return { x: d.x / sx, y: d.y / sy };
}
