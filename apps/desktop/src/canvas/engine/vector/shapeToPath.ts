// Convert a primitive shape element (rect/ellipse/polygon/star/line/arrow) into a
// VectorPath in its own local box space (0..width, 0..height). Used by the "Flatten
// to path" inspector action and by SVG import. Pure.

import type { ElementNode, VectorAnchor, VectorPath } from "../types";

const KAPPA = 0.5522847498307936;

function rectPath(w: number, h: number): VectorPath {
  const anchors: VectorAnchor[] = [
    { x: 0, y: 0, handleType: "corner" },
    { x: w, y: 0, handleType: "corner" },
    { x: w, y: h, handleType: "corner" },
    { x: 0, y: h, handleType: "corner" },
  ];
  return { subpaths: [{ anchors, closed: true }] };
}

// 4-segment cubic ellipse inscribed in the box.
function ellipsePath(w: number, h: number): VectorPath {
  const rx = w / 2;
  const ry = h / 2;
  const cx = rx;
  const cy = ry;
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  const anchors: VectorAnchor[] = [
    { x: cx, y: 0, inX: -ox, inY: 0, outX: ox, outY: 0, handleType: "mirrored" },
    { x: w, y: cy, inX: 0, inY: -oy, outX: 0, outY: oy, handleType: "mirrored" },
    { x: cx, y: h, inX: ox, inY: 0, outX: -ox, outY: 0, handleType: "mirrored" },
    { x: 0, y: cy, inX: 0, inY: oy, outX: 0, outY: -oy, handleType: "mirrored" },
  ];
  return { subpaths: [{ anchors, closed: true }] };
}

function regularPolygonPath(w: number, h: number, sides: number): VectorPath {
  const cx = w / 2;
  const cy = h / 2;
  const anchors: VectorAnchor[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * 2 * Math.PI - Math.PI / 2;
    anchors.push({ x: cx + cx * Math.cos(angle), y: cy + cy * Math.sin(angle), handleType: "corner" });
  }
  return { subpaths: [{ anchors, closed: true }] };
}

function starPath(w: number, h: number, innerPercent: number): VectorPath {
  const points = 5;
  const cx = w / 2;
  const cy = h / 2;
  const outerX = w / 2;
  const outerY = h / 2;
  const inner = Math.max(1, Math.min(49, innerPercent)) / 50;
  const anchors: VectorAnchor[] = [];
  const step = Math.PI / points;
  for (let i = 0; i < 2 * points; i++) {
    const rxScale = i % 2 === 0 ? 1 : inner;
    const angle = i * step - Math.PI / 2;
    anchors.push({ x: cx + outerX * rxScale * Math.cos(angle), y: cy + outerY * rxScale * Math.sin(angle), handleType: "corner" });
  }
  return { subpaths: [{ anchors, closed: true }] };
}

/** True if this element type can be flattened into a path. */
export function canFlattenToPath(type: ElementNode["type"]): boolean {
  return type === "rect" || type === "ellipse" || type === "polygon" || type === "star" || type === "line" || type === "arrow";
}

/** Build a VectorPath (local box space) for a shape element. Returns null if unsupported. */
export function shapeToPath(node: ElementNode): VectorPath | null {
  const w = node.width;
  const h = node.height;
  switch (node.type) {
    case "rect":
      return rectPath(w, h);
    case "ellipse":
      return ellipsePath(w, h);
    case "polygon":
      return regularPolygonPath(w, h, 5);
    case "star":
      return starPath(w, h, node.styles.borderRadius ?? 22.49);
    case "line":
      return { subpaths: [{ anchors: [{ x: 0, y: h / 2, handleType: "corner" }, { x: w, y: h / 2, handleType: "corner" }], closed: false }] };
    case "arrow":
      return { subpaths: [{ anchors: [{ x: 0, y: h / 2, handleType: "corner" }, { x: w, y: h / 2, handleType: "corner" }], closed: false }] };
    default:
      return null;
  }
}
