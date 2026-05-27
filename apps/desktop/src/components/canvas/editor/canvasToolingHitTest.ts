import type { Point, ResizeHandle } from "@/lib/editor/types";
import {
  HANDLE_SIZE,
  EDGE_THICKNESS,
  ROTATION_OFFSET,
  ROTATION_SIZE,
  RADIUS_HANDLE_SIZE,
  type ToolingBox,
} from "./canvasToolingRenderer";

export type RadiusCorner = "nw" | "ne" | "se" | "sw";

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
};

const ROTATION_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 16 16\'%3E%3Cpath fill=\'none\' stroke=\'%230d99ff\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M11 4.4A5 5 0 1 0 13 8M13 2.5V7h-4.5\'/%3E%3C/svg%3E") 8 8, grab';

const handleAngle: Record<ResizeHandle, number> = {
  n: 0, ne: 45, e: 90, se: 135,
  s: 180, sw: 225, w: 270, nw: 315,
};

const cursorAt45: string[] = [
  "ns-resize", "nesw-resize", "ew-resize", "nwse-resize",
  "ns-resize", "nesw-resize", "ew-resize", "nwse-resize",
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

function hitTestCornerHandles(
  vx: number,
  vy: number,
  box: ToolingBox,
): ResizeHandle | null {
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

function hitTestEdgeHandles(
  vx: number,
  vy: number,
  box: ToolingBox,
): ResizeHandle | null {
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

function hitTestRotationZones(vx: number, vy: number, box: ToolingBox): boolean {
  const half = ROTATION_SIZE / 2;
  const [nw, ne, se, sw] = box.corners;
  const ux = normalizedVector(nw, ne);
  const uy = normalizedVector(nw, sw);
  const positions = [
    {
      x: nw.x - ux.x * ROTATION_OFFSET - uy.x * ROTATION_OFFSET,
      y: nw.y - ux.y * ROTATION_OFFSET - uy.y * ROTATION_OFFSET,
    },
    {
      x: ne.x + ux.x * ROTATION_OFFSET - uy.x * ROTATION_OFFSET,
      y: ne.y + ux.y * ROTATION_OFFSET - uy.y * ROTATION_OFFSET,
    },
    {
      x: se.x + ux.x * ROTATION_OFFSET + uy.x * ROTATION_OFFSET,
      y: se.y + ux.y * ROTATION_OFFSET + uy.y * ROTATION_OFFSET,
    },
    {
      x: sw.x - ux.x * ROTATION_OFFSET + uy.x * ROTATION_OFFSET,
      y: sw.y - ux.y * ROTATION_OFFSET + uy.y * ROTATION_OFFSET,
    },
  ];
  for (const p of positions) {
    if (
      vx >= p.x - half &&
      vx <= p.x + half &&
      vy >= p.y - half &&
      vy <= p.y + half
    ) {
      return true;
    }
  }
  return false;
}

const radiusCorners: RadiusCorner[] = ["nw", "ne", "se", "sw"];

function hitTestRadiusPositions(
  vx: number,
  vy: number,
  positions: Point[],
): RadiusCorner | null {
  const r = RADIUS_HANDLE_SIZE / 2;
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

export function hitTestTooling(
  vx: number,
  vy: number,
  geometry: ToolingGeometry,
): ToolingHit {
  if (geometry.hasRadiusHandles && geometry.radiusHandlePositions) {
    const corner = hitTestRadiusPositions(vx, vy, geometry.radiusHandlePositions);
    if (corner) return { type: "radius", corner, cursor: "pointer" };
  }

  if (geometry.selectionBox && geometry.canResize) {
    const cornerHandle = hitTestCornerHandles(vx, vy, geometry.selectionBox);
    if (cornerHandle) {
      return {
        type: "resize",
        handle: cornerHandle,
        cursor: getRotatedCursor(cornerHandle, geometry.cursorRotation),
      };
    }
    const edgeHandle = hitTestEdgeHandles(vx, vy, geometry.selectionBox);
    if (edgeHandle) {
      return {
        type: "resize",
        handle: edgeHandle,
        cursor: getRotatedCursor(edgeHandle, geometry.cursorRotation),
      };
    }
  }

  if (geometry.selectionBox && geometry.canRotate) {
    if (hitTestRotationZones(vx, vy, geometry.selectionBox)) {
      return { type: "rotate", cursor: ROTATION_CURSOR };
    }
  }

  return { type: "none", cursor: null };
}
