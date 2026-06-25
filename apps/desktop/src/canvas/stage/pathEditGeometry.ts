// Builds the viewport-space anchor/handle/segment geometry for a path in edit
// mode — consumed by both the overlay renderer and the hit-tester. Pure.

import type { ElementNode, Point } from "@/canvas/engine/types";
import type { ViewportTransform } from "@/canvas/engine/viewport";
import { canvasToViewport } from "./canvasToolingRenderer";
import { pathSpaceToCanvas } from "@/canvas/engine/vector/vectorGeometry";
import { sampleSegment } from "@/canvas/engine/vector/pathData";
import type { PathEditAnchorGeom, PathEditGeometry, PathEditSegmentGeom } from "./canvasHitTesting";

const SEGMENT_SAMPLES = 12;

function rotate(px: number, py: number, cx: number, cy: number, deg: number): { x: number; y: number } {
  if (!deg) return { x: px, y: py };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function computePathEditGeometry(
  node: ElementNode,
  t: ViewportTransform,
  penToolActive: boolean,
): PathEditGeometry | null {
  if (node.type !== "path" || !node.path) return null;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  // Path space → canvas (with element rotation) → viewport.
  const toView = (x: number, y: number): Point => {
    const c = pathSpaceToCanvas(node, x, y);
    const r = rotate(c.px, c.py, cx, cy, node.rotation);
    return canvasToViewport(r.x, r.y, t);
  };

  const anchors: PathEditAnchorGeom[] = [];
  const segments: PathEditSegmentGeom[] = [];
  let closeTarget: Point | null = null;

  node.path.subpaths.forEach((sub, subpathIndex) => {
    sub.anchors.forEach((a, anchorIndex) => {
      anchors.push({
        subpathIndex,
        anchorIndex,
        point: toView(a.x, a.y),
        inHandle: a.inX !== undefined || a.inY !== undefined ? toView(a.x + (a.inX ?? 0), a.y + (a.inY ?? 0)) : null,
        outHandle: a.outX !== undefined || a.outY !== undefined ? toView(a.x + (a.outX ?? 0), a.y + (a.outY ?? 0)) : null,
        selected: false,
      });
    });

    const segCount = sub.closed ? sub.anchors.length : sub.anchors.length - 1;
    for (let i = 0; i < segCount; i++) {
      const from = sub.anchors[i];
      const to = sub.anchors[(i + 1) % sub.anchors.length];
      if (!from || !to) continue;
      const samples: Point[] = [];
      for (let s = 0; s <= SEGMENT_SAMPLES; s++) {
        const p = sampleSegment(from, to, s / SEGMENT_SAMPLES);
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

  return { anchors, segments, closeTarget };
}
