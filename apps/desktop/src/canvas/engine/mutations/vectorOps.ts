// Document-level vector operations: SVG import (decompose into nodes), flatten a
// shape to a path, and boolean ops over a selection. Pure; return new documents.

import type { CanvasDocument, ElementNode, ElementStyles, VectorAnchor, VectorPath } from "../types";
import { cloneDocument, createId } from "./coreUtils";
import { insertElement, deleteElements } from "./elementHierarchy";
import { makePathNode, recomputePathBounds } from "./vectorPath";
import { canFlattenToPath, shapeToPath } from "../vector/shapeToPath";
import { pathScale } from "../vector/vectorGeometry";
import { booleanPaths, type BooleanOp } from "../vector/boolean";
import type { ImportedSvg } from "../vector/svgImport";

// ─── SVG import ──────────────────────────────────────────────────────────────────

/** Insert a parsed SVG as a sealed container node with child path nodes. */
export function insertSvgDocument(
  doc: CanvasDocument,
  imported: ImportedSvg,
  atX: number,
  atY: number,
): { document: CanvasDocument; svgId: string } {
  const next = cloneDocument(doc);
  const { width: vbW, height: vbH } = imported.viewBox;
  const containerId = createId("svg");
  const childIds: string[] = [];

  for (const ip of imported.paths) {
    const id = createId("path");
    childIds.push(id);
    const styles: ElementStyles = {
      fill: ip.styles.fill ?? "#000000",
      ...(ip.styles.stroke !== undefined ? { stroke: ip.styles.stroke } : {}),
      ...(ip.styles.strokeWidth !== undefined ? { strokeWidth: ip.styles.strokeWidth } : {}),
      ...(ip.styles.fillOpacity !== undefined ? { fillOpacity: ip.styles.fillOpacity } : {}),
      ...(ip.styles.strokeOpacity !== undefined ? { strokeOpacity: ip.styles.strokeOpacity } : {}),
      ...(ip.styles.strokeLinecap !== undefined ? { strokeLinecap: ip.styles.strokeLinecap } : {}),
      ...(ip.styles.strokeLinejoin !== undefined ? { strokeLinejoin: ip.styles.strokeLinejoin } : {}),
      ...(ip.styles.strokeDasharray !== undefined ? { strokeDasharray: ip.styles.strokeDasharray } : {}),
      opacity: ip.styles.opacity ?? 1,
    };
    next.elements[id] = {
      id,
      type: "path",
      parentId: containerId,
      children: [],
      name: ip.name,
      x: 0,
      y: 0,
      width: vbW,
      height: vbH,
      rotation: 0,
      visible: true,
      locked: false,
      styles,
      viewBox: { width: vbW, height: vbH },
      path: ip.path,
    };
  }

  next.elements[containerId] = {
    id: containerId,
    type: "svg",
    parentId: null,
    children: childIds,
    name: "SVG",
    x: atX,
    y: atY,
    width: vbW,
    height: vbH,
    rotation: 0,
    visible: true,
    locked: false,
    styles: { opacity: 1 },
    viewBox: { width: vbW, height: vbH },
  };
  next.rootIds.push(containerId);
  return { document: next, svgId: containerId };
}

// ─── Flatten shape → path ────────────────────────────────────────────────────────

export function flattenElementToPath(doc: CanvasDocument, id: string): CanvasDocument {
  const source = doc.elements[id];
  if (!source || !canFlattenToPath(source.type)) return doc;
  const path = shapeToPath(source);
  if (!path) return doc;
  const next = cloneDocument(doc);
  const node = next.elements[id];
  node.type = "path";
  node.viewBox = { width: source.width || 1, height: source.height || 1 };
  node.path = path;
  node.styles = {
    ...node.styles,
    fill: node.styles.fill ?? node.styles.background ?? "#000000",
    ...(node.styles.borderColor !== undefined ? { stroke: node.styles.borderColor } : {}),
    ...(node.styles.borderWidth !== undefined ? { strokeWidth: node.styles.borderWidth } : {}),
  };
  return recomputePathBounds(next, id);
}

// ─── Boolean ops over a selection ────────────────────────────────────────────────

// A selected element's geometry mapped into canvas space (so two operands share one
// coordinate system before clipping).
function toCanvasPath(node: ElementNode): VectorPath | null {
  if (node.type === "path" && node.path) {
    const { sx, sy } = pathScale(node);
    const subpaths = node.path.subpaths.map((s) => ({
      closed: s.closed,
      anchors: s.anchors.map<VectorAnchor>((a) => ({
        x: node.x + a.x * sx,
        y: node.y + a.y * sy,
        ...(a.inX !== undefined ? { inX: a.inX * sx } : {}),
        ...(a.inY !== undefined ? { inY: a.inY * sy } : {}),
        ...(a.outX !== undefined ? { outX: a.outX * sx } : {}),
        ...(a.outY !== undefined ? { outY: a.outY * sy } : {}),
        ...(a.handleType ? { handleType: a.handleType } : {}),
      })),
    }));
    return { subpaths, fillRule: node.path.fillRule };
  }
  const local = shapeToPath(node);
  if (!local) return null;
  for (const sub of local.subpaths) for (const a of sub.anchors) { a.x += node.x; a.y += node.y; }
  return local;
}

/**
 * Apply a boolean op to the first two convertible selected elements. Replaces them
 * with the resulting path. Returns { document, selectedId } or null when fewer than
 * two operands are usable.
 */
export function applyBooleanToSelection(
  doc: CanvasDocument,
  ids: string[],
  op: BooleanOp,
): { document: CanvasDocument; selectedId: string } | null {
  const operands = ids
    .map((id) => doc.elements[id])
    .filter((n): n is ElementNode => Boolean(n && (n.type === "path" || canFlattenToPath(n.type))));
  if (operands.length < 2) return null;

  const a = toCanvasPath(operands[0]);
  const b = toCanvasPath(operands[1]);
  if (!a || !b) return null;
  const result = booleanPaths(a, b, op);
  if (result.subpaths.length === 0) return null;

  // Build a path node from the canvas-space result (scale 1, then tighten).
  const id = createId("path");
  const node = makePathNode(id, 0, 0, { ...operands[0].styles, opacity: operands[0].styles.opacity ?? 1 });
  node.path = result;
  let next = insertElement(deleteElements(doc, [operands[0].id, operands[1].id]), node);
  next = recomputePathBounds(next, id);
  return { document: next, selectedId: id };
}
