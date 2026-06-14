import { clamp, intersectBox, boxFromPoints, boundsOfPoints } from "@/domain/canvas/geometry";
import { clampPanToCenter } from "@/domain/zoom";
import type { CropBox, ActiveSubject, ResizeHandle, RadiusHandle } from "./types";
import { RADIUS_HANDLE_MIN_INSET } from "./types";
import { MIN_TOOL_ZOOM, SELECTION_MIN_SIZE } from "../types";

export { clamp };

// Per-side gutter kept before a fitting axis unlocks panning (the old code baked
// this in as a 64px total inset on the viewport).
const TOOL_PAN_PADDING = 32;

export function intersectCropBoxes(a: CropBox, b: CropBox): CropBox | null {
  return intersectBox(a, b);
}

// Edge-to-center over-scroll, shared with the canvas and the snapshot viewers
// (see clampPanToCenter): once zoomed past 1x the image can be panned until any
// edge reaches the viewport center, never past it.
export function clampToolPan(
  pan: { x: number; y: number },
  zoom: number,
  viewport: HTMLDivElement | null,
  content: HTMLElement | null,
) {
  if (zoom <= MIN_TOOL_ZOOM || !viewport || !content) return { x: 0, y: 0 };
  return clampPanToCenter(
    pan,
    { width: content.clientWidth, height: content.clientHeight },
    { width: viewport.clientWidth, height: viewport.clientHeight },
    zoom,
    TOOL_PAN_PADDING,
  );
}

export function maxCropRadius(box: CropBox) {
  return Math.max(0, Math.min(box.w, box.h) / 2);
}

export function componentBoxInSubject(box: CropBox, subject: ActiveSubject): CropBox | null {
  if (subject.kind === "original") return box;
  const origin = subject.originBox;
  const left = Math.max(box.x, origin.x);
  const top = Math.max(box.y, origin.y);
  const right = Math.min(box.x + box.w, origin.x + origin.w);
  const bottom = Math.min(box.y + box.h, origin.y + origin.h);
  if (right <= left || bottom <= top) return null;
  return { x: left - origin.x, y: top - origin.y, w: right - left, h: bottom - top };
}

export function imageClientFromSubjectBox(
  box: CropBox,
  img: HTMLImageElement | null,
): { left: number; top: number; width: number; height: number } | null {
  if (!img || !img.clientWidth || !img.clientHeight || !img.naturalWidth || !img.naturalHeight) {
    return null;
  }
  const sx = img.naturalWidth / img.clientWidth;
  const sy = img.naturalHeight / img.clientHeight;
  return {
    left: box.x / sx,
    top: box.y / sy,
    width: box.w / sx,
    height: box.h / sy,
  };
}

export function resizeHandleCenter(handle: ResizeHandle, box: CropBox): { x: number; y: number } {
  const x = handle.includes("w")
    ? box.x
    : handle.includes("e")
      ? box.x + box.w
      : box.x + box.w / 2;
  const y = handle.includes("n")
    ? box.y
    : handle.includes("s")
      ? box.y + box.h
      : box.y + box.h / 2;
  return { x, y };
}

export function radiusHandleCenter(
  handle: RadiusHandle,
  box: CropBox,
  zoom: number,
): { x: number; y: number } {
  const safeZoom = Math.max(MIN_TOOL_ZOOM, zoom);
  const maxOffset = Math.max(0, maxCropRadius(box) - 4);
  const inset = Math.min(maxOffset, Math.max(RADIUS_HANDLE_MIN_INSET / safeZoom, box.r ?? 0));
  const x = handle.includes("w") ? box.x + inset : box.x + box.w - inset;
  const y = handle.includes("n") ? box.y + inset : box.y + box.h - inset;
  return { x, y };
}

export function resizeCropBox(
  startBox: CropBox,
  handle: ResizeHandle,
  point: { x: number; y: number },
  bounds: CropBox,
): CropBox {
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.w;
  const maxY = bounds.y + bounds.h;
  let left = startBox.x;
  let top = startBox.y;
  let right = startBox.x + startBox.w;
  let bottom = startBox.y + startBox.h;

  if (handle.includes("w")) left = clamp(point.x, minX, right - SELECTION_MIN_SIZE);
  if (handle.includes("e")) right = clamp(point.x, left + SELECTION_MIN_SIZE, maxX);
  if (handle.includes("n")) top = clamp(point.y, minY, bottom - SELECTION_MIN_SIZE);
  if (handle.includes("s")) bottom = clamp(point.y, top + SELECTION_MIN_SIZE, maxY);

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
    r: Math.min(startBox.r ?? 0, (right - left) / 2, (bottom - top) / 2),
  };
}

export function moveCropBox(
  startBox: CropBox,
  startPoint: { x: number; y: number },
  point: { x: number; y: number },
  bounds: CropBox | null,
): CropBox {
  const dx = point.x - startPoint.x;
  const dy = point.y - startPoint.y;
  let nextX = startBox.x + dx;
  let nextY = startBox.y + dy;
  if (bounds) {
    nextX = clamp(nextX, bounds.x, bounds.x + bounds.w - startBox.w);
    nextY = clamp(nextY, bounds.y, bounds.y + bounds.h - startBox.h);
  }
  return { ...startBox, x: nextX, y: nextY };
}

// Inward 45° projection of `point` onto the rail the corner's radius handle slides
// along (equal offset on both axes). The projection is invariant to movement
// perpendicular to the rail, so perpendicular cursor drift never changes the radius.
function radiusCornerOffset(
  handle: RadiusHandle,
  point: { x: number; y: number },
  box: CropBox,
): number {
  const dx = handle.includes("w") ? point.x - box.x : box.x + box.w - point.x;
  const dy = handle.includes("n") ? point.y - box.y : box.y + box.h - point.y;
  return (dx + dy) / 2;
}

// The two corners that share the SHORT edge the grabbed handle lives on — the pair
// whose handles stack at the maximum radius. The grabbed handle may be either one;
// we resolve the full pair so the commit logic can pick between them.
function radiusEdgeHandles(handle: RadiusHandle, w: number, h: number): [RadiusHandle, RadiusHandle] {
  if (w >= h) {
    // wide (or square): short edges are vertical → pair across the height
    return handle === "nw" || handle === "sw" ? ["nw", "sw"] : ["ne", "se"];
  }
  // tall: short edges are horizontal → pair across the width
  return handle === "nw" || handle === "ne" ? ["nw", "ne"] : ["sw", "se"];
}

// How far (canvas units) the cursor must travel toward one corner of a stacked pair
// before the gesture commits to that corner. Measured as relative divergence between
// the pair's offsets, so it is immune to where exactly the grab landed on the ball.
const RADIUS_COMMIT_EPSILON = 0.5;

export function roundCropBox(
  interaction: {
    handle: RadiusHandle;
    startPoint: { x: number; y: number };
    startBox: CropBox;
    committedCorner?: RadiusHandle;
  },
  point: { x: number; y: number },
): CropBox {
  const box = interaction.startBox;
  const maxRadius = maxCropRadius(box);

  // When the grab starts at the maximum radius, the two handles on the short edge
  // sit one on top of the other and we cannot yet tell which corner the user means.
  // The FIRST drag that diverges toward one corner commits to it for the rest of the
  // gesture; afterwards only that corner drives the radius, so the ball can be brought
  // back to the lock (the clamped maximum) but cannot cross it into the other corner.
  const pair = radiusEdgeHandles(interaction.handle, box.w, box.h);
  const grabbedAtMax = (box.r ?? 0) >= maxRadius - RADIUS_COMMIT_EPSILON;
  const o0 = radiusCornerOffset(pair[0], point, box);
  const o1 = radiusCornerOffset(pair[1], point, box);

  if (!interaction.committedCorner) {
    if (!grabbedAtMax) {
      // Unstacked grab: the reported corner is unambiguous, lock to it immediately.
      interaction.committedCorner = interaction.handle;
    } else {
      const s0 = radiusCornerOffset(pair[0], interaction.startPoint, box);
      const s1 = radiusCornerOffset(pair[1], interaction.startPoint, box);
      const relDiff = o0 - o1 - (s0 - s1);
      if (Math.abs(relDiff) > RADIUS_COMMIT_EPSILON) {
        interaction.committedCorner = relDiff < 0 ? pair[0] : pair[1];
      }
    }
  }

  const offset = interaction.committedCorner
    ? radiusCornerOffset(interaction.committedCorner, point, box)
    : Math.min(o0, o1);
  return { ...box, r: clamp(offset, 0, maxRadius) };
}

export function resizeCursor(handle: ResizeHandle) {
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "n" || handle === "s") return "ns-resize";
  return "ew-resize";
}

export function cropBoxFromPoints(
  start: { x: number; y: number },
  point: { x: number; y: number },
): CropBox {
  return boxFromPoints(start, point);
}

export function boundsFromDrawingPath(points: Array<{ x: number; y: number }>): CropBox | null {
  return boundsOfPoints(points);
}

export function getContentPoint(
  event: { clientX: number; clientY: number },
  img: HTMLImageElement | null,
  toolZoom: number,
): { x: number; y: number } | null {
  if (!img) return null;
  const rect = img.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / toolZoom,
    y: (event.clientY - rect.top) / toolZoom,
  };
}

export function getImageContentBounds(img: HTMLImageElement | null): CropBox | null {
  if (!img || !img.clientWidth || !img.clientHeight) return null;
  return { x: 0, y: 0, w: img.clientWidth, h: img.clientHeight };
}

export function getVisibleContentBounds(
  stage: HTMLDivElement | null,
  img: HTMLImageElement | null,
  toolZoom: number,
): CropBox | null {
  if (!stage || !img) return null;
  const stageRect = stage.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();
  return {
    x: (stageRect.left - imgRect.left) / toolZoom,
    y: (stageRect.top - imgRect.top) / toolZoom,
    w: stageRect.width / toolZoom,
    h: stageRect.height / toolZoom,
  };
}
