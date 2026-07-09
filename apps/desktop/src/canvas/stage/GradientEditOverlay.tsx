import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import type { CanvasDocument, EditorState } from "@/canvas/engine/types";
import type { GradientFill } from "@/domain/canvas/fill";
import type { ViewportTransform } from "@/canvas/engine/viewport";
import { getAbsoluteCenter, getEffectiveRotation } from "@/canvas/engine/geometry";
import { mutateElementWithStyles, shallowCloneDocument } from "@/canvas/engine/mutations/coreUtils";
import { canvasToViewport } from "./canvasToolingRenderer";

// On-canvas gradient editing (G11). A DOM overlay (same placement model as
// TextEditingOverlay): positioned on the element's visual center, rotated by
// its effective rotation, drawing the gradient axis + draggable stop balls.
// - drag a stop ball        → move that stop along the axis (0..1)
// - drag an axis endpoint   → re-angle the gradient (linear/conic)
// - double-click the axis   → insert a stop at that position
// Drags are transient frames committed once on release; the panel stays live
// because both read the same document.

type Dispatch = (action: Record<string, unknown> & { type: string }) => void;

const STOP_SIZE = 12;
const END_SIZE = 10;

function withGradientPatch(
  document: CanvasDocument,
  elementId: string,
  fillIndex: number,
  patch: Partial<GradientFill>,
): CanvasDocument {
  const next = shallowCloneDocument(document);
  const node = mutateElementWithStyles(next, elementId);
  const fills = node?.styles.fills;
  if (!node || !fills || fills[fillIndex]?.type !== "gradient") return document;
  const nextFills = fills.slice();
  nextFills[fillIndex] = { ...(fills[fillIndex] as GradientFill), ...patch };
  node.styles.fills = nextFills;
  return next;
}

export function GradientEditOverlay({
  state,
  viewportTransform,
  dispatch,
}: {
  state: EditorState;
  viewportTransform: ViewportTransform;
  dispatch: Dispatch;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    kind: "stop" | "end";
    index: number;
    pointerId: number;
    beforeDocument: CanvasDocument;
    lastDocument: CanvasDocument;
  } | null>(null);

  const target = state.activeGradientEdit;
  const document = state.document;
  const node = target ? document.elements[target.elementId] : null;
  const fill = node?.styles.fills?.[target?.fillIndex ?? -1];
  const active =
    target &&
    node &&
    node.visible !== false &&
    fill?.type === "gradient" &&
    state.selectedIds.length === 1 &&
    state.selectedIds[0] === target.elementId &&
    !state.editingTextId
      ? (fill as GradientFill)
      : null;
  if (!target || !node || !active) return null;

  const center = getAbsoluteCenter(document, target.elementId);
  if (!center) return null;
  const zoom = viewportTransform.displayZoom;
  const viewportCenter = canvasToViewport(center.x, center.y, viewportTransform);
  const rotation = getEffectiveRotation(document, target.elementId) + viewportTransform.canvasRotation;
  const width = Math.max(node.width, 1) * zoom;
  const height = Math.max(node.height, 1) * zoom;

  // Gradient axis in overlay-local px. CSS angle: 0deg = to top, 90deg = to
  // right; direction d = (sin θ, -cos θ). Linear gradient line length is the
  // box's projection onto d; radial has no angle — use a horizontal radius so
  // the stops stay editable.
  const theta = ((active.kind === "radial" ? 90 : active.angle) * Math.PI) / 180;
  const dir = { x: Math.sin(theta), y: -Math.cos(theta) };
  const length =
    active.kind === "radial"
      ? Math.min(width, height) / 2
      : Math.abs(width * dir.x) + Math.abs(height * dir.y);
  const mid = { x: width / 2, y: height / 2 };
  const start =
    active.kind === "radial"
      ? mid
      : { x: mid.x - (dir.x * length) / 2, y: mid.y - (dir.y * length) / 2 };
  const end = { x: start.x + dir.x * length, y: start.y + dir.y * length };

  // Map a client-space pointer into overlay-local px (undo the rotation about
  // the overlay center — getBoundingClientRect's center IS the transform
  // origin, so this stays exact for any rotation).
  const clientToLocal = (clientX: number, clientY: number) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rad = (-rotation * Math.PI) / 180;
    const dx = clientX - cx;
    const dy = clientY - cy;
    return {
      x: dx * Math.cos(rad) - dy * Math.sin(rad) + width / 2,
      y: dx * Math.sin(rad) + dy * Math.cos(rad) + height / 2,
    };
  };

  const positionOnAxis = (clientX: number, clientY: number): number | null => {
    const local = clientToLocal(clientX, clientY);
    if (!local || length <= 0) return null;
    const t = ((local.x - start.x) * dir.x + (local.y - start.y) * dir.y) / length;
    return Math.min(1, Math.max(0, t));
  };

  const beginDrag = (event: ReactPointerEvent, kind: "stop" | "end", index: number) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      kind,
      index,
      pointerId: event.pointerId,
      beforeDocument: document,
      lastDocument: document,
    };
  };

  const moveDrag = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    let patch: Partial<GradientFill> | null = null;
    if (drag.kind === "stop") {
      const t = positionOnAxis(event.clientX, event.clientY);
      if (t === null) return;
      const before = drag.beforeDocument.elements[target.elementId]?.styles.fills?.[
        target.fillIndex
      ] as GradientFill | undefined;
      if (!before) return;
      patch = {
        stops: before.stops.map((stop, i) =>
          i === drag.index ? { ...stop, position: Math.round(t * 100) / 100 } : stop,
        ),
      };
    } else {
      // Endpoint drag re-angles around the box center. CSS angle from a local
      // direction (dx, dy): θ = atan2(dx, -dy). The start handle points the
      // opposite way.
      const local = clientToLocal(event.clientX, event.clientY);
      if (!local) return;
      const dx = local.x - mid.x;
      const dy = local.y - mid.y;
      if (Math.hypot(dx, dy) < 2) return;
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (drag.index === 0) angle += 180;
      if (event.shiftKey) angle = Math.round(angle / 15) * 15;
      patch = { angle: Math.round(((angle % 360) + 360) % 360) };
    }
    if (!patch) return;
    const nextDocument = withGradientPatch(drag.beforeDocument, target.elementId, target.fillIndex, patch);
    drag.lastDocument = nextDocument;
    dispatch({ type: "setDocumentTransient", document: nextDocument, changedIds: [target.elementId] });
  };

  const endDrag = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.lastDocument !== drag.beforeDocument) {
      dispatch({
        type: "commitDocument",
        beforeDocument: drag.beforeDocument,
        document: drag.lastDocument,
        selectedIds: state.selectedIds,
      });
    }
  };

  const addStopAt = (event: ReactMouseEvent) => {
    const t = positionOnAxis(event.clientX, event.clientY);
    if (t === null) return;
    event.preventDefault();
    event.stopPropagation();
    const sorted = [...active.stops].sort((a, b) => a.position - b.position);
    const nearest = sorted.reduce(
      (best, stop) => (Math.abs(stop.position - t) < Math.abs(best.position - t) ? stop : best),
      sorted[0],
    );
    const stops = [...active.stops, { color: nearest?.color ?? "#FFFFFF", position: Math.round(t * 100) / 100 }];
    dispatch({
      type: "commitDocument",
      document: withGradientPatch(document, target.elementId, target.fillIndex, { stops }),
      selectedIds: state.selectedIds,
    });
  };

  const stopBalls = active.stops.map((stop, index) => {
    const point = {
      x: start.x + dir.x * length * Math.min(1, Math.max(0, stop.position)),
      y: start.y + dir.y * length * Math.min(1, Math.max(0, stop.position)),
    };
    return { stop, index, point };
  });

  const handleBase: React.CSSProperties = {
    position: "absolute",
    borderRadius: "50%",
    pointerEvents: "auto",
    cursor: "grab",
    boxShadow: "0 0 0 1.5px #FFFFFF, 0 1px 4px rgba(0,0,0,0.45)",
  };

  return (
    <div
      ref={overlayRef}
      style={{
        position: "absolute",
        left: viewportCenter.x - width / 2,
        top: viewportCenter.y - height / 2,
        width,
        height,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: `${width / 2}px ${height / 2}px`,
        pointerEvents: "none",
        zIndex: 9,
      }}
    >
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {/* Wide invisible hit line first so double-click-to-add works anywhere on the axis. */}
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="transparent"
          strokeWidth={14}
          style={{ pointerEvents: "stroke", cursor: "copy" }}
          onDoubleClick={addStopAt}
        />
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#FFFFFF" strokeWidth={3} opacity={0.9} />
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#0D99FF" strokeWidth={1.5} />
      </svg>
      {active.kind !== "radial"
        ? [start, end].map((point, index) => (
            <div
              key={`end-${index}`}
              title="Drag to rotate the gradient"
              style={{
                ...handleBase,
                left: point.x - END_SIZE / 2,
                top: point.y - END_SIZE / 2,
                width: END_SIZE,
                height: END_SIZE,
                background: "#0D99FF",
              }}
              onPointerDown={(event) => beginDrag(event, "end", index)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          ))
        : null}
      {stopBalls.map(({ stop, index, point }) => (
        <div
          key={`stop-${index}`}
          title={`${Math.round(stop.position * 100)}%`}
          style={{
            ...handleBase,
            left: point.x - STOP_SIZE / 2,
            top: point.y - STOP_SIZE / 2,
            width: STOP_SIZE,
            height: STOP_SIZE,
            background: stop.color,
          }}
          onPointerDown={(event) => beginDrag(event, "stop", index)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ))}
    </div>
  );
}
