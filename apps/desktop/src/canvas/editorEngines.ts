import type { CSSProperties } from "react";

import type {
  HtmlCanvasBounds,
  HtmlCanvasDocument,
  HtmlCanvasNode,
  HtmlCanvasStyle,
} from "@/lib/canvas/htmlScene";
import { getHtmlCanvasChildren, getHtmlCanvasNode } from "@/lib/canvas/htmlScene";
import { verticalOverlap, horizontalOverlap } from "@/domain/canvas/geometry";

export type CanvasSelectionState = {
  ids: string[];
  primaryId: string | null;
};

export type CanvasGuide = {
  axis: "x" | "y";
  position: number;
  start: number;
  end: number;
  kind: "edge" | "center" | "grid" | "spacing";
};

export type TransformSnapshot = {
  boundsById: Map<string, HtmlCanvasBounds>;
  styleById: Map<string, HtmlCanvasStyle>;
};

export type SnapInput = {
  document: HtmlCanvasDocument;
  nodeId: string;
  bounds: HtmlCanvasBounds;
  excludedNodeIds?: string[];
  direction?: [number, number];
  gridSize?: number;
  threshold?: number;
};

export type SnapResult = {
  bounds: HtmlCanvasBounds;
  guides: CanvasGuide[];
};

const DEFAULT_GRID_SIZE = 8;
const DEFAULT_SNAP_THRESHOLD = 5;

export function createSelectionEngine(
  document: HtmlCanvasDocument | null,
  rootId: string | null | undefined,
  nodeIds: string[],
): CanvasSelectionState {
  if (!document) return { ids: [], primaryId: null };
  const seen = new Set<string>();
  const ids = nodeIds.filter((id) => {
    if (seen.has(id) || id === rootId) return false;
    const node = getHtmlCanvasNode(document, id);
    if (!node || !node.visible) return false;
    seen.add(id);
    return true;
  });
  return {
    ids,
    primaryId: ids[0] ?? null,
  };
}

export function selectCanvasNode(input: {
  document: HtmlCanvasDocument;
  currentIds: string[];
  nodeId: string;
  additive: boolean;
}): string[] {
  if (input.nodeId === input.document.rootId) return [];
  const node = getHtmlCanvasNode(input.document, input.nodeId);
  if (!node || !node.visible || node.locked) return input.currentIds;
  if (!input.additive) return [input.nodeId];
  return input.currentIds.includes(input.nodeId)
    ? input.currentIds.filter((id) => id !== input.nodeId)
    : [...input.currentIds, input.nodeId];
}

export function selectionFromElements(
  document: HtmlCanvasDocument,
  elements: Array<HTMLElement | SVGElement>,
): string[] {
  const ids = elements
    .map((element) => element.getAttribute("data-canvas-node"))
    .filter((id): id is string => Boolean(id));
  return createSelectionEngine(document, document.rootId, ids).ids;
}

export function createTransformSnapshot(
  document: HtmlCanvasDocument,
  nodeIds: string[],
): TransformSnapshot {
  const boundsById = new Map<string, HtmlCanvasBounds>();
  const styleById = new Map<string, HtmlCanvasStyle>();
  for (const id of nodeIds) {
    const node = getHtmlCanvasNode(document, id);
    if (!node) continue;
    boundsById.set(id, { ...node.bounds });
    styleById.set(id, { ...node.style });
  }
  return { boundsById, styleById };
}

export function translateBounds(
  bounds: HtmlCanvasBounds,
  dx: number,
  dy: number,
  _rootBounds?: HtmlCanvasBounds,
): HtmlCanvasBounds {
  return {
    ...bounds,
    x: Math.round(bounds.x + dx),
    y: Math.round(bounds.y + dy),
  };
}

export function resizeBoundsFromMoveable(input: {
  startBounds: HtmlCanvasBounds;
  width: number;
  height: number;
  dragTranslate: number[];
  rootBounds?: HtmlCanvasBounds;
}): HtmlCanvasBounds {
  const [dx = 0, dy = 0] = input.dragTranslate;
  return {
    x: Math.round(input.startBounds.x + dx),
    y: Math.round(input.startBounds.y + dy),
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height)),
  };
}

export function axisLockDelta(
  dx: number,
  dy: number,
  locked: boolean,
): { dx: number; dy: number } {
  if (!locked) return { dx, dy };
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
}

export function snapBoundsToDocument(input: SnapInput): SnapResult {
  const gridSize = input.gridSize ?? DEFAULT_GRID_SIZE;
  const threshold = input.threshold ?? DEFAULT_SNAP_THRESHOLD;
  const root = getHtmlCanvasNode(input.document, input.document.rootId);
  const excluded = new Set(input.excludedNodeIds ?? [input.nodeId]);
  const rootBounds = root?.bounds ?? input.document.viewport;
  const references = buildSnapReferences(input.document, excluded, rootBounds);
  const source = boundsAnchors(input.bounds);
  const guides: CanvasGuide[] = [];
  let bounds = { ...input.bounds };

  const xSnap = closestSnap(source.x, references.x, gridSize, threshold);
  if (xSnap) {
    bounds = applyAxisSnap(bounds, "x", xSnap.delta, input.direction);
    guides.push({
      axis: "x",
      position: xSnap.position,
      start: 0,
      end: rootBounds.height,
      kind: xSnap.kind,
    });
  }

  const ySnap = closestSnap(source.y, references.y, gridSize, threshold);
  if (ySnap) {
    bounds = applyAxisSnap(bounds, "y", ySnap.delta, input.direction);
    guides.push({
      axis: "y",
      position: ySnap.position,
      start: 0,
      end: rootBounds.width,
      kind: ySnap.kind,
    });
  }

  const spacingGuides = detectSpacingGuides(input.document, excluded, bounds);
  guides.push(...spacingGuides);

  return { bounds, guides };
}

function detectSpacingGuides(
  document: HtmlCanvasDocument,
  excluded: Set<string>,
  bounds: HtmlCanvasBounds,
): CanvasGuide[] {
  const candidates = document.nodes
    .filter((node) => node.id !== document.rootId && !excluded.has(node.id) && node.visible)
    .map((node) => getAbsoluteBounds(document, node));
  if (candidates.length < 2) return [];

  const guides: CanvasGuide[] = [];
  const tolerance = 1;

  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;

  const horizontalNeighbors = candidates.filter(
    (c) => verticalOverlap(c, bounds) > 0,
  );
  const leftNeighbors = horizontalNeighbors
    .filter((c) => c.x + c.width <= left + tolerance)
    .sort((a, b) => b.x + b.width - (a.x + a.width));
  const rightNeighbors = horizontalNeighbors
    .filter((c) => c.x >= right - tolerance)
    .sort((a, b) => a.x - b.x);
  if (leftNeighbors[0] && rightNeighbors[0]) {
    const leftGap = left - (leftNeighbors[0].x + leftNeighbors[0].width);
    const rightGap = rightNeighbors[0].x - right;
    if (Math.abs(leftGap - rightGap) <= tolerance && leftGap > 0) {
      guides.push(spacingGuide("y", leftNeighbors[0].x + leftNeighbors[0].width, left, bounds.y + bounds.height / 2));
      guides.push(spacingGuide("y", right, rightNeighbors[0].x, bounds.y + bounds.height / 2));
    }
  }

  const verticalNeighbors = candidates.filter(
    (c) => horizontalOverlap(c, bounds) > 0,
  );
  const topNeighbors = verticalNeighbors
    .filter((c) => c.y + c.height <= top + tolerance)
    .sort((a, b) => b.y + b.height - (a.y + a.height));
  const bottomNeighbors = verticalNeighbors
    .filter((c) => c.y >= bottom - tolerance)
    .sort((a, b) => a.y - b.y);
  if (topNeighbors[0] && bottomNeighbors[0]) {
    const topGap = top - (topNeighbors[0].y + topNeighbors[0].height);
    const bottomGap = bottomNeighbors[0].y - bottom;
    if (Math.abs(topGap - bottomGap) <= tolerance && topGap > 0) {
      guides.push(spacingGuide("x", topNeighbors[0].y + topNeighbors[0].height, top, bounds.x + bounds.width / 2));
      guides.push(spacingGuide("x", bottom, bottomNeighbors[0].y, bounds.x + bounds.width / 2));
    }
  }

  return guides;
}

function spacingGuide(
  axis: "x" | "y",
  start: number,
  end: number,
  position: number,
): CanvasGuide {
  return {
    axis,
    position,
    start: Math.min(start, end),
    end: Math.max(start, end),
    kind: "spacing",
  };
}

export function getAbsoluteBounds(
  document: HtmlCanvasDocument,
  node: HtmlCanvasNode,
): HtmlCanvasBounds {
  let x = node.bounds.x;
  let y = node.bounds.y;
  let parentId = node.parentId;

  while (parentId) {
    const parent = getHtmlCanvasNode(document, parentId);
    if (!parent || parent.id === document.rootId) break;
    x += parent.bounds.x;
    y += parent.bounds.y;
    parentId = parent.parentId;
  }

  return { ...node.bounds, x, y };
}

export function hitTestCanvasNode(
  document: HtmlCanvasDocument,
  point: { x: number; y: number },
): HtmlCanvasNode | null {
  const candidates = document.nodes
    .filter((node) => node.id !== document.rootId && node.visible && !node.locked)
    .sort((a, b) => {
      const depthDelta = nodeDepth(document, a) - nodeDepth(document, b);
      return depthDelta || a.order - b.order;
    });

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const node = candidates[index]!;
    const bounds = getAbsoluteBounds(document, node);
    if (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    ) {
      return node;
    }
  }
  return null;
}

export function isFlexLayoutChild(
  document: HtmlCanvasDocument,
  node: HtmlCanvasNode,
): boolean {
  if (!node.parentId) return false;
  const parent = getHtmlCanvasNode(document, node.parentId);
  return parent?.style.display === "flex";
}

export function cssAlign(value: HtmlCanvasStyle["align"]): CSSProperties["alignItems"] {
  if (value === "center") return "center";
  if (value === "end") return "flex-end";
  if (value === "stretch") return "stretch";
  return "flex-start";
}

export function cssJustify(
  value: HtmlCanvasStyle["justify"],
): CSSProperties["justifyContent"] {
  if (value === "center") return "center";
  if (value === "end") return "flex-end";
  if (value === "between") return "space-between";
  return "flex-start";
}

function buildSnapReferences(
  document: HtmlCanvasDocument,
  excluded: Set<string>,
  rootBounds: HtmlCanvasBounds | { width: number; height: number },
): { x: SnapReference[]; y: SnapReference[] } {
  const x: SnapReference[] = [
    { position: 0, kind: "edge" },
    { position: rootBounds.width / 2, kind: "center" },
    { position: rootBounds.width, kind: "edge" },
  ];
  const y: SnapReference[] = [
    { position: 0, kind: "edge" },
    { position: rootBounds.height / 2, kind: "center" },
    { position: rootBounds.height, kind: "edge" },
  ];

  for (const node of document.nodes) {
    if (node.id === document.rootId || excluded.has(node.id) || !node.visible) continue;
    const bounds = getAbsoluteBounds(document, node);
    x.push(
      { position: bounds.x, kind: "edge" },
      { position: bounds.x + bounds.width / 2, kind: "center" },
      { position: bounds.x + bounds.width, kind: "edge" },
    );
    y.push(
      { position: bounds.y, kind: "edge" },
      { position: bounds.y + bounds.height / 2, kind: "center" },
      { position: bounds.y + bounds.height, kind: "edge" },
    );
  }

  return { x, y };
}

type SnapReference = {
  position: number;
  kind: CanvasGuide["kind"];
};

type AxisAnchors = {
  start: number;
  center: number;
  end: number;
};

function boundsAnchors(bounds: HtmlCanvasBounds): { x: AxisAnchors; y: AxisAnchors } {
  return {
    x: {
      start: bounds.x,
      center: bounds.x + bounds.width / 2,
      end: bounds.x + bounds.width,
    },
    y: {
      start: bounds.y,
      center: bounds.y + bounds.height / 2,
      end: bounds.y + bounds.height,
    },
  };
}

function closestSnap(
  anchors: AxisAnchors,
  references: SnapReference[],
  gridSize: number,
  threshold: number,
): { delta: number; position: number; kind: CanvasGuide["kind"] } | null {
  let best: { delta: number; position: number; kind: CanvasGuide["kind"] } | null = null;
  const candidates = [
    { anchor: anchors.start },
    { anchor: anchors.center },
    { anchor: anchors.end },
  ];

  for (const candidate of candidates) {
    const gridPosition = Math.round(candidate.anchor / gridSize) * gridSize;
    const gridDelta = gridPosition - candidate.anchor;
    best = chooseBetterSnap(best, {
      delta: gridDelta,
      position: gridPosition,
      kind: "grid",
    }, threshold);

    for (const reference of references) {
      best = chooseBetterSnap(best, {
        delta: reference.position - candidate.anchor,
        position: reference.position,
        kind: reference.kind,
      }, threshold);
    }
  }

  return best;
}

function chooseBetterSnap(
  current: { delta: number; position: number; kind: CanvasGuide["kind"] } | null,
  candidate: { delta: number; position: number; kind: CanvasGuide["kind"] },
  threshold: number,
) {
  if (Math.abs(candidate.delta) > threshold) return current;
  if (!current || Math.abs(candidate.delta) < Math.abs(current.delta)) return candidate;
  return current;
}

function applyAxisSnap(
  bounds: HtmlCanvasBounds,
  axis: "x" | "y",
  delta: number,
  direction?: [number, number],
): HtmlCanvasBounds {
  const next = { ...bounds };
  const directionValue = axis === "x" ? direction?.[0] : direction?.[1];
  if (!direction || directionValue === 0 || directionValue === undefined) {
    if (axis === "x") next.x += delta;
    else next.y += delta;
    return roundBounds(next);
  }

  if (axis === "x" && directionValue > 0) {
    next.width += delta;
  } else if (axis === "x") {
    next.x += delta;
    next.width -= delta;
  } else if (directionValue > 0) {
    next.height += delta;
  } else {
    next.y += delta;
    next.height -= delta;
  }
  next.width = Math.max(1, next.width);
  next.height = Math.max(1, next.height);
  return roundBounds(next);
}


function roundBounds(bounds: HtmlCanvasBounds): HtmlCanvasBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
}

function nodeDepth(document: HtmlCanvasDocument, node: HtmlCanvasNode): number {
  let depth = 0;
  let parentId = node.parentId;
  while (parentId) {
    depth += 1;
    const parent = getHtmlCanvasNode(document, parentId);
    parentId = parent?.parentId ?? null;
  }
  return depth;
}

export function allDescendantIds(document: HtmlCanvasDocument, nodeId: string): Set<string> {
  const ids = new Set<string>();
  const queue = getHtmlCanvasChildren(document, nodeId).map((node) => node.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (ids.has(id)) continue;
    ids.add(id);
    queue.push(...getHtmlCanvasChildren(document, id).map((node) => node.id));
  }
  return ids;
}
