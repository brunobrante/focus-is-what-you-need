// The outline of the shapes that are drawn by clipping a box: polygon, star and
// arrow. One source of truth, in normalized box units (0..1), serialized two ways:
//
//   - `shapeClipPath()` → a CSS `polygon()` string, which clips the element's fill;
//   - `shapeOutlinePathData()` → an SVG `d` string, which strokes the same silhouette.
//
// Keeping both serializations on one vertex list is what lets a clip-path shape
// carry a real border (F2/F3): the stroke traces exactly the edge the fill is cut
// to. The two used to be independent copies — the clip-path lived in both
// `ElementRenderer` and the HTML exporter, and `shapeToPath` (flatten-to-path) had
// a third, *different* arrow (it returned a bare line, not the 7-point arrow).

import type { CSSProperties } from "react";

export type UnitPoint = { readonly x: number; readonly y: number };

/** Star inner radius as a percent of the box half-size, when none is authored. */
export const DEFAULT_STAR_INNER_PERCENT = 22.49;

// The classic block arrow: a shaft spanning the left 65% and a head filling the rest.
const ARROW_OUTLINE: readonly UnitPoint[] = [
  { x: 0, y: 0.3 },
  { x: 0.65, y: 0.3 },
  { x: 0.65, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.65, y: 1 },
  { x: 0.65, y: 0.7 },
  { x: 0, y: 0.7 },
];

function regularPolygonOutline(sides: number): UnitPoint[] {
  const points: UnitPoint[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * 2 * Math.PI - Math.PI / 2;
    points.push({ x: 0.5 + 0.5 * Math.cos(angle), y: 0.5 + 0.5 * Math.sin(angle) });
  }
  return points;
}

function starOutline(innerRadiusPercent: number): UnitPoint[] {
  const spikes = 5;
  // Authored as a percent of the full box (outer tip = 50%), clamped so the star
  // never inverts or collapses onto its center.
  const inner = Math.max(1, Math.min(49, innerRadiusPercent)) / 100;
  const step = Math.PI / spikes;
  const points: UnitPoint[] = [];
  for (let i = 0; i < 2 * spikes; i += 1) {
    const radius = i % 2 === 0 ? 0.5 : inner;
    const angle = i * step - Math.PI / 2;
    points.push({ x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle) });
  }
  return points;
}

/** The shape's outline in normalized box units, or null for types drawn as a plain box. */
export function shapeOutline(type: string, borderRadius?: number): readonly UnitPoint[] | null {
  if (type === "arrow") return ARROW_OUTLINE;
  if (type === "polygon") return regularPolygonOutline(5);
  if (type === "star") return starOutline(borderRadius ?? DEFAULT_STAR_INNER_PERCENT);
  return null;
}

// Trig on unit vectors leaves float dust (0.5 + 0.5*cos(-π/2) = 0.5000000000000001).
// Four decimals is well under a device pixel at any zoom and keeps the emitted CSS
// and path data readable.
function trim(value: number): number {
  return Number(value.toFixed(4));
}

/** The CSS `clip-path` that cuts an element's box down to this shape. */
export function shapeClipPath(type: string, borderRadius?: number): string | undefined {
  const outline = shapeOutline(type, borderRadius);
  if (!outline) return undefined;
  const verts = outline.map((p) => `${trim(p.x * 100)}% ${trim(p.y * 100)}%`);
  return `polygon(${verts.join(", ")})`;
}

/** The same silhouette as an SVG `d`, in the box's own user units (0,0)–(width,height). */
export function shapeOutlinePathData(
  outline: readonly UnitPoint[],
  width: number,
  height: number,
): string {
  const commands = outline.map((p, index) => {
    const x = trim(p.x * width);
    const y = trim(p.y * height);
    return `${index === 0 ? "M" : "L"}${x} ${y}`;
  });
  return `${commands.join(" ")}Z`;
}

// The background longhands `compileFills` can emit. They follow the clip onto the
// inner box; everything else (position, size, rotation, opacity, effects) stays on
// the outer one.
const FILL_STYLE_KEYS = [
  "background",
  "backgroundColor",
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
  "backgroundRepeat",
  "backgroundOrigin",
  "backgroundClip",
  "backgroundBlendMode",
  "backgroundAttachment",
] as const;

/**
 * Split a clip-path shape's compiled style into the two boxes it must render as.
 *
 * The clip cannot reach the border: a stroke drawn along the outline straddles it
 * (Center) or sits entirely outside it (Outside), and a clip on the same element
 * would cut that away. So the fill and the clip move to an inner box, and the outer
 * box — which keeps the effects — is left unclipped and overflow-visible, letting a
 * `drop-shadow` fall from the fill and the stroke together.
 *
 * Shared by the canvas renderer and the HTML exporter so the two agree.
 */
export function splitClipShapeStyles(
  style: CSSProperties,
  clipPath: string,
): { outer: CSSProperties; fill: CSSProperties } {
  const outer = { ...style } as Record<string, unknown>;
  const fill: Record<string, unknown> = {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    clipPath,
  };
  for (const key of FILL_STYLE_KEYS) {
    if (key in outer) {
      fill[key] = outer[key];
      delete outer[key];
    }
  }
  outer.clipPath = undefined;
  outer.overflow = "visible";
  return { outer: outer as CSSProperties, fill: fill as CSSProperties };
}
