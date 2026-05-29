import type { CanvasDocument } from "@/lib/editor/types";
import type { ViewportTransform } from "@/lib/editor/viewport";
import { elementToPaintViewportRect } from "./canvasToolingRenderer";
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

  const elementRect = elementToPaintViewportRect(document, textEdit.nodeId, viewportTransform);
  if (!elementRect) return null;

  const scaleX = elementRect.width / Math.max(node.width, 1);
  const scaleY = elementRect.height / Math.max(node.height, 1);
  const layout = getTextLayout(node);
  const lastLine = layout.lines[layout.lines.length - 1];
  const textBottom = lastLine
    ? lastLine.y + layout.lineHeight
    : layout.contentY + layout.lineHeight;

  const toOverlayRect = (rect: { x: number; y: number; width: number; height: number }) => ({
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
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
        left: elementRect.x,
        top: elementRect.y,
        width: elementRect.width,
        height: Math.max(elementRect.height, textBottom * scaleY),
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
