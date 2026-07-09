import type { CanvasDocument, ElementNode } from "../types";
import { clampRotatedRectToBounds, getParentBounds, roundPixel } from "../geometry";
import { mutateElementShallow } from "./coreUtils";

// Same as elementGeometry's clampNodeToParentBounds, duplicated here to keep
// this module out of a circular import (elementGeometry calls into this one).
function clampToParentInPlace(document: CanvasDocument, node: ElementNode): void {
  const parentBounds = getParentBounds(document, node.id);
  const clamped = clampRotatedRectToBounds(
    { x: parentBounds.x + node.x, y: parentBounds.y + node.y, width: node.width, height: node.height },
    node.rotation,
    parentBounds,
  );
  node.x = roundPixel(clamped.x - parentBounds.x);
  node.y = roundPixel(clamped.y - parentBounds.y);
}

type Size = { width: number; height: number };

// Constraint application on container/frame resize (G5). The geometry twin of
// domain/canvas/layout.ts#compileConstraints — same per-axis semantics, but
// baked into the stored px geometry when the parent's size actually changes:
//   left/top (default)     → pinned edge, nothing moves
//   right/bottom           → the far inset is preserved (x shifts by dW)
//   left-right/top-bottom  → both insets preserved (the child stretches)
//   center                 → the child's center keeps its relative position
//   scale                  → position and size scale with the parent
// Constraint *authoring* is Pin X / Pin Y in the Layout section; auto-layout
// (flex/grid) children are excluded — the layout engine owns their geometry.

function isTextFitAxis(node: ElementNode, axis: "width" | "height"): boolean {
  return node.type === "text" && node.sizing?.[axis] === "fit";
}

function applyAxis(
  constraint: string,
  position: number,
  size: number,
  oldTotal: number,
  newTotal: number,
  sizeLocked: boolean,
): { position: number; size: number } {
  const delta = newTotal - oldTotal;
  switch (constraint) {
    case "right":
    case "bottom":
      return { position: position + delta, size };
    case "left-right":
    case "top-bottom":
      return sizeLocked
        ? { position, size }
        : { position, size: Math.max(1, size + delta) };
    case "center": {
      // Mirror compileConstraints: the center keeps its RELATIVE (percentage)
      // position in the parent, so a frame twice as wide keeps the child at
      // the same visual fraction.
      if (oldTotal === 0) return { position, size };
      const center = ((position + size / 2) / oldTotal) * newTotal;
      return { position: center - size / 2, size };
    }
    case "scale": {
      if (oldTotal === 0) return { position, size };
      const factor = newTotal / oldTotal;
      return sizeLocked
        ? { position: position * factor, size }
        : { position: position * factor, size: Math.max(1, size * factor) };
    }
    default:
      // "left" / "top" — pinned to the origin edge, no change.
      return { position, size };
  }
}

/**
 * Reflow the direct children of `parentId` (or the frame roots when null)
 * after the parent's inner size changed from `oldSize` to `newSize`, honoring
 * each child's `constraintH`/`constraintV`. Children whose size changed
 * cascade into their own subtrees. Mutates `document` in place — callers pass
 * a (shallow-)cloned document; child nodes are cloned via mutateElementShallow.
 */
export function applyChildConstraintsInPlace(
  document: CanvasDocument,
  parentId: string | null,
  oldSize: Size,
  newSize: Size,
): void {
  if (oldSize.width === newSize.width && oldSize.height === newSize.height) return;
  const parent = parentId ? document.elements[parentId] : null;
  if (parentId && !parent) return;
  // Auto-layout children are positioned by the flex/grid engine, not by pins.
  const display = parent?.styles.display;
  if (display === "flex" || display === "grid") return;

  const childIds = parent ? parent.children : document.rootIds;
  for (const childId of childIds) {
    const source = document.elements[childId];
    if (!source) continue;
    const h = applyAxis(
      source.styles.constraintH ?? "left",
      source.x,
      source.width,
      oldSize.width,
      newSize.width,
      isTextFitAxis(source, "width"),
    );
    const v = applyAxis(
      source.styles.constraintV ?? "top",
      source.y,
      source.height,
      oldSize.height,
      newSize.height,
      isTextFitAxis(source, "height"),
    );
    if (h.position === source.x && h.size === source.width && v.position === source.y && v.size === source.height) {
      continue;
    }
    const node = mutateElementShallow(document, childId);
    if (!node) continue;
    const childOldSize = { width: node.width, height: node.height };
    node.x = roundPixel(h.position);
    node.y = roundPixel(v.position);
    node.width = roundPixel(h.size);
    node.height = roundPixel(v.size);
    clampToParentInPlace(document, node);
    // A stretched/scaled child is itself a resized container for ITS children.
    if (childOldSize.width !== node.width || childOldSize.height !== node.height) {
      applyChildConstraintsInPlace(document, childId, childOldSize, {
        width: node.width,
        height: node.height,
      });
    }
  }
}
