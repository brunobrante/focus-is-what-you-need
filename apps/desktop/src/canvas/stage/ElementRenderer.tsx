import { memo } from "react";
import type { CSSProperties } from "react";
import { getEffectiveRotation, getVisualRect } from "@/canvas/engine/geometry";
import type { CanvasDocument, ElementNode } from "@/canvas/engine/types";

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

// `subtreeContains(id, targetId)` is true iff `targetId` is a descendant of `id`
// (or equal to it). The naive form walks the subtree under `id` (O(N)); walking
// up from `targetId` via parentId is O(depth), which is much smaller for any
// real scene tree.
function subtreeContains(
  elements: Record<string, ElementNode>,
  id: string,
  targetId: string | null | undefined,
): boolean {
  if (!targetId) return false;
  if (id === targetId) return true;
  let parentId = elements[targetId]?.parentId ?? null;
  while (parentId) {
    if (parentId === id) return true;
    parentId = elements[parentId]?.parentId ?? null;
  }
  return false;
}

function hierarchyStateAffectsNode(
  previous: ElementRendererProps,
  next: ElementRendererProps,
): boolean {
  if (previous.isolatedParentId !== next.isolatedParentId) {
    return (
      subtreeContains(previous.document.elements, previous.id, previous.isolatedParentId) ||
      subtreeContains(previous.document.elements, previous.id, next.isolatedParentId) ||
      subtreeContains(next.document.elements, next.id, previous.isolatedParentId) ||
      subtreeContains(next.document.elements, next.id, next.isolatedParentId) ||
      Boolean(
        previous.isolatedParentId &&
          isDescendantOf(previous.document.elements, previous.id, previous.isolatedParentId),
      ) ||
      Boolean(
        next.isolatedParentId &&
          isDescendantOf(next.document.elements, next.id, next.isolatedParentId),
      )
    );
  }

  if (previous.editingTextId !== next.editingTextId) {
    return (
      subtreeContains(previous.document.elements, previous.id, previous.editingTextId) ||
      subtreeContains(previous.document.elements, previous.id, next.editingTextId) ||
      subtreeContains(next.document.elements, next.id, previous.editingTextId) ||
      subtreeContains(next.document.elements, next.id, next.editingTextId)
    );
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

type ElementRendererProps = {
  id: string;
  detached?: boolean;
  document: CanvasDocument;
  isolatedParentId?: string | null;
  editingTextId?: string | null;
  affectedElementIds?: ReadonlySet<string>;
  preview?: boolean;
  renderScale?: number;
};

type DetachedIsolatedChildrenProps = {
  document: CanvasDocument;
  isolatedParentId: string | null;
  editingTextId?: string | null;
  affectedElementIds?: ReadonlySet<string>;
  renderScale?: number;
};

function DetachedIsolatedChildrenImpl({
  document,
  isolatedParentId,
  editingTextId = null,
  affectedElementIds,
  renderScale = 1,
}: DetachedIsolatedChildrenProps) {
  const isolatedParent = isolatedParentId ? document.elements[isolatedParentId] : null;

  if (!isolatedParent) return null;

  return (
    <div className="isolated-children-layer" aria-hidden>
      {isolatedParent.children.map((childId) => (
        <ElementRenderer
          key={childId}
          id={childId}
          detached
          document={document}
          isolatedParentId={isolatedParentId}
          editingTextId={editingTextId}
          affectedElementIds={affectedElementIds}
          renderScale={renderScale}
        />
      ))}
    </div>
  );
}

export const DetachedIsolatedChildren = memo(DetachedIsolatedChildrenImpl);

function ElementRendererImpl({
  id,
  detached = false,
  document,
  isolatedParentId: isolatedParentIdProp = null,
  editingTextId = null,
  affectedElementIds,
  preview = false,
  renderScale = 1,
}: ElementRendererProps) {
  const canvasDocument = document;
  const node = canvasDocument.elements[id];
  const isolatedParentId = preview ? null : isolatedParentIdProp;
  const isEditing = !preview && editingTextId === id;
  const isIsolatedParent = !preview && isolatedParentIdProp === id;

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
          document={canvasDocument}
          isolatedParentId={isolatedParentIdProp}
          editingTextId={editingTextId}
          affectedElementIds={affectedElementIds}
          preview={preview}
          renderScale={renderScale}
        />
      ))}
    </div>
  );
}

function areElementRendererPropsEqual(
  previous: ElementRendererProps,
  next: ElementRendererProps,
): boolean {
  if (
    previous.id !== next.id ||
    previous.detached !== next.detached ||
    previous.preview !== next.preview ||
    previous.renderScale !== next.renderScale
  ) {
    return false;
  }

  if (hierarchyStateAffectsNode(previous, next)) {
    return false;
  }

  if (previous.document !== next.document) {
    if (!next.affectedElementIds) return false;
    return !next.affectedElementIds?.has(next.id);
  }

  return true;
}

export const ElementRenderer = memo(ElementRendererImpl, areElementRendererPropsEqual);
