import { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import { getEffectiveRotation, getVisualRect } from "@/canvas/engine/geometry";
import type { CanvasDocument, ElementNode, ElementType } from "@/canvas/engine/types";
import { compileEffects, effectTargetForType } from "@/domain/canvas/effects";
import { borderTargetForType, compileBorder, compileShapeStroke } from "@/domain/canvas/border";
import {
  shapeClipPath,
  shapeOutline,
  shapeOutlinePathData,
  splitClipShapeStyles,
} from "@/domain/canvas/shapeGeometry";
import { compileRunStyles, compileTypography } from "@/domain/canvas/typography";
import { runsForContent } from "@/domain/canvas/textRuns";
import { compileAppearance } from "@/domain/canvas/appearance";
import { compileFills, fillTargetForType, type CompiledFill } from "@/domain/canvas/fillCompile";
import { FillFilterDefs, FillPatternOverlay } from "@/canvas/stage/FillDefs";
import { pathToSvgPathData } from "@/canvas/engine/vector/pathData";
import { pathIsClosed, variableWidthOutline } from "@/domain/canvas/vector";
import { resolveTokenRef, resolveTypeStyleTokenRef } from "@/domain/system-design/resolveTokenRef";
import type { ResolvedSystemDesign } from "@/domain/system-design/resolve";
import { useResolvedSystemDesign } from "@/canvas/stage/resolvedSystemDesignContext";

// Resolves a token `$$ref` (e.g. "colors:c-primary") to a live CSS value, or
// undefined when unbound/unresolved so the literal style fallback is used.
type RefResolver = (ref: string | undefined) => string | undefined;

// Non-color token bindings (G14): overlay the LIVE radius/spacing/typography
// token values onto the node's styles before compiling, so a master change
// re-renders bound elements immediately — same contract as colorRef. Returns
// the node untouched (same reference) when nothing is bound.
function withTokenBoundStyles(node: ElementNode, resolved: ResolvedSystemDesign | null): ElementNode {
  const s = node.styles;
  if (!resolved || (!s.radiusRef && !s.gapRef && !s.paddingRef && !s.typeStyleRef)) return node;
  const styles = { ...s };
  const px = (ref: string): number | undefined => {
    const value = resolveTokenRef(ref, resolved);
    const n = value ? Number.parseFloat(value) : Number.NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  if (s.radiusRef) {
    const radius = px(s.radiusRef);
    if (radius !== undefined) {
      styles.borderRadius = radius;
      styles.cornerRadii = undefined;
    }
  }
  if (s.gapRef) {
    const gap = px(s.gapRef);
    if (gap !== undefined) styles.gap = gap;
  }
  if (s.paddingRef) {
    const padding = px(s.paddingRef);
    if (padding !== undefined) styles.padding = padding;
  }
  if (s.typeStyleRef) {
    const token = resolveTypeStyleTokenRef(s.typeStyleRef, resolved);
    if (token) {
      styles.fontFamily = token.family;
      styles.fontWeight = token.weight;
      const size = Number.parseFloat(token.size);
      if (Number.isFinite(size)) styles.fontSize = size;
    }
  }
  return { ...node, styles };
}

// ─── Clip-path helpers ────────────────────────────────────────────────────────

/**
 * A text element's body: the bare string when the paragraph is uniform, one
 * `<span>` per styled run otherwise (G10).
 *
 * A `vertical-align`ed element compiles to `display: flex; flex-direction:
 * column`, where each span would become its own flex item — its own line. The
 * bare string gets exactly one anonymous flex item today, so in that case the
 * spans are wrapped in a single block that reproduces it.
 */
function TextContent({ node }: { node: ElementNode }) {
  const content = node.content ?? "";
  if (!node.runs || node.runs.length === 0) return <>{content}</>;

  let offset = 0;
  const spans = runsForContent(content, node.runs).map((run) => {
    const key = `${offset}`;
    offset += run.text.length;
    return run.styles ? (
      <span key={key} style={compileRunStyles(run.styles)}>{run.text}</span>
    ) : (
      <span key={key}>{run.text}</span>
    );
  });

  return node.styles.verticalAlign ? <span style={{ display: "block" }}>{spans}</span> : <>{spans}</>;
}

function computeClipPath(type: ElementType, borderRadius?: number): string | undefined {
  return shapeClipPath(type, borderRadius);
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

// Compiles the element's border / stroke styles into inline-style fragments,
// type-aware per element kind: a box gets `border` (Inside) or `outline`
// (Outside); text gets `-webkit-text-stroke` + `paint-order` and the underline
// `text-decoration-*` family. Vector strokes are painted by the <path> branch.
// `clipPath` boxes (polygon/star/arrow) can't carry a CSS border — those defer
// to an SVG render target (v2), so the border is suppressed for them.
function borderStyleFor(
  node: ElementNode,
  renderScale: number,
  clipPath: string | undefined,
  resolveRef?: RefResolver,
): CSSProperties {
  const target = borderTargetForType(node.type);
  if (clipPath && target === "box") return {};
  const b = compileBorder(node.styles, target, renderScale, resolveRef);
  return {
    borderWidth: b.borderWidth,
    borderTopWidth: b.borderTopWidth,
    borderRightWidth: b.borderRightWidth,
    borderBottomWidth: b.borderBottomWidth,
    borderLeftWidth: b.borderLeftWidth,
    borderStyle: b.borderStyle as CSSProperties["borderStyle"],
    borderColor: b.borderColor,
    outlineWidth: b.outlineWidth,
    outlineStyle: b.outlineStyle as CSSProperties["outlineStyle"],
    outlineColor: b.outlineColor,
    outlineOffset: b.outlineOffset,
    WebkitTextStroke: b.webkitTextStroke,
    paintOrder: b.paintOrder as CSSProperties["paintOrder"],
    textDecorationLine: b.textDecorationLine as CSSProperties["textDecorationLine"],
    textDecorationStyle: b.textDecorationStyle as CSSProperties["textDecorationStyle"],
    textDecorationColor: b.textDecorationColor,
    textDecorationThickness: b.textDecorationThickness,
    textUnderlineOffset: b.textUnderlineOffset,
  };
}

// ─── Clip-path shapes: fill by clipping, border by SVG stroke ────────────────
//
// polygon/star/arrow are a box cut down by `clip-path`. A CSS border on such a box
// is clipped away with everything else, which is why they carried no border at all
// (F2) and no alignment (F3). The fix keeps the CSS fill machinery — gradients,
// image fills, tile patterns all still compile to backgrounds — and paints the
// border as an SVG stroke tracing the very outline the fill is cut to.
//
// That forces a two-level DOM: the clip must not reach the stroke, or a Center /
// Outside stroke would be clipped in half. So the outer box keeps position, size,
// rotation, opacity and effects (the drop-shadow then follows fill + stroke
// together), and an inner box carries the clip and the fill.

/**
 * A stroke drawn along `d`, honoring an alignment SVG doesn't have natively.
 *
 * SVG strokes always straddle the path. So Inside and Outside draw at double width
 * and then discard the wrong half: Inside clips to the shape, Outside masks the
 * shape out. Center needs neither. The caller passes the already-doubled width.
 *
 * Emits `<defs>` + a `<path>`, to be embedded in a `<svg viewBox="0 0 w h">` whose
 * box is `w × renderScale` wide — one user unit is then one scaled pixel, so
 * `strokeWidth` tracks zoom on its own.
 */
function AlignedStrokePath({
  uid,
  d,
  align,
  width,
  height,
  ...paint
}: {
  uid: string;
  d: string;
  align: "inside" | "center" | "outside";
  width: number;
  height: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  strokeDasharray?: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
}) {
  const clipId = `stroke-clip-${uid}`;
  const maskId = `stroke-mask-${uid}`;
  // The outside half of a doubled stroke reaches `strokeWidth` past the outline;
  // the mask region has to cover it or it would cut the stroke it exists to shape.
  const pad = paint.strokeWidth ?? 0;
  const region = { x: -pad, y: -pad, width: width + pad * 2, height: height + pad * 2 };

  return (
    <>
      {align === "inside" ? (
        <defs>
          <clipPath id={clipId}>
            <path d={d} />
          </clipPath>
        </defs>
      ) : null}
      {align === "outside" ? (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" {...region}>
            <rect {...region} fill="#fff" />
            <path d={d} fill="#000" />
          </mask>
        </defs>
      ) : null}
      <path
        d={d}
        fill="none"
        {...(paint as Record<string, unknown>)}
        clipPath={align === "inside" ? `url(#${clipId})` : undefined}
        mask={align === "outside" ? `url(#${maskId})` : undefined}
      />
    </>
  );
}

/** The border of a clip-path shape, as an SVG stroke along its outline. */
function ClipShapeStroke({ node, resolveRef }: { node: ElementNode; resolveRef?: RefResolver }) {
  const stroke = compileShapeStroke(node.styles, resolveRef);
  const outline = shapeOutline(node.type, node.styles.borderRadius);
  if (!stroke || !outline) return null;

  const width = Math.max(node.width, 1);
  const height = Math.max(node.height, 1);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      focusable="false"
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
    >
      <AlignedStrokePath
        uid={node.id}
        d={shapeOutlinePathData(outline, width, height)}
        align={stroke.align}
        width={width}
        height={height}
        stroke={stroke.stroke}
        strokeWidth={stroke.strokeWidth}
        strokeDasharray={stroke.strokeDasharray}
        strokeLinecap={stroke.strokeLinecap}
      />
    </svg>
  );
}

// When an element carries a typed `fills` stack the compiled background longhands
// replace the legacy `background` shorthand (clearing it so the two don't fight).
function withFill(base: CSSProperties, compiled: CompiledFill | null): CSSProperties {
  // An explicit empty fills list paints nothing — drop the legacy background (M11).
  if (compiled?.cleared) return { ...base, background: undefined };
  if (!compiled || !compiled.hasFills) return base;
  return { ...base, background: undefined, ...compiled.style };
}

/** Chain the effect filter (already on `base`) with an image-adjustment filter. */
function combineFilter(base: CSSProperties, extra: string | undefined): CSSProperties["filter"] {
  const existing = typeof base.filter === "string" ? base.filter : undefined;
  return [existing, extra].filter(Boolean).join(" ") || undefined;
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
    ...borderStyleFor(node, renderScale, clipPath, resolveRef),
    ...compileAppearance(styles, { isEllipse, hasClipPath: Boolean(clipPath) }, renderScale),
    clipPath,
    // Keep the text being edited fully opaque so it stays legible; every other
    // element renders at its real Appearance opacity (matching detached copies).
    opacity: isEditing ? 1 : styles.opacity ?? 1,
    display: hasSceneChildren ? "block" : styles.display ?? "block",
    justifyContent: hasSceneChildren ? undefined : styles.justifyContent,
    alignItems: hasSceneChildren ? undefined : styles.alignItems,
    gap: hasSceneChildren ? undefined : scaled(styles.gap, renderScale),
    padding: hasSceneChildren ? undefined : scaled(styles.padding, renderScale),
    overflow: isEditing ? "visible" : styles.overflow ?? "hidden",
    zIndex: isEditing ? 10 : undefined,
    ...effectStyle(node, renderScale, resolveRef),
    // Spread last: typography owns the combined text-decoration line and, when a
    // vertical align is set, overrides display/justify on the text box.
    ...compileTypography(styles),
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
    ...borderStyleFor(node, renderScale, clipPath, resolveRef),
    ...compileAppearance(styles, { isEllipse, hasClipPath: Boolean(clipPath) }, renderScale),
    clipPath,
    opacity: styles.opacity ?? 1,
    display: hasSceneChildren ? "block" : styles.display ?? "block",
    justifyContent: hasSceneChildren ? undefined : styles.justifyContent,
    alignItems: hasSceneChildren ? undefined : styles.alignItems,
    gap: hasSceneChildren ? undefined : scaled(styles.gap, renderScale),
    padding: hasSceneChildren ? undefined : scaled(styles.padding, renderScale),
    overflow: styles.overflow ?? "hidden",
    ...effectStyle(node, renderScale, resolveRef),
    ...compileTypography(styles),
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
  const storedNode = canvasDocument.elements[id];
  // Overlay live non-color token values (radius/spacing/typography, G14) so a
  // bound element follows its master token without a document write.
  const node = storedNode ? withTokenBoundStyles(storedNode, resolvedDesign) : storedNode;
  const isolatedParentId = preview ? null : isolatedParentIdProp;
  const isEditing = !preview && editingTextId === id;
  const isIsolatedParent = !preview && isolatedParentIdProp === id;

  if (!node || node.visible === false) return null;

  // The typed Fill stack (solid/gradient/image/video), compiled type-aware. Null
  // for types that take no fill (line/arrow/path/svg). When `hasFills` is false
  // the legacy `background` path below is used unchanged.
  const fillTarget = fillTargetForType(node.type);
  const compiledFill: CompiledFill | null = fillTarget
    ? compileFills(node.styles.fills, fillTarget, resolveRef, node.id)
    : null;
  const fillDefs =
    compiledFill && (compiledFill.filterDefs.length || compiledFill.patternLayer) ? (
      <>
        <FillFilterDefs defs={compiledFill.filterDefs} />
        {compiledFill.patternLayer ? (
          <FillPatternOverlay layer={compiledFill.patternLayer} renderScale={renderScale} />
        ) : null}
      </>
    ) : null;

  if (node.type === "text") {
    const base = detached ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef) : nodeStyle(node, isEditing, renderScale, resolveRef);
    return (
      <div
        data-element-id={node.id}
        data-node-type={node.type}
        className={elementClassName(node, "element text-element", isEditing, isolatedParentId, canvasDocument.elements)}
        style={withFill(base, compiledFill)}
      >
        {compiledFill?.filterDefs.length ? <FillFilterDefs defs={compiledFill.filterDefs} /> : null}
        <TextContent node={node} />
      </div>
    );
  }

  if (node.type === "image") {
    const base = detached ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef) : nodeStyle(node, false, renderScale, resolveRef);
    const render = compiledFill?.imageRender;
    const wrapperBase: CSSProperties = { ...base, background: undefined };

    if (render?.mode === "img") {
      return (
        <div
          data-element-id={node.id}
          data-node-type={node.type}
          className={elementClassName(node, "element image-element", false, isolatedParentId, canvasDocument.elements)}
          style={wrapperBase}
        >
          <FillFilterDefs defs={compiledFill!.filterDefs} />
          <img
            src={render.src}
            alt={node.name}
            draggable={false}
            style={{ objectFit: render.objectFit as CSSProperties["objectFit"], objectPosition: render.objectPosition, filter: render.filter }}
          />
        </div>
      );
    }

    if (render?.mode === "video") {
      return (
        <div
          data-element-id={node.id}
          data-node-type={node.type}
          className={elementClassName(node, "element image-element", false, isolatedParentId, canvasDocument.elements)}
          style={wrapperBase}
        >
          <video
            src={render.src}
            autoPlay
            loop
            muted
            playsInline
            style={{ objectFit: render.objectFit as CSSProperties["objectFit"], objectPosition: render.objectPosition }}
          />
        </div>
      );
    }

    if (render?.mode === "background") {
      // A Tile fill (or a solid/gradient fill on the image element) renders as a
      // background div — an <img> can never tile.
      const style: CSSProperties = {
        ...withFill(base, compiledFill),
        filter: combineFilter(base, render.filter),
      };
      return (
        <div
          data-element-id={node.id}
          data-node-type={node.type}
          className={elementClassName(node, "element image-element", false, isolatedParentId, canvasDocument.elements)}
          style={style}
        >
          {fillDefs}
        </div>
      );
    }

    // An explicit empty fills list paints nothing — skip the legacy `node.src`
    // fallback and show the empty placeholder (M11).
    const cleared = compiledFill?.cleared ?? false;
    // No typed fill — legacy single-image path, unchanged.
    return (
      <div
        data-element-id={node.id}
        data-node-type={node.type}
        className={elementClassName(node, "element image-element", false, isolatedParentId, canvasDocument.elements)}
        style={base}
      >
        {node.src && !cleared ? (
          <img src={node.src} alt={node.name} draggable={false} style={{ objectFit: node.styles.objectFit }} />
        ) : (
          <div className="image-placeholder"><span>IMG</span></div>
        )}
      </div>
    );
  }

  if (node.type === "path") {
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
    const width = Math.max(node.width, 1);
    const height = Math.max(node.height, 1);
    const d = pathToSvgPathData(node.path);
    // Inside/Outside are defined against an interior, so an open path stays centered
    // however it is authored — clipping it would silently treat it as closed (F3).
    const align = pathIsClosed(node.path) ? s.strokeAlign ?? "center" : "center";
    const strokeWidth = s.strokeWidth;
    // Variable-width stroke: SVG can't taper a stroke, so paint it as a filled
    // outline (ribbon) computed from per-anchor widths. When present it replaces the
    // uniform/aligned stroke entirely.
    const widthOutline =
      stroke !== undefined && (strokeWidth ?? 0) > 0
        ? variableWidthOutline(node.path, strokeWidth ?? 0)
        : null;
    const hasAlignedStroke =
      !widthOutline && align !== "center" && stroke !== undefined && (strokeWidth ?? 0) > 0;
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
          viewBox={`0 0 ${width} ${height}`}
          // Explicit color context so `currentColor` paints (fill/stroke) resolve to
          // the theme foreground — the same tint the Icons tab shows — instead of
          // whatever UI-chrome color happens to cascade into the stage DOM.
          style={{ overflow: "visible", display: "block", color: "var(--text, #F2F2F2)" }}
        >
          {/* An Outside stroke masks out the shape's interior, which would erase the
              fill too — so an aligned stroke is painted on its own path, over an
              unstroked fill. Center keeps both on one path, as before. */}
          <path
            d={d}
            fillRule={node.path?.fillRule ?? s.fillRule}
            fill={fill}
            fillOpacity={s.fillOpacity}
            stroke={hasAlignedStroke || widthOutline ? undefined : stroke}
            strokeWidth={hasAlignedStroke || widthOutline ? undefined : strokeWidth}
            strokeOpacity={hasAlignedStroke || widthOutline ? undefined : s.strokeOpacity}
            strokeLinecap={hasAlignedStroke || widthOutline ? undefined : s.strokeLinecap}
            strokeLinejoin={hasAlignedStroke || widthOutline ? undefined : s.strokeLinejoin}
            strokeDasharray={hasAlignedStroke || widthOutline ? undefined : s.strokeDasharray}
          />
          {widthOutline ? (
            <path d={widthOutline} fill={stroke} fillOpacity={s.strokeOpacity} stroke="none" />
          ) : null}
          {hasAlignedStroke ? (
            <AlignedStrokePath
              uid={node.id}
              d={d}
              align={align}
              width={width}
              height={height}
              stroke={stroke}
              strokeWidth={(strokeWidth ?? 0) * 2}
              strokeOpacity={s.strokeOpacity}
              strokeLinecap={s.strokeLinecap}
              strokeLinejoin={s.strokeLinejoin}
              strokeDasharray={s.strokeDasharray}
            />
          ) : null}
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
    const base = detached ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef) : nodeStyle(node, false, renderScale, resolveRef);
    return (
      <div
        data-element-id={node.id}
        data-node-type={node.type}
        className={elementClassName(node, "element icon-element", false, isolatedParentId, canvasDocument.elements)}
        style={withFill(base, compiledFill)}
      >
        {fillDefs}
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.5l2.64 5.35 5.91.86-4.27 4.16 1.01 5.88L12 16.98l-5.29 2.77 1.01-5.88-4.27-4.16 5.91-.86L12 3.5z" />
        </svg>
      </div>
    );
  }

  const genericBase = detached ? detachedNodeStyle(node, canvasDocument, renderScale, resolveRef) : nodeStyle(node, false, renderScale, resolveRef);

  const shapeClip = computeClipPath(node.type, node.styles.borderRadius);
  if (shapeClip) {
    // polygon / star / arrow: clipped fill inside, stroke outside the clip (F2/F3).
    const { outer, fill } = splitClipShapeStyles(withFill(genericBase, compiledFill), shapeClip);
    return (
      <div
        data-element-id={node.id}
        data-node-type={node.type}
        className={elementClassName(node, "element", false, isolatedParentId, canvasDocument.elements)}
        style={outer}
      >
        <div style={fill}>
          {fillDefs}
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
        <ClipShapeStroke node={node} resolveRef={resolveRef} />
      </div>
    );
  }

  return (
    <div
      data-element-id={node.id}
      data-node-type={node.type}
      className={elementClassName(node, "element", false, isolatedParentId, canvasDocument.elements)}
      style={withFill(genericBase, compiledFill)}
    >
      {fillDefs}
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
