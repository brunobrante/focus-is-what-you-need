import type { CSSProperties } from "react";
import type { ElementNode, ElementType } from "@/canvas/engine/types";
import { compileEffects, effectTargetForType } from "@/domain/canvas/effects";
import { borderTargetForType, compileBorder } from "@/domain/canvas/border";
import { compileTypography } from "@/domain/canvas/typography";
import { compileAppearance } from "@/domain/canvas/appearance";
import { compileFills, fillTargetForType, type CompiledFill } from "@/domain/canvas/fillCompile";
import { shapeClipPath } from "@/domain/canvas/shapeGeometry";

// Composes the inline-style CSSProperties for one element, reusing the exact
// same domain `compile*` functions as the live canvas renderer
// (`canvas/stage/ElementRenderer.tsx#nodeStyle`). Kept as a standalone export
// concern (the renderer stays untouched) but driven by the same compilers, so
// HTML export is faithful to what is drawn. Always at renderScale = 1.

export type RefResolver = (ref: string | undefined) => string | undefined;

function computeClipPath(type: ElementType, borderRadius?: number): string | undefined {
  return shapeClipPath(type, borderRadius);
}

function rotationTransform(rotation: number, width: number, height: number): string | undefined {
  if (!rotation) return undefined;
  return `translate(${width / 2}px, ${height / 2}px) rotate(${rotation}deg) translate(${-width / 2}px, ${-height / 2}px)`;
}

function effectStyle(node: ElementNode, resolveRef?: RefResolver): CSSProperties {
  const fx = compileEffects(node.styles.effects, effectTargetForType(node.type), 1, resolveRef);
  return {
    boxShadow: fx.boxShadow,
    textShadow: fx.textShadow,
    filter: fx.filter,
    backdropFilter: fx.backdropFilter,
    WebkitBackdropFilter: fx.backdropFilter,
  };
}

function borderStyleFor(node: ElementNode, clipPath: string | undefined, resolveRef?: RefResolver): CSSProperties {
  const target = borderTargetForType(node.type);
  if (clipPath && target === "box") return {};
  const b = compileBorder(node.styles, target, 1, resolveRef);
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

function withFill(base: CSSProperties, compiled: CompiledFill | null): CSSProperties {
  if (!compiled || !compiled.hasFills) return base;
  return { ...base, background: undefined, ...compiled.style };
}

export type ComposedElementCss = {
  /** The full inline-style object for the element's box. */
  style: CSSProperties;
  /** The compiled typed-fill stack (or null for fill-less types). */
  fill: CompiledFill | null;
};

/**
 * Build the export CSS for a node. When `isRoot` the box is pinned to (0,0) so
 * the exported subtree starts at the origin; descendants keep their
 * parent-relative `x`/`y` (every element is absolutely positioned, matching the
 * canvas model). Image `<img>`/pattern overlays are handled by the HTML emitter;
 * here the box style already excludes the legacy background when a typed fill
 * drives the paint.
 */
export function composeElementCss(
  node: ElementNode,
  options: { resolveRef?: RefResolver; isRoot?: boolean } = {},
): ComposedElementCss {
  const { resolveRef, isRoot = false } = options;
  const styles = node.styles;
  const isEllipse = node.type === "ellipse";
  const hasSceneChildren = node.children.length > 0;
  const width = node.width;
  const height = node.height;
  const clipPath = computeClipPath(node.type, styles.borderRadius);

  const fillTarget = fillTargetForType(node.type);
  const fill: CompiledFill | null = fillTarget
    ? compileFills(styles.fills, fillTarget, resolveRef, node.id)
    : null;

  const base: CSSProperties = {
    position: "absolute",
    left: isRoot ? 0 : node.x,
    top: isRoot ? 0 : node.y,
    width,
    height,
    transform: rotationTransform(node.rotation, width, height),
    transformOrigin: "0 0",
    boxSizing: "border-box",
    background: resolveRef?.(styles.backgroundRef) ?? styles.background,
    color: resolveRef?.(styles.colorRef) ?? styles.color,
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    fontWeight: styles.fontWeight,
    textAlign: styles.textAlign,
    ...borderStyleFor(node, clipPath, resolveRef),
    ...compileAppearance(styles, { isEllipse, hasClipPath: Boolean(clipPath) }, 1),
    clipPath,
    opacity: styles.opacity ?? 1,
    display: hasSceneChildren ? "block" : styles.display ?? "block",
    justifyContent: hasSceneChildren ? undefined : styles.justifyContent,
    alignItems: hasSceneChildren ? undefined : styles.alignItems,
    gap: hasSceneChildren ? undefined : styles.gap,
    padding: hasSceneChildren ? undefined : styles.padding,
    overflow: styles.overflow ?? "hidden",
    ...effectStyle(node, resolveRef),
    ...compileTypography(styles),
  };

  return { style: withFill(base, fill), fill };
}
