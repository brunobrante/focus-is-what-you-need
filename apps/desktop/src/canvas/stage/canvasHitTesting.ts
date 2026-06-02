import { isDescendantOf, isPointInElement } from "@/canvas/engine/geometry";
import type { CanvasDocument, Point, RadiusCorner, ResizeHandle } from "@/canvas/engine/types";
import {
  EDGE_THICKNESS,
  HANDLE_SIZE,
  RADIUS_HANDLE_SIZE,
  ROTATION_OFFSET,
  ROTATION_SIZE,
  type ToolingBox,
} from "./canvasToolingRenderer";

// ─── Element hit testing ──────────────────────────────────────────────────────

export function findChildAtPoint(
  document: CanvasDocument,
  parentId: string,
  point: Point,
): string | null {
  const parent = document.elements[parentId];
  if (!parent) return null;
  let bestId: string | null = null;
  function walk(ids: string[]): void {
    for (const id of ids) {
      const node = document.elements[id];
      if (!node || node.visible === false || node.locked) continue;
      if (isPointInElement(document, id, point)) {
        bestId = id;
      }
      walk(node.children);
    }
  }
  walk(parent.children);
  return bestId;
}

function canContainChildren(type: string): boolean {
  return type === "rect";
}

export function findDropTarget(
  document: CanvasDocument,
  point: Point,
  excludeIds: Set<string>,
): string | null {
  let bestId: string | null = null;
  function walk(ids: string[]): void {
    for (const id of ids) {
      if (excludeIds.has(id)) continue;
      const node = document.elements[id];
      if (!node || node.visible === false || node.locked) continue;
      if (isPointInElement(document, id, point)) {
        if (canContainChildren(node.type)) bestId = id;
        walk(node.children);
      }
    }
  }
  walk(document.rootIds);
  return bestId;
}

export function retargetForIsolatedParent(
  document: CanvasDocument,
  isolatedParentId: string | null,
  targetId: string | null,
): string | null {
  if (!isolatedParentId || !targetId || !document.elements[isolatedParentId]) {
    return targetId;
  }
  if (targetId === isolatedParentId || isDescendantOf(document, targetId, isolatedParentId)) {
    return isolatedParentId;
  }
  return targetId;
}

// ─── Tooling hit testing ──────────────────────────────────────────────────────

export type { RadiusCorner } from "@/canvas/engine/types";

export type ToolingHit =
  | { type: "none"; cursor: null }
  | { type: "resize"; handle: ResizeHandle; cursor: string }
  | { type: "rotate"; cursor: string }
  | { type: "radius"; corner: RadiusCorner; cursor: string };

export type ToolingGeometry = {
  selectionBox: ToolingBox | null;
  radiusHandlePositions: Point[] | null;
  canResize: boolean;
  canRotate: boolean;
  hasRadiusHandles: boolean;
  cursorRotation: number;
  /** When set, only these handles are hit-tested. null = all handles. */
  allowedResizeHandles: readonly ResizeHandle[] | null;
};

// ─── Figma-style rotation cursor (curved arrow, two arrowheads) ───────────────

// Base angle per corner: the exported SVG is naturally oriented for NW (arrows
// at upper-left and lower-right). Each subsequent corner needs +90° clockwise.
const CORNER_BASE_ANGLE: Record<"nw" | "ne" | "se" | "sw", number> = {
  nw: 270,
  ne: 0,
  se: 90,
  sw: 180,
};

const ROTATE_CURSOR_WHITE_PATH =
  "M22.4393 19.4393L21.9002 19.9784C21.2216 14.8442 17.1558 10.7784 12.0216 10.0998L12.5607 9.56066C13.1464 8.97487 13.1464 8.02513 12.5607 7.43934C11.9749 6.85355 11.0251 6.85355 10.4393 7.43934L7.43934 10.4393C6.85355 11.0251 6.85355 11.9749 7.43934 12.5607L10.4393 15.5607C11.0251 16.1464 11.9749 16.1464 12.5607 15.5607C13.1464 14.9749 13.1464 14.0251 12.5607 13.4393L12.3157 13.1944C15.5527 13.8987 18.1013 16.4473 18.8056 19.6843L18.5607 19.4393C17.9749 18.8536 17.0251 18.8536 16.4393 19.4393C15.8536 20.0251 15.8536 20.9749 16.4393 21.5607L19.4393 24.5607C20.0251 25.1464 20.9749 25.1464 21.5607 24.5607L24.5607 21.5607C25.1464 20.9749 25.1464 20.0251 24.5607 19.4393C23.9749 18.8536 23.0251 18.8536 22.4393 19.4393Z";

const ROTATE_CURSOR_BLACK_PATH =
  "M11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L9.70711 11H10.5C16.299 11 21 15.701 21 21.5V22.2929L23.1464 20.1464C23.3417 19.9512 23.6583 19.9512 23.8536 20.1464C24.0488 20.3417 24.0488 20.6583 23.8536 20.8536L20.8536 23.8536C20.6583 24.0488 20.3417 24.0488 20.1464 23.8536L17.1464 20.8536C16.9512 20.6583 16.9512 20.3417 17.1464 20.1464C17.3417 19.9512 17.6583 19.9512 17.8536 20.1464L20 22.2929V21.5C20 16.2533 15.7467 12 10.5 12H9.70711L11.8536 14.1464C12.0488 14.3417 12.0488 14.6583 11.8536 14.8536C11.6583 15.0488 11.3417 15.0488 11.1464 14.8536L8.14645 11.8536C7.95118 11.6583 7.95118 11.3417 8.14645 11.1464L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645Z";

const moonCursorCache = new Map<string, string>();

function buildMoonSvg(angleDeg: number): string {
  const size = 32;
  const cx = size / 2;
  const cy = size / 2;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}' fill='none'>` +
    `<g transform='rotate(${angleDeg} ${cx} ${cy})'>` +
    `<path d='${ROTATE_CURSOR_WHITE_PATH}' fill='white'/>` +
    `<path d='${ROTATE_CURSOR_BLACK_PATH}' fill='black'/>` +
    `</g></svg>`
  );
}

function getRotateCursorForCorner(
  corner: "nw" | "ne" | "se" | "sw",
  canvasRotation: number,
): string {
  const angle = ((CORNER_BASE_ANGLE[corner] + canvasRotation) % 360 + 360) % 360;
  const key = `${corner}-${Math.round(angle)}`;
  let cached = moonCursorCache.get(key);
  if (!cached) {
    const svg = buildMoonSvg(Math.round(angle));
    const encoded = encodeURIComponent(svg);
    cached = `url("data:image/svg+xml,${encoded}") 16 16, crosshair`;
    moonCursorCache.set(key, cached);
  }
  return cached;
}

const handleAngle: Record<ResizeHandle, number> = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315,
};

const cursorAt45: string[] = [
  "ns-resize",
  "nesw-resize",
  "ew-resize",
  "nwse-resize",
  "ns-resize",
  "nesw-resize",
  "ew-resize",
  "nwse-resize",
];

const svgCursorCache = new Map<string, string>();

function buildArrowSvg(angleDeg: number): string {
  const size = 24;
  const cx = size / 2;
  const top = 4;
  const bot = 20;
  const hs = 3.5;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
    `<g transform='rotate(${angleDeg} ${cx} ${cx})'>` +
    `<line x1='${cx}' y1='${top}' x2='${cx}' y2='${bot}' stroke='white' stroke-width='3' stroke-linecap='round'/>` +
    `<polyline points='${cx - hs},${top + hs} ${cx},${top} ${cx + hs},${top + hs}' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/>` +
    `<polyline points='${cx - hs},${bot - hs} ${cx},${bot} ${cx + hs},${bot - hs}' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/>` +
    `<line x1='${cx}' y1='${top}' x2='${cx}' y2='${bot}' stroke='black' stroke-width='1.5' stroke-linecap='round'/>` +
    `<polyline points='${cx - hs},${top + hs} ${cx},${top} ${cx + hs},${top + hs}' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/>` +
    `<polyline points='${cx - hs},${bot - hs} ${cx},${bot} ${cx + hs},${bot - hs}' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/>` +
    `</g></svg>`
  );
}

export function getRotatedCursor(handle: ResizeHandle, rotation: number): string {
  const angle = ((handleAngle[handle] + rotation) % 360 + 360) % 360;
  if (rotation === 0) {
    const index = Math.round(angle / 45) % 8;
    return cursorAt45[index];
  }
  const roundedAngle = Math.round(angle);
  const key = `${roundedAngle}`;
  let cached = svgCursorCache.get(key);
  if (!cached) {
    const svg = buildArrowSvg(roundedAngle);
    const encoded = encodeURIComponent(svg);
    const fallbackIndex = Math.round(roundedAngle / 45) % 8;
    cached = `url("data:image/svg+xml,${encoded}") 12 12, ${cursorAt45[fallbackIndex]}`;
    svgCursorCache.set(key, cached);
  }
  return cached;
}

function hitTestCornerHandles(vx: number, vy: number, box: ToolingBox): ResizeHandle | null {
  const half = HANDLE_SIZE / 2;
  const [nw, ne, se, sw] = box.corners;
  const corners: { handle: ResizeHandle; point: Point }[] = [
    { handle: "nw", point: nw },
    { handle: "ne", point: ne },
    { handle: "se", point: se },
    { handle: "sw", point: sw },
  ];
  for (const c of corners) {
    if (
      vx >= c.point.x - half &&
      vx <= c.point.x + half &&
      vy >= c.point.y - half &&
      vy <= c.point.y + half
    ) {
      return c.handle;
    }
  }
  return null;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function hitTestEdgeHandles(vx: number, vy: number, box: ToolingBox): ResizeHandle | null {
  const edgeHalf = EDGE_THICKNESS / 2;
  const [nw, ne, se, sw] = box.corners;
  const edges: { handle: ResizeHandle; start: Point; end: Point }[] = [
    { handle: "n", start: nw, end: ne },
    { handle: "e", start: ne, end: se },
    { handle: "s", start: se, end: sw },
    { handle: "w", start: sw, end: nw },
  ];
  const point = { x: vx, y: vy };
  for (const e of edges) {
    if (distanceToSegment(point, e.start, e.end) <= edgeHalf) {
      return e.handle;
    }
  }
  return null;
}

function normalizedVector(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.0001) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

function hitTestRotationZones(
  vx: number,
  vy: number,
  box: ToolingBox,
): "nw" | "ne" | "se" | "sw" | null {
  const half = ROTATION_SIZE / 2;
  const [nw, ne, se, sw] = box.corners;
  const ux = normalizedVector(nw, ne);
  const uy = normalizedVector(nw, sw);
  const positions: Array<{ corner: "nw" | "ne" | "se" | "sw"; x: number; y: number }> = [
    {
      corner: "nw",
      x: nw.x - ux.x * ROTATION_OFFSET - uy.x * ROTATION_OFFSET,
      y: nw.y - ux.y * ROTATION_OFFSET - uy.y * ROTATION_OFFSET,
    },
    {
      corner: "ne",
      x: ne.x + ux.x * ROTATION_OFFSET - uy.x * ROTATION_OFFSET,
      y: ne.y + ux.y * ROTATION_OFFSET - uy.y * ROTATION_OFFSET,
    },
    {
      corner: "se",
      x: se.x + ux.x * ROTATION_OFFSET + uy.x * ROTATION_OFFSET,
      y: se.y + ux.y * ROTATION_OFFSET + uy.y * ROTATION_OFFSET,
    },
    {
      corner: "sw",
      x: sw.x - ux.x * ROTATION_OFFSET + uy.x * ROTATION_OFFSET,
      y: sw.y - ux.y * ROTATION_OFFSET + uy.y * ROTATION_OFFSET,
    },
  ];
  for (const p of positions) {
    if (vx >= p.x - half && vx <= p.x + half && vy >= p.y - half && vy <= p.y + half) {
      return p.corner;
    }
  }
  return null;
}

const radiusCorners: RadiusCorner[] = ["nw", "ne", "se", "sw"];
const RADIUS_HANDLE_HIT_SIZE = 16;

function hitTestRadiusPositions(vx: number, vy: number, positions: Point[]): RadiusCorner | null {
  const r = Math.max(RADIUS_HANDLE_SIZE, RADIUS_HANDLE_HIT_SIZE) / 2;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const dx = vx - p.x;
    const dy = vy - p.y;
    if (dx * dx + dy * dy <= r * r) {
      return radiusCorners[i];
    }
  }
  return null;
}

export function hitTestTooling(vx: number, vy: number, geometry: ToolingGeometry): ToolingHit {
  if (geometry.hasRadiusHandles && geometry.radiusHandlePositions) {
    const corner = hitTestRadiusPositions(vx, vy, geometry.radiusHandlePositions);
    if (corner) return { type: "radius", corner, cursor: "pointer" };
  }

  if (geometry.selectionBox && geometry.canResize) {
    const allowed = geometry.allowedResizeHandles;
    const cornerHandles: readonly ResizeHandle[] = ["nw", "ne", "se", "sw"];
    const allowsCorners = !allowed || allowed.some((h) => cornerHandles.includes(h));

    if (allowsCorners) {
      const cornerHandle = hitTestCornerHandles(vx, vy, geometry.selectionBox);
      if (cornerHandle && (!allowed || allowed.includes(cornerHandle))) {
        return {
          type: "resize",
          handle: cornerHandle,
          cursor: getRotatedCursor(cornerHandle, geometry.cursorRotation),
        };
      }
    }

    const edgeHandle = hitTestEdgeHandles(vx, vy, geometry.selectionBox);
    if (edgeHandle && (!allowed || allowed.includes(edgeHandle))) {
      return {
        type: "resize",
        handle: edgeHandle,
        cursor: getRotatedCursor(edgeHandle, geometry.cursorRotation),
      };
    }
  }

  if (geometry.selectionBox && geometry.canRotate) {
    const rotateCorner = hitTestRotationZones(vx, vy, geometry.selectionBox);
    if (rotateCorner) {
      return {
        type: "rotate",
        cursor: getRotateCursorForCorner(rotateCorner, geometry.cursorRotation),
      };
    }
  }

  return { type: "none", cursor: null };
}
