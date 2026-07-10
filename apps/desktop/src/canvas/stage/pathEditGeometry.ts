// Builds the viewport-space anchor/handle/segment geometry for a path in edit
// mode — consumed by both the overlay renderer and the hit-tester. Pure.

import type { CanvasDocument, ElementNode, Point } from "@/canvas/engine/types";
import type { ViewportTransform } from "@/canvas/engine/viewport";
import { canvasToViewport } from "./canvasToolingRenderer";
import { pathSpaceToCanvas } from "@/canvas/engine/vector/vectorGeometry";
import { sampleSegment } from "@/canvas/engine/vector/pathData";
import type { PathEditAnchorGeom, PathEditGeometry, PathEditSegmentGeom } from "./canvasHitTesting";

// Adaptive segment tessellation: sample roughly one point per this many on-screen
// px, so a long curve at high zoom stays smooth and a short one stays cheap (F5).
const SEGMENT_PX_PER_SAMPLE = 8;
const MIN_SEGMENT_SAMPLES = 6;
const MAX_SEGMENT_SAMPLES = 96;

function viewportDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function computePathEditGeometry(
  document: CanvasDocument,
  node: ElementNode,
  t: ViewportTransform,
  penToolActive: boolean,
  selectedAnchors?: ReadonlySet<string>,
): PathEditGeometry | null {
  if (node.type !== "path" || !node.path) return null;
  // Path space → canvas → viewport. pathSpaceToCanvas already applies the element's
  // full transform (ancestor offset/rotation + own rotation), so no extra rotate
  // here — that would double-count and misplace anchors on nested paths (M1/M2).
  const toView = (x: number, y: number): Point => {
    const c = pathSpaceToCanvas(document, node, x, y);
    return canvasToViewport(c.px, c.py, t);
  };

  const anchors: PathEditAnchorGeom[] = [];
  const segments: PathEditSegmentGeom[] = [];
  let closeTarget: Point | null = null;

  // While drawing with the pen, the anchor just placed (the last one of the active,
  // still-open subpath) is the "active" vertex — highlight it so it doesn't look
  // identical to every other anchor. B15.
  const activeSubpathIndex = node.path.subpaths.length - 1;
  const activeSubpath = node.path.subpaths[activeSubpathIndex];
  const activeAnchorIndex =
    penToolActive && activeSubpath && !activeSubpath.closed ? activeSubpath.anchors.length - 1 : -1;

  node.path.subpaths.forEach((sub, subpathIndex) => {
    sub.anchors.forEach((a, anchorIndex) => {
      anchors.push({
        subpathIndex,
        anchorIndex,
        point: toView(a.x, a.y),
        inHandle: a.inX !== undefined || a.inY !== undefined ? toView(a.x + (a.inX ?? 0), a.y + (a.inY ?? 0)) : null,
        outHandle: a.outX !== undefined || a.outY !== undefined ? toView(a.x + (a.outX ?? 0), a.y + (a.outY ?? 0)) : null,
        selected:
          (subpathIndex === activeSubpathIndex && anchorIndex === activeAnchorIndex) ||
          (selectedAnchors?.has(`${subpathIndex}:${anchorIndex}`) ?? false),
      });
    });

    const segCount = sub.closed ? sub.anchors.length : sub.anchors.length - 1;
    for (let i = 0; i < segCount; i++) {
      const from = sub.anchors[i];
      const to = sub.anchors[(i + 1) % sub.anchors.length];
      if (!from || !to) continue;
      // Estimate the on-screen length from the control polygon (an upper bound on
      // the curve length) and scale the sample count to it.
      const vp0 = toView(from.x, from.y);
      const vc0 = toView(from.x + (from.outX ?? 0), from.y + (from.outY ?? 0));
      const vc1 = toView(to.x + (to.inX ?? 0), to.y + (to.inY ?? 0));
      const vp1 = toView(to.x, to.y);
      const estLength = viewportDistance(vp0, vc0) + viewportDistance(vc0, vc1) + viewportDistance(vc1, vp1);
      const sampleCount = Math.max(
        MIN_SEGMENT_SAMPLES,
        Math.min(MAX_SEGMENT_SAMPLES, Math.ceil(estLength / SEGMENT_PX_PER_SAMPLE)),
      );
      const samples: Point[] = [];
      for (let s = 0; s <= sampleCount; s++) {
        const p = sampleSegment(from, to, s / sampleCount);
        samples.push(toView(p.x, p.y));
      }
      segments.push({ subpathIndex, segIndex: i, samples });
    }
  });

  // The pen can close the active (last) open subpath once it has ≥2 anchors.
  if (penToolActive) {
    const lastIndex = node.path.subpaths.length - 1;
    const last = node.path.subpaths[lastIndex];
    if (last && !last.closed && last.anchors.length >= 2) {
      const first = last.anchors[0];
      closeTarget = toView(first.x, first.y);
    }
  }

  return { anchors, segments, closeTarget, penActive: penToolActive };
}
