import type { CanvasDocument, Rect, SnapCandidate, SnapCandidateSet, SnapGuide } from "./types";
import {
  getAbsoluteRect,
  getDescendantIds,
  getElementAABB,
  rectBottom,
  rectCenterX,
  rectCenterY,
  rectRight
} from "./geometry";

const SNAP_DISTANCE = 6;

type Candidate = SnapCandidate;

function buildIgnoreSet(document: CanvasDocument, ids: string[]): Set<string> {
  const ignore = new Set(ids);
  for (const id of ids) {
    for (const descendantId of getDescendantIds(document, id)) {
      ignore.add(descendantId);
    }
  }
  return ignore;
}

function findBestSnap(
  moving: Array<{ value: number; kind: "start" | "center" | "end" }>,
  candidates: Candidate[]
): { delta: number; guide: Candidate } | null {
  let best: { distance: number; delta: number; guide: Candidate } | null = null;

  for (const point of moving) {
    for (const candidate of candidates) {
      const delta = candidate.value - point.value;
      const distance = Math.abs(delta);
      if (distance <= SNAP_DISTANCE && (!best || distance < best.distance)) {
        best = {
          distance,
          delta,
          guide: candidate
        };
      }
    }
  }

  return best ? { delta: best.delta, guide: best.guide } : null;
}

/**
 * Builds the snap target set (window/parent bounds + sibling edges/centers) for a
 * drag. These targets depend only on the *static* part of the interaction —
 * `document`, the ignored (moving) ids, the bounds, and the parent — so for a
 * continuous drag this can be computed once and reused across frames via
 * {@link snapRectWithCandidates}, instead of rebuilt every ~60Hz move.
 */
export function buildSnapCandidates(
  document: CanvasDocument,
  ignoreIds: string[],
  bounds: Rect,
  parentId: string | null | undefined
): SnapCandidateSet {
  const ignore = buildIgnoreSet(document, ignoreIds);
  const vertical: Candidate[] = [
    { value: bounds.x, from: bounds.y, to: rectBottom(bounds) },
    { value: rectCenterX(bounds), from: bounds.y, to: rectBottom(bounds) },
    { value: rectRight(bounds), from: bounds.y, to: rectBottom(bounds) }
  ];
  const horizontal: Candidate[] = [
    { value: bounds.y, from: bounds.x, to: rectRight(bounds) },
    { value: rectCenterY(bounds), from: bounds.x, to: rectRight(bounds) },
    { value: rectBottom(bounds), from: bounds.x, to: rectRight(bounds) }
  ];

  const allNodes = Object.values(document.elements);
  const candidateNodes: typeof allNodes =
    typeof parentId === "string"
      ? (document.elements[parentId]?.children ?? []).flatMap((id) => {
          const n = document.elements[id];
          return n ? [n] : [];
        })
      : parentId === null
        ? allNodes.filter((n) => n.parentId === null)
        : allNodes;

  for (const node of candidateNodes) {
    if (ignore.has(node.id) || node.visible === false) {
      continue;
    }
    const candidateRect = getElementAABB(document, node.id) ?? getAbsoluteRect(document, node.id);
    if (!candidateRect) {
      continue;
    }
    vertical.push(
      { value: candidateRect.x, from: candidateRect.y, to: rectBottom(candidateRect) },
      { value: rectCenterX(candidateRect), from: candidateRect.y, to: rectBottom(candidateRect) },
      { value: rectRight(candidateRect), from: candidateRect.y, to: rectBottom(candidateRect) }
    );
    horizontal.push(
      { value: candidateRect.y, from: candidateRect.x, to: rectRight(candidateRect) },
      { value: rectCenterY(candidateRect), from: candidateRect.x, to: rectRight(candidateRect) },
      { value: rectBottom(candidateRect), from: candidateRect.x, to: rectRight(candidateRect) }
    );
  }

  return { vertical, horizontal };
}

export function snapRect(
  rect: Rect,
  document: CanvasDocument,
  ignoreIds: string[],
  bounds: Rect,
  parentId: string | null | undefined
): { rect: Rect; guides: SnapGuide[] } {
  return snapRectWithCandidates(
    rect,
    buildSnapCandidates(document, ignoreIds, bounds, parentId),
    bounds
  );
}

export function snapRectWithCandidates(
  rect: Rect,
  candidates: SnapCandidateSet,
  bounds: Rect
): { rect: Rect; guides: SnapGuide[] } {
  const verticalCandidates = candidates.vertical;
  const horizontalCandidates = candidates.horizontal;

  const verticalSnap = findBestSnap(
    [
      { value: rect.x, kind: "start" },
      { value: rectCenterX(rect), kind: "center" },
      { value: rectRight(rect), kind: "end" }
    ],
    verticalCandidates
  );
  const horizontalSnap = findBestSnap(
    [
      { value: rect.y, kind: "start" },
      { value: rectCenterY(rect), kind: "center" },
      { value: rectBottom(rect), kind: "end" }
    ],
    horizontalCandidates
  );

  const snapped = {
    ...rect,
    x: rect.x + (verticalSnap?.delta ?? 0),
    y: rect.y + (horizontalSnap?.delta ?? 0)
  };

  const guides: SnapGuide[] = [];
  if (verticalSnap) {
    guides.push({
      id: `v-${verticalSnap.guide.value}`,
      orientation: "vertical",
      position: verticalSnap.guide.value,
      from: Math.min(bounds.y, verticalSnap.guide.from, rect.y),
      to: Math.max(rectBottom(bounds), verticalSnap.guide.to, rectBottom(snapped))
    });
  }
  if (horizontalSnap) {
    guides.push({
      id: `h-${horizontalSnap.guide.value}`,
      orientation: "horizontal",
      position: horizontalSnap.guide.value,
      from: Math.min(bounds.x, horizontalSnap.guide.from, rect.x),
      to: Math.max(rectRight(bounds), horizontalSnap.guide.to, rectRight(snapped))
    });
  }

  return {
    rect: snapped,
    guides
  };
}
