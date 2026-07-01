// Pen tool (click-to-place anchors, drag for handles, click-first-anchor to close)
// and path edit mode (move anchors/handles, insert/delete anchors). These do not
// fit the rubber-band DrawInteraction model, so they live here and are wired into
// useCanvasPointerEvents alongside the other interaction branches.

import type React from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { roundPixel } from "@/canvas/engine/geometry";
import {
  appendAnchor,
  closeSubpath,
  createId,
  deleteAnchor,
  deleteElements,
  insertAnchorOnSegment,
  insertElement,
  makePathNode,
  recomputePathBounds,
  setHandleType,
  updateAnchor,
  updateHandle,
} from "@/canvas/engine/actions";
import { canvasDeltaToPathSpace, canvasToPathSpace, pathSpaceToCanvas } from "@/canvas/engine/vector/vectorGeometry";
import { simplifyToAnchors } from "@/canvas/engine/vector/simplify";
import type {
  AnchorEditInteraction,
  CanvasDocument,
  EditorState,
  Interaction,
  PencilInteraction,
  PenInteraction,
  Point,
  VectorAnchor,
} from "@/canvas/engine/types";
import type { EditorAction } from "@/canvas/engine/store";
import type { GlobalSettings } from "@/domain/settings/types";
import type { ToolingHit } from "./canvasHitTesting";

type Dispatch = React.Dispatch<EditorAction>;

const MOVE_THRESHOLD = 0.5;

export type VectorPointerCtx = {
  state: EditorState;
  dispatch: Dispatch;
  settings: GlobalSettings;
  interactionRef: React.MutableRefObject<Interaction | null>;
  setInteractionActive: (active: boolean) => void;
  latestDocumentRef: React.MutableRefObject<CanvasDocument>;
  viewport: HTMLDivElement;
};

// ─── Pen tool ─────────────────────────────────────────────────────────────────

/** Handle a pen-tool pointer down. Returns true when it consumed the event. */
export function penPointerDown(
  ctx: VectorPointerCtx,
  event: ReactPointerEvent,
  point: Point,
  hit: ToolingHit,
): boolean {
  const { state, dispatch, settings, interactionRef, setInteractionActive, viewport } = ctx;
  const doc = state.document;
  const editingId = state.pathEditId && doc.elements[state.pathEditId]?.type === "path" ? state.pathEditId : null;

  if (editingId) {
    const node = doc.elements[editingId];
    if (!node.path) return false;
    const activeSubpath = node.path.subpaths.length - 1;
    const sub = node.path.subpaths[activeSubpath];

    // Click on the active subpath's first anchor → close + finish the path.
    if (
      hit.type === "path-anchor" &&
      hit.subpathIndex === activeSubpath &&
      hit.anchorIndex === 0 &&
      sub &&
      !sub.closed &&
      sub.anchors.length >= 2
    ) {
      let next = closeSubpath(doc, editingId, activeSubpath);
      next = recomputePathBounds(next, editingId);
      dispatch({ type: "commitDocument", beforeDocument: doc, document: next, selectedIds: [editingId] });
      dispatch({ type: "setTool", tool: "select" });
      event.preventDefault();
      return true;
    }

    // Otherwise append a new corner anchor to the active subpath.
    const pt = canvasToPathSpace(node, point.x, point.y);
    const anchorIndex = sub ? sub.anchors.length : 0;
    const withAnchor = appendAnchor(doc, editingId, activeSubpath, { x: pt.x, y: pt.y, handleType: "corner" });
    interactionRef.current = {
      type: "pen",
      pointerId: event.pointerId,
      startPoint: point,
      elementId: editingId,
      subpathIndex: activeSubpath,
      draggingHandleOfAnchor: anchorIndex,
      beforeDocument: doc,
      lastDocument: withAnchor,
      moved: false,
    };
    setInteractionActive(true);
    dispatch({ type: "setDocumentTransient", document: withAnchor, changedIds: [editingId] });
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
    return true;
  }

  // No active path → start a new one with its first anchor at the click.
  const configured = settings.canvas.elementDefaults.tools.pen;
  const id = createId("path");
  const node = makePathNode(
    id,
    roundPixel(point.x),
    roundPixel(point.y),
    { ...configured.styles },
    configured.name,
  );
  node.path!.subpaths[0].anchors.push({ x: 0, y: 0, handleType: "corner" });
  const withNode = insertElement(doc, node);
  interactionRef.current = {
    type: "pen",
    pointerId: event.pointerId,
    startPoint: point,
    elementId: id,
    subpathIndex: 0,
    draggingHandleOfAnchor: 0,
    beforeDocument: doc,
    lastDocument: withNode,
    moved: false,
  };
  setInteractionActive(true);
  dispatch({ type: "setDocumentTransient", document: withNode, changedIds: [id] });
  viewport.setPointerCapture(event.pointerId);
  event.preventDefault();
  return true;
}

export function penPointerMove(
  interaction: PenInteraction,
  point: Point,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
): void {
  const dx = point.x - interaction.startPoint.x;
  const dy = point.y - interaction.startPoint.y;
  if (Math.hypot(dx, dy) <= MOVE_THRESHOLD) return;
  interaction.moved = true;
  const node = interaction.lastDocument.elements[interaction.elementId];
  if (!node) return;
  const rel = canvasDeltaToPathSpace(node, dx, dy);
  // Symmetric (mirrored) handles while dragging out of a freshly-placed anchor.
  const next = updateAnchor(interaction.lastDocument, interaction.elementId, interaction.subpathIndex, interaction.draggingHandleOfAnchor, {
    outX: rel.x,
    outY: rel.y,
    inX: -rel.x,
    inY: -rel.y,
    handleType: "mirrored",
  });
  interaction.lastDocument = next;
  latestDocumentRef.current = next;
  dispatch({ type: "setDocumentTransient", document: next, changedIds: [interaction.elementId] });
}

export function finishPen(interaction: PenInteraction, dispatch: Dispatch): void {
  const next = recomputePathBounds(interaction.lastDocument, interaction.elementId);
  dispatch({ type: "commitDocument", beforeDocument: interaction.beforeDocument, document: next, selectedIds: [interaction.elementId] });
  // Stay in edit mode so the next click continues the same path.
  dispatch({ type: "enterPathEdit", pathEditId: interaction.elementId });
}

// ─── Pencil tool ──────────────────────────────────────────────────────────────

export function pencilPointerDown(ctx: VectorPointerCtx, event: ReactPointerEvent, point: Point): boolean {
  const { state, dispatch, settings, interactionRef, setInteractionActive, viewport } = ctx;
  const doc = state.document;
  const configured = settings.canvas.elementDefaults.tools.pencil;
  const id = createId("path");
  const node = makePathNode(id, roundPixel(point.x), roundPixel(point.y), { ...configured.styles }, configured.name);
  node.path!.subpaths[0].anchors.push({ x: 0, y: 0, handleType: "corner" });
  const withNode = insertElement(doc, node);
  interactionRef.current = {
    type: "pencil",
    pointerId: event.pointerId,
    startPoint: point,
    elementId: id,
    points: [point],
    beforeDocument: doc,
    lastDocument: withNode,
    moved: false,
  };
  setInteractionActive(true);
  dispatch({ type: "setDocumentTransient", document: withNode, changedIds: [id] });
  viewport.setPointerCapture(event.pointerId);
  event.preventDefault();
  return true;
}

export function pencilMove(
  interaction: PencilInteraction,
  point: Point,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
): void {
  const last = interaction.points[interaction.points.length - 1];
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1) return;
  interaction.moved = true;
  interaction.points.push(point);
  // Live polyline feedback: raw points as corner anchors, in path space.
  const node = interaction.lastDocument.elements[interaction.elementId];
  if (!node) return;
  const anchors = interaction.points.map((p) => {
    const sp = canvasToPathSpace(node, p.x, p.y);
    return { x: sp.x, y: sp.y, handleType: "corner" as const };
  });
  const next = updateSubpathAnchors(interaction.lastDocument, interaction.elementId, anchors);
  interaction.lastDocument = next;
  latestDocumentRef.current = next;
  dispatch({ type: "setDocumentTransient", document: next, changedIds: [interaction.elementId] });
}

export function finishPencil(interaction: PencilInteraction, dispatch: Dispatch): void {
  const node = interaction.lastDocument.elements[interaction.elementId];
  if (!node) return;
  const ptsPath = interaction.points.map((p) => canvasToPathSpace(node, p.x, p.y));
  const anchors = simplifyToAnchors(ptsPath, 2);
  let next = updateSubpathAnchors(interaction.lastDocument, interaction.elementId, anchors);
  next = recomputePathBounds(next, interaction.elementId);
  dispatch({ type: "commitDocument", beforeDocument: interaction.beforeDocument, document: next, selectedIds: [interaction.elementId] });
  dispatch({ type: "setTool", tool: "select" });
}

// Replace the first subpath's anchors wholesale (used by the live pencil stroke).
function updateSubpathAnchors(doc: CanvasDocument, id: string, anchors: VectorAnchor[]): CanvasDocument {
  const node = doc.elements[id];
  if (!node || node.type !== "path" || !node.path) return doc;
  const next: CanvasDocument = { ...doc, elements: { ...doc.elements } };
  const clone = {
    ...node,
    path: { ...node.path, subpaths: node.path.subpaths.map((s, i) => (i === 0 ? { ...s, anchors } : s)) },
  };
  next.elements[id] = clone;
  return next;
}

// ─── Path edit mode ─────────────────────────────────────────────────────────────

/** Pointer down while a path is in edit mode (select tool). Returns true if consumed. */
export function anchorEditPointerDown(
  ctx: VectorPointerCtx,
  event: ReactPointerEvent,
  point: Point,
  hit: ToolingHit,
): boolean {
  const { state, dispatch, interactionRef, setInteractionActive, viewport } = ctx;
  const id = state.pathEditId;
  if (!id || !state.document.elements[id]) return false;
  const doc = state.document;

  if (hit.type === "path-anchor") {
    // Alt-click removes the anchor.
    if (event.altKey) {
      let next = deleteAnchor(doc, id, hit.subpathIndex, hit.anchorIndex);
      const remaining = next.elements[id];
      const isEmpty =
        !remaining?.path || !remaining.path.subpaths.some((s) => s.anchors.length > 0);
      if (isEmpty) {
        // Removing the final anchor leaves an empty path node. Drop it and leave edit
        // mode instead of stranding an invisible, uneditable node. B12.
        const cleaned = deleteElements(next, [id]);
        dispatch({ type: "commitDocument", beforeDocument: doc, document: cleaned, selectedIds: [] });
        dispatch({ type: "exitPathEdit" });
        event.preventDefault();
        return true;
      }
      next = recomputePathBounds(next, id);
      dispatch({ type: "commitDocument", beforeDocument: doc, document: next, selectedIds: [id] });
      event.preventDefault();
      return true;
    }
    startAnchorEdit(ctx, event, point, id, hit.subpathIndex, hit.anchorIndex, "anchor");
    return true;
  }

  if (hit.type === "path-handle") {
    startAnchorEdit(ctx, event, point, id, hit.subpathIndex, hit.anchorIndex, hit.which);
    return true;
  }

  if (hit.type === "path-segment") {
    // Single click on a segment does nothing (double-click inserts). Swallow so the
    // path is not deselected by the normal selection path.
    event.preventDefault();
    return true;
  }

  if (hit.type === "path-empty") {
    // Clicked inside edit mode but missed every affordance → leave edit mode and
    // let the normal selection logic run.
    dispatch({ type: "exitPathEdit" });
    return false;
  }

  void viewport;
  void interactionRef;
  void setInteractionActive;
  return false;
}

function startAnchorEdit(
  ctx: VectorPointerCtx,
  event: ReactPointerEvent,
  point: Point,
  elementId: string,
  subpathIndex: number,
  anchorIndex: number,
  target: "anchor" | "in" | "out",
): void {
  const { state, interactionRef, setInteractionActive, viewport } = ctx;
  const interaction: AnchorEditInteraction = {
    type: "anchor-edit",
    pointerId: event.pointerId,
    startPoint: point,
    elementId,
    subpathIndex,
    anchorIndex,
    target,
    beforeDocument: state.document,
    lastDocument: state.document,
    moved: false,
  };
  interactionRef.current = interaction;
  setInteractionActive(true);
  viewport.setPointerCapture(event.pointerId);
  event.preventDefault();
}

export function anchorEditMove(
  interaction: AnchorEditInteraction,
  point: Point,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
): void {
  const node0 = interaction.beforeDocument.elements[interaction.elementId];
  const anchor0 = node0?.path?.subpaths[interaction.subpathIndex]?.anchors[interaction.anchorIndex];
  if (!node0 || !anchor0) return;
  const dx = point.x - interaction.startPoint.x;
  const dy = point.y - interaction.startPoint.y;
  if (Math.hypot(dx, dy) > MOVE_THRESHOLD) interaction.moved = true;

  let next: CanvasDocument;
  if (interaction.target === "anchor") {
    const rel = canvasDeltaToPathSpace(node0, dx, dy);
    next = updateAnchor(interaction.beforeDocument, interaction.elementId, interaction.subpathIndex, interaction.anchorIndex, {
      x: anchor0.x + rel.x,
      y: anchor0.y + rel.y,
    });
  } else {
    const anchorCanvas = pathSpaceToCanvas(node0, anchor0.x, anchor0.y);
    const rel = canvasDeltaToPathSpace(node0, point.x - anchorCanvas.px, point.y - anchorCanvas.py);
    next = updateHandle(interaction.beforeDocument, interaction.elementId, interaction.subpathIndex, interaction.anchorIndex, interaction.target, rel.x, rel.y);
  }
  interaction.lastDocument = next;
  latestDocumentRef.current = next;
  dispatch({ type: "setDocumentTransient", document: next, changedIds: [interaction.elementId] });
}

export function finishAnchorEdit(interaction: AnchorEditInteraction, dispatch: Dispatch): void {
  if (!interaction.moved) return;
  const next = recomputePathBounds(interaction.lastDocument, interaction.elementId);
  dispatch({ type: "commitDocument", beforeDocument: interaction.beforeDocument, document: next, selectedIds: [interaction.elementId] });
  dispatch({ type: "enterPathEdit", pathEditId: interaction.elementId });
}

// ─── Double-click ────────────────────────────────────────────────────────────────

/**
 * Double-click behavior for vectors. Returns true if consumed:
 *  - in edit mode + on a segment → insert an anchor;
 *  - in edit mode + on an anchor → toggle corner ↔ smooth;
 *  - not editing + a single path selected → enter edit mode.
 */
export function pathDoubleClick(
  ctx: VectorPointerCtx,
  _event: ReactMouseEvent,
  hit: ToolingHit,
): boolean {
  const { state, dispatch } = ctx;
  const doc = state.document;

  if (state.pathEditId && doc.elements[state.pathEditId]?.type === "path") {
    const id = state.pathEditId;
    if (hit.type === "path-segment") {
      const next = insertAnchorOnSegment(doc, id, hit.subpathIndex, hit.segIndex, hit.t);
      dispatch({ type: "commitDocument", beforeDocument: doc, document: next, selectedIds: [id] });
      return true;
    }
    if (hit.type === "path-anchor") {
      const a = doc.elements[id].path?.subpaths[hit.subpathIndex]?.anchors[hit.anchorIndex];
      const nextType = a?.handleType === "corner" ? "mirrored" : "corner";
      const next = setHandleType(doc, id, hit.subpathIndex, hit.anchorIndex, nextType);
      dispatch({ type: "commitDocument", beforeDocument: doc, document: next, selectedIds: [id] });
      return true;
    }
    return true; // swallow other double-clicks while editing
  }

  // Enter edit mode (path) / isolation (sealed svg) when a single one is selected.
  if (state.selectedIds.length === 1) {
    const node = doc.elements[state.selectedIds[0]];
    if (node?.type === "path") {
      dispatch({ type: "enterPathEdit", pathEditId: node.id });
      return true;
    }
    if (node?.type === "svg" && node.children.length > 0) {
      // Editing an SVG's vectors happens only inside its isolation (Versioning §8.1).
      dispatch({ type: "setIsolatedParent", isolatedParentId: node.id });
      return true;
    }
  }
  return false;
}
