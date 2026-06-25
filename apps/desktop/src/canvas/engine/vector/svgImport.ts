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

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  if (v === null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
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
  if (stroke !== null && stroke !== "none") styles.stroke = stroke;
  const sw = get("stroke-width");
  if (sw !== null) styles.strokeWidth = parseFloat(sw) || 0;
  const fo = get("fill-opacity");
  if (fo !== null) styles.fillOpacity = parseFloat(fo);
  const so = get("stroke-opacity");
  if (so !== null) styles.strokeOpacity = parseFloat(so);
  const fr = get("fill-rule");
  if (fr === "evenodd" || fr === "nonzero") styles.fillRule = fr;
  const lc = get("stroke-linecap");
  if (lc === "butt" || lc === "round" || lc === "square") styles.strokeLinecap = lc;
  const lj = get("stroke-linejoin");
  if (lj === "miter" || lj === "round" || lj === "bevel") styles.strokeLinejoin = lj;
  const da = get("stroke-dasharray");
  if (da !== null && da !== "none") styles.strokeDasharray = da;
  const op = get("opacity");
  if (op !== null) styles.opacity = parseFloat(op);
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

function translatePath(path: VectorPath, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const sub of path.subpaths) for (const a of sub.anchors) { a.x += dx; a.y += dy; }
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
  const walk = (el: Element): void => {
    const path = shapeElementToPath(el);
    if (path && path.subpaths.some((s) => s.anchors.length > 0)) {
      translatePath(path, -minX, -minY);
      const styles = readStyles(el);
      if (styles.fillRule) path.fillRule = styles.fillRule;
      counter += 1;
      paths.push({ path, styles, name: el.getAttribute("id") || `Path ${counter}` });
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  for (const child of Array.from(svg.children)) walk(child);

  if (paths.length === 0) return null;
  return { viewBox: { width: vbW, height: vbH }, paths };
}
