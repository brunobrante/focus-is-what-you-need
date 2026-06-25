import { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import { getEffectiveRotation, getVisualRect } from "@/canvas/engine/geometry";
import type { CanvasDocument, ElementNode, ElementType } from "@/canvas/engine/types";
import { compileEffects, effectTargetForType } from "@/domain/canvas/effects";
import { pathToSvgPathData } from "@/canvas/engine/vector/pathData";
import { resolveTokenRef } from "@/domain/system-design/resolveTokenRef";
import { useResolvedSystemDesign } from "@/canvas/stage/resolvedSystemDesignContext";

// Resolves a token `$$ref` (e.g. "colors:c-primary") to a live CSS value, or
// undefined when unbound/unresolved so the literal style fallback is used.
type RefResolver = (ref: string | undefined) => string | undefined;

// ─── Clip-path helpers ────────────────────────────────────────────────────────

function polygonClipPath(sides: number): string {
  const verts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * 2 * Math.PI - Math.PI / 2;
    verts.push(`${50 + 50 * Math.cos(angle)}% ${50 + 50 * Math.sin(angle)}%`);
  }
  return `polygon(${verts.join(", ")})`;
}

function starClipPath(innerRadiusPercent: number): string {
  const points = 5;
  const outer = 50;
  const inner = Math.max(1, Math.min(49, innerRadiusPercent));
  const step = Math.PI / points;
  const verts: string[] = [];
  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = i * step - Math.PI / 2;
    verts.push(`${50 + r * Math.cos(angle)}% ${50 + r * Math.sin(angle)}%`);
  }
  return `polygon(${verts.join(", ")})`;
}

const ARROW_CLIP_PATH = "polygon(0% 30%, 65% 30%, 65% 0%, 100% 50%, 65% 100%, 65% 70%, 0% 70%)";

function computeClipPath(type: ElementType, borderRadius?: number): string | undefined {
  if (type === "arrow") return ARROW_CLIP_PATH;
  if (type === "polygon") return polygonClipPath(5);
  if (type === "star") return starClipPath(borderRadius ?? 22.49);
  return undefined;
}

function rotationTransform(rotation: number, width: number, height: number): string | undefined {
  if (!rotation) return undefined;
  return `translate(${width / 2}px, ${height / 2}px) rotate(${rotation}deg) translate(${-width / 2}px, ${-height / 2}px)`;
}

function scaled(value: number | undefined, renderScale: number): number | undefined {
  return value === undefined ? undefined : value * renderScale;
}

// Compiles the element's Effects list into the box-shadow / filter / backdrop /
// text-shadow inline-style fragments, type-aware per element kind. Background
// blur is emitted under both the prefixed and unprefixed key (WebKit < 18).
function effectStyle(node: ElementNode, renderScale: number, resolveRef?: RefResolver): CSSProperties {
  const fx = compileEffects(
    node.styles.effects,
    effectTargetForType(node.type),
    renderScale,
    resolveRef,
  );
  return {
    boxShadow: fx.boxShadow,
    textShadow: fx.textShadow,
    filter: fx.filter,
    backdropFilter: fx.backdropFilter,
    WebkitBackdropFilter: fx.backdropFilter,
  };
}

function nodeStyle(
  node: ElementNode,
  isEditing = false,
  renderScale = 1,
  resolveRef?: RefResolver,
): CSSProperties {
  const styles = node.styles;
  const isEllipse = node.type === "ellipse";
  const hasSceneChildren = node.children.length > 0;
  const width = node.width * renderScale;
  const height = node.height * renderScale;
  const clipPath = computeClipPath(node.type, styles.borderRadius);
  return {
    position: "absolute",
    left: node.x * renderScale,
    top: node.y * renderScale,
    width,
    height,
    transform: rotationTransform(node.rotation, width, height),
    transformOrigin: "0 0",
    boxSizing: "border-box",
    background: resolveRef?.(styles.backgroundRef) ?? styles.background,
    color: resolveRef?.(styles.colorRef) ?? styles.color,
    fontFamily: styles.fontFamily,
    fontSize: scaled(styles.fontSize, renderScale),
    fontWeight: styles.fontWeight,
    textAlign: styles.textAlign,
    borderRadius: isEllipse ? "50%" : clipPath ? undefined : scaled(styles.borderRadius, renderScale),
    borderWidth: clipPath ? undefined : scaled(styles.borderWidth, renderScale),
    borderStyle: !clipPath && styles.borderWidth ? "solid" : undefined,
    borderColor: clipPath ? undefined : (resolveRef?.(styles.borderColorRef) ?? styles.borderColor),
    clipPath,
    opacity: 1,
    display: hasSceneChildren ? "block" : styles.display ?? "block",
    justifyContent: hasSceneChildren ? undefined : styles.justifyContent,
    alignItems: hasSceneChildren ? undefined : styles.alignItems,
    gap: hasSceneChildren ? undefined : scaled(styles.gap, renderScale),
    padding: hasSceneChildren ? undefined : scaled(styles.padding, renderScale),
    overflow: isEditing ? "visible" : styles.overflow ?? "hidden",
    zIndex: isEditing ? 10 : undefined,
    ...effectStyle(node, renderScale, resolveRef),
  };
}

function detachedNodeStyle(
  node: ElementNode,
  canvasDocument: CanvasDocument,
  renderScale = 1,
  resolveRef?: RefResolver,
): CSSProperties {
  const rect = getVisualRect(canvasDocument, node.id);
  const rotation = getEffectiveRotation(canvasDocument, node.id);
  const styles = node.styles;
  const isEllipse = node.type === "ellipse";
  const hasSceneChildren = node.children.length > 0;
  const width = node.width * renderScale;
  const height = node.height * renderScale;
  const clipPath = computeClipPath(node.type, styles.borderRadius);

  return {
    position: "absolute",
    left: (rect?.x ?? node.x) * renderScale,
    top: (rect?.y ?? node.y) * renderScale,
    width,
    height,
    transform: rotationTransform(rotation, width, height),
    transformOrigin: "0 0",
    boxSizing: "border-box",
    background: resolveRef?.(styles.backgroundRef) ?? styles.background,
    color: resolveRef?.(styles.colorRef) ?? styles.color,
    fontFamily: styles.fontFamily,
    fontSize: scaled(styles.fontSize, renderScale),
    fontWeight: styles.fontWeight,
    textAlign: styles.textAlign,
    borderRadius: isEllipse ? "50%" : clipPath ? undefined : scaled(styles.borderRadius, renderScale),
    borderWidth: clipPath ? undefined : scaled(styles.borderWidth, renderScale),
    borderStyle: !clipPath && styles.borderWidth ? "solid" : undefined,
    borderColor: clipPath ? undefined : (resolveRef?.(styles.borderColorRef) ?? styles.borderColor),
    clipPath,
    opacity: styles.opacity,
    display: hasSceneChildren ? "block" : styles.display ?? "block",
    justifyContent: hasSceneChildren ? undefined : styles.justifyContent,
    alignItems: hasSceneChildren ? undefined : styles.alignItems,
    gap: hasSceneChildren ? undefined : scaled(styles.gap, renderScale),
    padding: hasSceneChildren ? undefined : scaled(styles.padding, renderScale),
    overflow: styles.overflow ?? "hidden",
    ...effectStyle(node, renderScale, resolveRef),
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
  const resolvedDesign = useResolvedSystemDesign();
  const resolveRef = useMemo<RefResolver>(
    () => (ref) =>
      ref && resolvedDesign ? resolveTokenRef(ref, resolvedDesign) ?? undefined : undefined,
    [resolvedDesign],
  );
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
        style={detached ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef) : nodeStyle(node, isEditing, renderScale, resolveRef)}
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
        style={detached ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef) : nodeStyle(node, false, renderScale, resolveRef)}
      >
        {node.src ? (
          <img src={node.src} alt={node.name} draggable={false} style={{ objectFit: node.styles.objectFit }} />
        ) : (
          <div className="image-placeholder"><span>IMG</span></div>
        )}
      </div>
    );
  }

  if (node.type === "path") {
    const vb = node.viewBox ?? { width: node.width || 1, height: node.height || 1 };
    const base = detached
      ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef)
      : nodeStyle(node, false, renderScale, resolveRef);
    // The positioning box paints nothing — fill/stroke live on the <path>.
    const boxStyle: CSSProperties = {
      ...base,
      background: undefined,
      borderWidth: undefined,
      borderStyle: undefined,
      borderColor: undefined,
      borderRadius: undefined,
      clipPath: undefined,
      overflow: "visible",
    };
    const s = node.styles;
    const fill = s.fill ?? resolveRef?.(s.backgroundRef) ?? s.background ?? "none";
    const stroke = resolveRef?.(s.strokeRef) ?? s.stroke;
    return (
      <div
        data-element-id={node.id}
        data-node-type="path"
        className={elementClassName(node, "element path-element", false, isolatedParentId, canvasDocument.elements)}
        style={boxStyle}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${vb.width} ${vb.height}`}
          preserveAspectRatio="none"
          style={{ overflow: "visible", display: "block" }}
        >
          <path
            d={pathToSvgPathData(node.path)}
            fillRule={node.path?.fillRule ?? s.fillRule}
            fill={fill}
            fillOpacity={s.fillOpacity}
            stroke={stroke}
            strokeWidth={s.strokeWidth}
            strokeOpacity={s.strokeOpacity}
            strokeLinecap={s.strokeLinecap}
            strokeLinejoin={s.strokeLinejoin}
            strokeDasharray={s.strokeDasharray}
          />
        </svg>
      </div>
    );
  }

  if (node.type === "svg") {
    // Container node: a transparent positioning box that holds child `path` nodes
    // (rendered through the normal hierarchy). No raw markup is injected.
    const base = detached
      ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef)
      : nodeStyle(node, false, renderScale, resolveRef);
    const boxStyle: CSSProperties = { ...base, background: undefined, overflow: "visible" };
    return (
      <div
        data-element-id={node.id}
        data-node-type="svg"
        className={elementClassName(node, "element svg-element", false, isolatedParentId, canvasDocument.elements)}
        style={boxStyle}
      >
        {node.children.length === 0 ? (
          <div className="image-placeholder"><span>SVG</span></div>
        ) : (
          !isIsolatedParent &&
          node.children.map((childId) => (
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
          ))
        )}
      </div>
    );
  }

  if (node.type === "icon") {
    return (
      <div
        data-element-id={node.id}
        data-node-type={node.type}
        className={elementClassName(node, "element icon-element", false, isolatedParentId, canvasDocument.elements)}
        style={detached ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef) : nodeStyle(node, false, renderScale, resolveRef)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.5l2.64 5.35 5.91.86-4.27 4.16 1.01 5.88L12 16.98l-5.29 2.77 1.01-5.88-4.27-4.16 5.91-.86L12 3.5z" />
        </svg>
      </div>
    );
  }

  return (
    <div
      data-element-id={node.id}
      data-node-type={node.type}
      className={elementClassName(node, "element", false, isolatedParentId, canvasDocument.elements)}
      style={detached ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef) : nodeStyle(node, false, renderScale, resolveRef)}
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
