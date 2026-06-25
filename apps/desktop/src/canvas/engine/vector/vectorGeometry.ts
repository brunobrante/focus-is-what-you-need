// Coordinate mapping between a path element's CANVAS box (node.x/y/width/height)
// and its INTRINSIC viewBox space, where anchors live. Keeping anchors in viewBox
// space lets resize/rotate reuse the existing geometry pipeline untouched: the box
// stretches, viewBox stays fixed, and the path scales for free (see Versioning §2.4).

import type { ElementNode } from "../types";

export function pathScale(node: ElementNode): { sx: number; sy: number } {
  const vb = node.viewBox ?? { width: node.width || 1, height: node.height || 1 };
  const sx = vb.width > 0 ? node.width / vb.width : 1;
  const sy = vb.height > 0 ? node.height / vb.height : 1;
  return { sx: sx || 1, sy: sy || 1 };
}

/** Canvas-space point → path (viewBox) space. */
export function canvasToPathSpace(node: ElementNode, px: number, py: number): { x: number; y: number } {
  const { sx, sy } = pathScale(node);
  return { x: (px - node.x) / sx, y: (py - node.y) / sy };
}

/** Path (viewBox) space → canvas-space point. */
export function pathSpaceToCanvas(node: ElementNode, x: number, y: number): { px: number; py: number } {
  const { sx, sy } = pathScale(node);
  return { px: node.x + x * sx, py: node.y + y * sy };
}

/** Canvas-space delta → path-space delta (no translation). */
export function canvasDeltaToPathSpace(node: ElementNode, dx: number, dy: number): { x: number; y: number } {
  const { sx, sy } = pathScale(node);
  return { x: dx / sx, y: dy / sy };
}
