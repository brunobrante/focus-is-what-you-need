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

/** Build a `path` element from an imported SVG path, parented to `parentId` and
 *  filling the SVG's viewBox (shared by the sealed-container and icon imports). */
function pathNodeFromImported(
  ip: ImportedSvg["paths"][number],
  parentId: string | null,
  vbW: number,
  vbH: number,
): ElementNode {
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
  return {
    id: createId("path"),
    type: "path",
    parentId,
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

/**
 * Insert a parsed SVG's paths as DIRECT children of the document root — no sealed
 * `svg` container. Used for icon authoring, where the artboard itself IS the SVG:
 * the paths are the top-level, individually-editable content, so the layers tree
 * shows them directly and the icon exports the whole artboard.
 */
export function insertSvgPathsAsRoot(
  doc: CanvasDocument,
  imported: ImportedSvg,
): { document: CanvasDocument; pathIds: string[] } {
  const next = cloneDocument(doc);
  const { width: vbW, height: vbH } = imported.viewBox;
  const pathIds: string[] = [];
  for (const ip of imported.paths) {
    const node = pathNodeFromImported(ip, null, vbW, vbH);
    next.elements[node.id] = node;
    next.rootIds.push(node.id);
    pathIds.push(node.id);
  }
  return { document: next, pathIds };
}

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
    const node = pathNodeFromImported(ip, containerId, vbW, vbH);
    childIds.push(node.id);
    next.elements[node.id] = node;
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

// A selected element's geometry mapped into canvas space (so operands share one
// coordinate system before clipping). Honors the element's rotation so a rotated
// shape contributes its actual on-screen outline, not its unrotated one (B6).
function toCanvasPath(node: ElementNode): VectorPath | null {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const rot = ((node.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const rotPoint = (px: number, py: number): { x: number; y: number } => {
    if (!rot) return { x: px, y: py };
    const dx = px - cx, dy = py - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  };
  const rotVec = (vx: number, vy: number): { x: number; y: number } =>
    rot ? { x: vx * cos - vy * sin, y: vx * sin + vy * cos } : { x: vx, y: vy };

  if (node.type === "path" && node.path) {
    const { sx, sy } = pathScale(node);
    const subpaths = node.path.subpaths.map((s) => ({
      closed: s.closed,
      anchors: s.anchors.map<VectorAnchor>((a) => {
        const p = rotPoint(node.x + a.x * sx, node.y + a.y * sy);
        const anchor: VectorAnchor = { x: p.x, y: p.y };
        if (a.inX !== undefined || a.inY !== undefined) {
          const v = rotVec((a.inX ?? 0) * sx, (a.inY ?? 0) * sy);
          anchor.inX = v.x; anchor.inY = v.y;
        }
        if (a.outX !== undefined || a.outY !== undefined) {
          const v = rotVec((a.outX ?? 0) * sx, (a.outY ?? 0) * sy);
          anchor.outX = v.x; anchor.outY = v.y;
        }
        if (a.handleType) anchor.handleType = a.handleType;
        return anchor;
      }),
    }));
    return { subpaths, fillRule: node.path.fillRule };
  }
  const local = shapeToPath(node);
  if (!local) return null;
  for (const sub of local.subpaths) {
    for (const a of sub.anchors) {
      const p = rotPoint(a.x + node.x, a.y + node.y);
      a.x = p.x; a.y = p.y;
      if (a.inX !== undefined || a.inY !== undefined) {
        const v = rotVec(a.inX ?? 0, a.inY ?? 0);
        a.inX = v.x; a.inY = v.y;
      }
      if (a.outX !== undefined || a.outY !== undefined) {
        const v = rotVec(a.outX ?? 0, a.outY ?? 0);
        a.outX = v.x; a.outY = v.y;
      }
    }
  }
  return local;
}

/**
 * Apply a boolean op to ALL convertible selected elements, folding them in z-order
 * (bottom → top). Replaces them with a single result path that keeps the operands'
 * parent and stacking position. Returns { document, selectedId } or null when fewer
 * than two operands are usable.
 */
export function applyBooleanToSelection(
  doc: CanvasDocument,
  ids: string[],
  op: BooleanOp,
): { document: CanvasDocument; selectedId: string } | null {
  const idSet = new Set(ids);
  const parentId = doc.elements[ids[0]]?.parentId ?? null;
  // Walk the parent's stacking order so operands fold bottom → top, not selection
  // order (which is arbitrary).
  const siblings = parentId ? doc.elements[parentId]?.children ?? [] : doc.rootIds;
  const operands = siblings
    .filter((id) => idSet.has(id))
    .map((id) => doc.elements[id])
    .filter((n): n is ElementNode => Boolean(n && (n.type === "path" || canFlattenToPath(n.type))));
  if (operands.length < 2) return null;

  const paths = operands.map(toCanvasPath).filter((p): p is VectorPath => p !== null);
  if (paths.length < 2) return null;

  let result = paths[0];
  for (let i = 1; i < paths.length; i++) {
    result = booleanPaths(result, paths[i], op);
    if (result.subpaths.length === 0) return null;
  }

  // Take the top operand's stacking slot (Figma-style). Remember the sibling above
  // it so we can re-insert the result there after removing the operands.
  const topOperandId = operands[operands.length - 1].id;
  const topIndex = siblings.indexOf(topOperandId);
  const aboveId = topIndex >= 0 ? siblings[topIndex + 1] : undefined;

  const id = createId("path");
  const node = makePathNode(id, 0, 0, { ...operands[0].styles, opacity: operands[0].styles.opacity ?? 1 });
  node.path = result;
  node.parentId = parentId;

  let next = insertElement(deleteElements(doc, operands.map((o) => o.id)), node);
  // insertElement appends to the top; slot it back where the operands sat.
  const list = parentId ? next.elements[parentId]?.children : next.rootIds;
  if (list && aboveId && list.includes(aboveId)) {
    const cur = list.indexOf(id);
    if (cur >= 0) list.splice(cur, 1);
    list.splice(list.indexOf(aboveId), 0, id);
  }
  next = recomputePathBounds(next, id);
  return { document: next, selectedId: id };
}
