import type { CSSProperties } from "react";
import { getEffectiveRotation, getVisualRect } from "@/lib/editor/geometry";
import { useEditor } from "@/lib/editor/store";
import type { CanvasDocument, ElementNode } from "@/lib/editor/types";

function rotationTransform(rotation: number, width: number, height: number): string | undefined {
  if (!rotation) return undefined;
  return `translate(${width / 2}px, ${height / 2}px) rotate(${rotation}deg) translate(${-width / 2}px, ${-height / 2}px)`;
}

function scaled(value: number | undefined, renderScale: number): number | undefined {
  return value === undefined ? undefined : value * renderScale;
}

function nodeStyle(node: ElementNode, isEditing = false, renderScale = 1): CSSProperties {
  const styles = node.styles;
  const isEllipse = node.type === "ellipse";
  const hasSceneChildren = node.children.length > 0;
  const width = node.width * renderScale;
  const height = node.height * renderScale;
  return {
    position: "absolute",
    left: node.x * renderScale,
    top: node.y * renderScale,
    width,
    height,
    transform: rotationTransform(node.rotation, width, height),
    transformOrigin: "0 0",
    boxSizing: "border-box",
    background: styles.background,
    color: styles.color,
    fontFamily: styles.fontFamily,
    fontSize: scaled(styles.fontSize, renderScale),
    fontWeight: styles.fontWeight,
    textAlign: styles.textAlign,
    borderRadius: isEllipse ? "50%" : scaled(styles.borderRadius, renderScale),
    borderWidth: scaled(styles.borderWidth, renderScale),
    borderStyle: styles.borderWidth ? "solid" : undefined,
    borderColor: styles.borderColor,
    opacity: 1,
    display: hasSceneChildren ? "block" : styles.display ?? "block",
    justifyContent: hasSceneChildren ? undefined : styles.justifyContent,
    alignItems: hasSceneChildren ? undefined : styles.alignItems,
    gap: hasSceneChildren ? undefined : scaled(styles.gap, renderScale),
    padding: hasSceneChildren ? undefined : scaled(styles.padding, renderScale),
    overflow: isEditing ? "visible" : styles.overflow ?? "hidden",
    zIndex: isEditing ? 10 : undefined
  };
}

function detachedNodeStyle(
  node: ElementNode,
  canvasDocument: CanvasDocument,
  renderScale = 1,
): CSSProperties {
  const rect = getVisualRect(canvasDocument, node.id);
  const rotation = getEffectiveRotation(canvasDocument, node.id);
  const styles = node.styles;
  const isEllipse = node.type === "ellipse";
  const hasSceneChildren = node.children.length > 0;
  const width = node.width * renderScale;
  const height = node.height * renderScale;

  return {
    position: "absolute",
    left: (rect?.x ?? node.x) * renderScale,
    top: (rect?.y ?? node.y) * renderScale,
    width,
    height,
    transform: rotationTransform(rotation, width, height),
    transformOrigin: "0 0",
    boxSizing: "border-box",
    background: styles.background,
    color: styles.color,
    fontFamily: styles.fontFamily,
    fontSize: scaled(styles.fontSize, renderScale),
    fontWeight: styles.fontWeight,
    textAlign: styles.textAlign,
    borderRadius: isEllipse ? "50%" : scaled(styles.borderRadius, renderScale),
    borderWidth: scaled(styles.borderWidth, renderScale),
    borderStyle: styles.borderWidth ? "solid" : undefined,
    borderColor: styles.borderColor,
    opacity: styles.opacity,
    display: hasSceneChildren ? "block" : styles.display ?? "block",
    justifyContent: hasSceneChildren ? undefined : styles.justifyContent,
    alignItems: hasSceneChildren ? undefined : styles.alignItems,
    gap: hasSceneChildren ? undefined : scaled(styles.gap, renderScale),
    padding: hasSceneChildren ? undefined : scaled(styles.padding, renderScale),
    overflow: styles.overflow ?? "hidden",
  };
}

function isDescendantOf(
  elements: Record<string, ElementNode>,
  id: string,
  ancestorId: string,
): boolean {
  let parentId = elements[id]?.parentId ?? null;
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = elements[parentId]?.parentId ?? null;
  }
  return false;
}

function elementClassName(
  node: ElementNode,
  base: string,
  isEditing: boolean,
  isolatedParentId: string | null,
  elements: Record<string, ElementNode>,
): string {
  const classes = [base];
  if (isEditing) classes.push("editing");
  if (isolatedParentId === node.id) classes.push("element--isolated-parent");
  if (isolatedParentId && isDescendantOf(elements, node.id, isolatedParentId)) {
    classes.push("element--isolated-child");
  }
  return classes.join(" ");
}

export function DetachedIsolatedChildren({ renderScale = 1 }: { renderScale?: number }) {
  const { state } = useEditor();
  const isolatedParentId = state.isolatedParentId;
  const isolatedParent = isolatedParentId ? state.document.elements[isolatedParentId] : null;

  if (!isolatedParent) return null;

  return (
    <div className="isolated-children-layer" aria-hidden>
      {isolatedParent.children.map((childId) => (
        <ElementRenderer key={childId} id={childId} detached renderScale={renderScale} />
      ))}
    </div>
  );
}

export function ElementRenderer({
  id,
  detached = false,
  documentOverride,
  preview = false,
  renderScale = 1,
}: {
  id: string;
  detached?: boolean;
  documentOverride?: CanvasDocument;
  preview?: boolean;
  renderScale?: number;
}) {
  const { state } = useEditor();
  const canvasDocument = documentOverride ?? state.document;
  const node = canvasDocument.elements[id];
  const isolatedParentId = preview ? null : state.isolatedParentId;
  const isEditing = !preview && state.editingTextId === id;
  const isIsolatedParent = !preview && state.isolatedParentId === id;

  if (!node || node.visible === false) return null;

  if (node.type === "text") {
    return (
      <div
        data-element-id={node.id}
        data-node-type={node.type}
        className={elementClassName(node, "element text-element", isEditing, isolatedParentId, canvasDocument.elements)}
        style={detached ? detachedNodeStyle(node, canvasDocument, renderScale) : nodeStyle(node, isEditing, renderScale)}
      >
        {node.content}
      </div>
    );
  }

  if (node.type === "image") {
    return (
      <div
        data-element-id={node.id}
        data-node-type={node.type}
        className={elementClassName(node, "element image-element", false, isolatedParentId, canvasDocument.elements)}
        style={detached ? detachedNodeStyle(node, canvasDocument, renderScale) : nodeStyle(node, false, renderScale)}
      >
        {node.src ? (
          <img src={node.src} alt={node.name} draggable={false} style={{ objectFit: node.styles.objectFit }} />
        ) : (
          <div className="image-placeholder"><span>IMG</span></div>
        )}
      </div>
    );
  }

  return (
    <div
      data-element-id={node.id}
      data-node-type={node.type}
      className={elementClassName(node, "element", false, isolatedParentId, canvasDocument.elements)}
      style={detached ? detachedNodeStyle(node, canvasDocument, renderScale) : nodeStyle(node, false, renderScale)}
    >
      {!isIsolatedParent && node.children.map((childId) => (
        <ElementRenderer
          key={childId}
          id={childId}
          documentOverride={documentOverride}
          preview={preview}
          renderScale={renderScale}
        />
      ))}
    </div>
  );
}
