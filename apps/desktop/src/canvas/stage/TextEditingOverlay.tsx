import type { CanvasDocument } from "@/canvas/engine/types";
import type { ViewportTransform } from "@/canvas/engine/viewport";
import { getAbsoluteCenter, getEffectiveRotation } from "@/canvas/engine/geometry";
import { canvasToViewport } from "./canvasToolingRenderer";
import { getCaretRect, getSelectionRects, getTextLayout } from "./textEditingLayout";
import type { TextEditState } from "./canvasStageTypes";

export function TextEditingOverlay({
  textEdit,
  document,
  viewportTransform,
}: {
  textEdit: TextEditState | null;
  document: CanvasDocument;
  viewportTransform: ViewportTransform;
}) {
  if (!textEdit) return null;
  const node = document.elements[textEdit.nodeId];
  if (!node || node.type !== "text" || node.visible === false) return null;

  // Place the overlay on the element's true visual center and rotate it by the
  // effective rotation (ancestor chain + own) plus the canvas frame's rotation, so
  // caret/selection track the glyphs of a rotated text box (M9). The inner rects
  // are in element-local content px scaled uniformly by the zoom. With no rotation
  // anywhere this reduces to the previous axis-aligned AABB placement.
  const center = getAbsoluteCenter(document, textEdit.nodeId);
  if (!center) return null;
  const zoom = viewportTransform.displayZoom;
  const viewportCenter = canvasToViewport(center.x, center.y, viewportTransform);
  const rotation = getEffectiveRotation(document, textEdit.nodeId) + viewportTransform.canvasRotation;

  const width = Math.max(node.width, 1) * zoom;
  const height = Math.max(node.height, 1) * zoom;

  const layout = getTextLayout(node);
  const lastLine = layout.lines[layout.lines.length - 1];
  const textBottom = lastLine ? lastLine.y + layout.lineHeight : layout.top + layout.lineHeight;

  const toOverlayRect = (rect: { x: number; y: number; width: number; height: number }) => ({
    x: rect.x * zoom,
    y: rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  });

  const selectionRects = getSelectionRects(
    node,
    textEdit.selectionStart,
    textEdit.selectionEnd,
  ).map(toOverlayRect);

  const isCollapsed = textEdit.selectionStart === textEdit.selectionEnd;
  const caretRect = isCollapsed ? toOverlayRect(getCaretRect(node, textEdit.selectionEnd)) : null;

  return (
    <div
      className="text-editing-overlay"
      style={{
        left: viewportCenter.x - width / 2,
        top: viewportCenter.y - height / 2,
        width,
        height: Math.max(height, textBottom * zoom),
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: `${width / 2}px ${height / 2}px`,
      }}
    >
      <div className="text-editing-selection-clip">
        {selectionRects.map((rect, index) => (
          <div
            key={`selection-${textEdit.nodeId}-${index}`}
            className="text-editing-selection"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
        ))}
      </div>
      {caretRect ? (
        <div
          className="text-editing-caret"
          style={{ left: caretRect.x, top: caretRect.y, height: caretRect.height }}
        />
      ) : null}
    </div>
  );
}
