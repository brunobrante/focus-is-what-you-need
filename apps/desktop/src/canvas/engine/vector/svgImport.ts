// Parse sanitized SVG markup into our structured representation: an intrinsic
// viewBox + a list of paths (one per <path>/<rect>/<circle>/… shape), each in the
// shared viewBox coordinate space, plus the presentation styles read off the node.
// Pure aside from DOMParser (browser/Tauri). See sanitizeSvg for the safety pass.

import type { ElementStyles, VectorAnchor, VectorPath } from "../types";
import { svgPathDataToPath } from "./pathData";
import { sanitizeSvg } from "./sanitizeSvg";

const KAPPA = 0.5522847498307936;

export type ImportedPath = { path: VectorPath; styles: Partial<ElementStyles>; name: string };
export type ImportedSvg = { viewBox: { width: number; height: number }; paths: ImportedPath[] };

// SVG presentation attributes that cascade to descendants (per the SVG spec). Note
// `opacity` is deliberately absent — element opacity does not inherit.
const INHERITABLE_STYLE_KEYS = [
  "fill",
  "fillOpacity",
  "fillRule",
  "stroke",
  "strokeWidth",
  "strokeOpacity",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeDasharray",
] as const satisfies readonly (keyof ElementStyles)[];

// CSS absolute units → px (96dpi reference), per the CSS spec.
const ABSOLUTE_UNIT_PX: Record<string, number> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  if (v === null) return fallback;
  const m = v.trim().match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([a-z%]*)$/i);
  if (!m) return fallback;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return fallback;
  const unit = m[2].toLowerCase();
  if (unit === "" || unit === "px") return n;
  if (unit in ABSOLUTE_UNIT_PX) return n * ABSOLUTE_UNIT_PX[unit];
  // Percentages and font-relative units (em/ex/%) need a resolution context we
  // don't have here — reject rather than mis-read "50%" as an absolute 50.
  return fallback;
}

function readStyles(el: Element): Partial<ElementStyles> {
  const styles: Partial<ElementStyles> = {};
  const get = (name: string): string | null => {
    const attr = el.getAttribute(name);
    if (attr !== null) return attr;
    // Minimal inline-style fallback.
    const style = el.getAttribute("style");
    if (!style) return null;
    const m = style.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${name}:`));
    return m ? m.slice(name.length + 1).trim() : null;
  };
  const fill = get("fill");
  if (fill !== null) styles.fill = fill;
  const stroke = get("stroke");
  // Record `stroke` even when "none" so it can OVERRIDE an inherited stroke (SVG
  // presentation attributes cascade); the renderer treats "none" as no stroke.
  if (stroke !== null) styles.stroke = stroke;
  const sw = get("stroke-width");
  if (sw !== null) styles.strokeWidth = parseFloat(sw) || 0;
  // Guard against "inherit"/"currentColor"/non-numeric values → parseFloat NaN.
  const fo = get("fill-opacity");
  if (fo !== null && Number.isFinite(parseFloat(fo))) styles.fillOpacity = parseFloat(fo);
  const so = get("stroke-opacity");
  if (so !== null && Number.isFinite(parseFloat(so))) styles.strokeOpacity = parseFloat(so);
  const fr = get("fill-rule");
  if (fr === "evenodd" || fr === "nonzero") styles.fillRule = fr;
  const lc = get("stroke-linecap");
  if (lc === "butt" || lc === "round" || lc === "square") styles.strokeLinecap = lc;
  const lj = get("stroke-linejoin");
  if (lj === "miter" || lj === "round" || lj === "bevel") styles.strokeLinejoin = lj;
  const da = get("stroke-dasharray");
  if (da !== null && da !== "none") styles.strokeDasharray = da;
  const op = get("opacity");
  if (op !== null && Number.isFinite(parseFloat(op))) styles.opacity = parseFloat(op);
  return styles;
}

function ellipseToPath(cx: number, cy: number, rx: number, ry: number): VectorPath {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  const anchors: VectorAnchor[] = [
    { x: cx, y: cy - ry, inX: -ox, inY: 0, outX: ox, outY: 0, handleType: "mirrored" },
    { x: cx + rx, y: cy, inX: 0, inY: -oy, outX: 0, outY: oy, handleType: "mirrored" },
    { x: cx, y: cy + ry, inX: ox, inY: 0, outX: -ox, outY: 0, handleType: "mirrored" },
    { x: cx - rx, y: cy, inX: 0, inY: oy, outX: 0, outY: -oy, handleType: "mirrored" },
  ];
  return { subpaths: [{ anchors, closed: true }] };
}

function pointsToPath(raw: string, closed: boolean): VectorPath {
  const nums = raw.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
  const anchors: VectorAnchor[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) anchors.push({ x: nums[i], y: nums[i + 1], handleType: "corner" });
  return { subpaths: [{ anchors, closed }] };
}

function shapeElementToPath(el: Element): VectorPath | null {
  switch (el.tagName.toLowerCase()) {
    case "path": {
      const d = el.getAttribute("d");
      return d ? svgPathDataToPath(d) : null;
    }
    case "rect": {
      const x = num(el, "x"), y = num(el, "y"), w = num(el, "width"), h = num(el, "height");
      if (w <= 0 || h <= 0) return null;
      return { subpaths: [{ anchors: [
        { x, y, handleType: "corner" },
        { x: x + w, y, handleType: "corner" },
        { x: x + w, y: y + h, handleType: "corner" },
        { x, y: y + h, handleType: "corner" },
      ], closed: true }] };
    }
    case "circle": {
      const r = num(el, "r");
      return r > 0 ? ellipseToPath(num(el, "cx"), num(el, "cy"), r, r) : null;
    }
    case "ellipse": {
      const rx = num(el, "rx"), ry = num(el, "ry");
      return rx > 0 && ry > 0 ? ellipseToPath(num(el, "cx"), num(el, "cy"), rx, ry) : null;
    }
    case "line":
      return { subpaths: [{ anchors: [
        { x: num(el, "x1"), y: num(el, "y1"), handleType: "corner" },
        { x: num(el, "x2"), y: num(el, "y2"), handleType: "corner" },
      ], closed: false }] };
    case "polygon":
      return pointsToPath(el.getAttribute("points") ?? "", true);
    case "polyline":
      return pointsToPath(el.getAttribute("points") ?? "", false);
    default:
      return null;
  }
}

// ─── Affine transforms ────────────────────────────────────────────────────────
// A 2×3 matrix [a,b,c,d,e,f] mapping a point (x,y) → (a·x + c·y + e, b·x + d·y + f).
// Handles are RELATIVE vectors, so only the linear part [a,b,c,d] applies to them.

type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function matMul(A: Mat, B: Mat): Mat {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}

// Parse an SVG `transform` list (translate/scale/rotate/skewX/skewY/matrix), applied
// left-to-right to the coordinate system → point' = M₁·M₂·…·p.
function parseTransform(value: string | null): Mat {
  if (!value) return IDENTITY;
  let m: Mat = IDENTITY;
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const name = match[1];
    const a = match[2].match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
    let t: Mat | null = null;
    switch (name) {
      case "matrix":
        if (a.length === 6) t = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case "translate":
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case "scale":
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const rad = ((a[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const rot: Mat = [cos, sin, -sin, cos, 0, 0];
        if (a.length >= 3) {
          // rotate about (cx,cy): translate(c)·rotate·translate(-c)
          const cx = a[1], cy = a[2];
          t = matMul(matMul([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
        } else {
          t = rot;
        }
        break;
      }
      case "skewX":
        t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (t) m = matMul(m, t);
  }
  return m;
}

// Bake a matrix into a path: points by the full affine, handles by the linear part.
function applyMatrixToPath(path: VectorPath, m: Mat): void {
  const [a, b, c, d, e, f] = m;
  for (const sub of path.subpaths) {
    for (const p of sub.anchors) {
      const x = p.x, y = p.y;
      p.x = a * x + c * y + e;
      p.y = b * x + d * y + f;
      if (p.inX !== undefined || p.inY !== undefined) {
        const ix = p.inX ?? 0, iy = p.inY ?? 0;
        p.inX = a * ix + c * iy;
        p.inY = b * ix + d * iy;
      }
      if (p.outX !== undefined || p.outY !== undefined) {
        const ox = p.outX ?? 0, oy = p.outY ?? 0;
        p.outX = a * ox + c * oy;
        p.outY = b * ox + d * oy;
      }
    }
  }
}

/** Parse SVG markup into a structured, sanitized representation. */
export function parseSvg(markup: string): ImportedSvg | null {
  const svg = sanitizeSvg(markup);
  if (!svg) return null;

  let minX = 0, minY = 0, vbW = 0, vbH = 0;
  const viewBoxAttr = svg.getAttribute("viewBox");
  if (viewBoxAttr) {
    const p = viewBoxAttr.split(/[\s,]+/).map(Number);
    if (p.length === 4) { minX = p[0]; minY = p[1]; vbW = p[2]; vbH = p[3]; }
  }
  if (vbW <= 0 || vbH <= 0) {
    vbW = num(svg, "width", 0) || 100;
    vbH = num(svg, "height", 0) || 100;
    minX = 0; minY = 0;
  }

  const paths: ImportedPath[] = [];
  let counter = 0;
  const walk = (el: Element, parentMatrix: Mat, inherited: Partial<ElementStyles>): void => {
    // Accumulate this element's own transform onto the inherited one.
    const matrix = matMul(parentMatrix, parseTransform(el.getAttribute("transform")));
    // SVG presentation attributes cascade: a shape inherits fill/stroke/etc. from its
    // ancestors (e.g. a Lucide icon sets `fill="none" stroke="currentColor"` on the
    // root <svg>, not on each <path>). Merge own paint over the inherited paint;
    // `opacity` is per-element in SVG, so it never inherits.
    const own = readStyles(el);
    const cascaded: Partial<ElementStyles> = { ...inherited };
    for (const key of INHERITABLE_STYLE_KEYS) {
      const value = own[key];
      if (value !== undefined) (cascaded as Record<string, unknown>)[key] = value;
    }
    const path = shapeElementToPath(el);
    if (path && path.subpaths.some((s) => s.anchors.length > 0)) {
      applyMatrixToPath(path, matrix);
      const styles: Partial<ElementStyles> = { ...cascaded };
      if (own.opacity !== undefined) styles.opacity = own.opacity;
      // `currentColor` is kept AS-IS (svg-icons.md: icons stay tintable). Baking a
      // concrete color here would round-trip into the icon token's svg and freeze
      // it — the "icon always turns black" bug. The stage resolves it at render
      // time via a CSS color context (see ElementRenderer's path branch).
      if (styles.fillRule) path.fillRule = styles.fillRule;
      counter += 1;
      paths.push({ path, styles, name: el.getAttribute("id") || `Path ${counter}` });
    }
    for (const child of Array.from(el.children)) walk(child, matrix, cascaded);
  };
  // Seed with the viewBox origin offset so shapes normalize to a 0-based box, and
  // with the root <svg>'s own presentation attributes as the initial cascade.
  const base: Mat = [1, 0, 0, 1, -minX, -minY];
  const rootStyles = readStyles(svg);
  const rootInherited: Partial<ElementStyles> = {};
  for (const key of INHERITABLE_STYLE_KEYS) {
    const value = rootStyles[key];
    if (value !== undefined) (rootInherited as Record<string, unknown>)[key] = value;
  }
  for (const child of Array.from(svg.children)) walk(child, base, rootInherited);

  if (paths.length === 0) return null;
  return { viewBox: { width: vbW, height: vbH }, paths };
}
