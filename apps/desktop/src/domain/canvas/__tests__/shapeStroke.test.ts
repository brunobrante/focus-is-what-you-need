import { expect, test } from "bun:test";

import { compileBorder, compileShapeStroke, hasPerSideWidths } from "@/domain/canvas/border";
import { shapeClipPath, shapeOutline, shapeOutlinePathData } from "@/domain/canvas/shapeGeometry";
import { pathIsClosed } from "@/domain/canvas/vector";

// ─── Shape geometry: the clip-path and the stroke path must trace one outline ──

test("clip-path and SVG path data are two serializations of the same outline", () => {
  const outline = shapeOutline("polygon");
  expect(outline).not.toBeNull();
  expect(outline).toHaveLength(5);

  // A 100×100 box makes the unit points and the percentages numerically equal.
  const clip = shapeClipPath("polygon");
  const d = shapeOutlinePathData(outline!, 100, 100);

  const clipPoints = clip!
    .replace(/^polygon\(|\)$/g, "")
    .split(", ")
    .map((pair) => pair.split(" ").map((v) => Number.parseFloat(v)));
  const pathPoints = d
    .replace(/Z$/, "")
    .split(" ")
    .map((v) => Number.parseFloat(v.replace(/^[ML]/, "")));

  expect(clipPoints[0][0]).toBeCloseTo(pathPoints[0], 3);
  expect(clipPoints[0][1]).toBeCloseTo(pathPoints[1], 3);
  // The apex of a 5-gon sits at the top-center of the box.
  expect(clipPoints[0]).toEqual([50, 0]);
});

test("the arrow outline is the 7-point block arrow, not a bare line", () => {
  // shapeToPath() (flatten-to-path) returns a two-anchor LINE for an arrow, which
  // is NOT the rendered silhouette. The stroke must trace what is actually drawn.
  const outline = shapeOutline("arrow");
  expect(outline).toHaveLength(7);
  expect(shapeClipPath("arrow")).toBe(
    "polygon(0% 30%, 65% 30%, 65% 0%, 100% 50%, 65% 100%, 65% 70%, 0% 70%)",
  );
});

test("star inner radius is authored as a percent of the box and clamped", () => {
  const wide = shapeOutline("star", 49);
  const narrow = shapeOutline("star", 5);
  expect(wide).toHaveLength(10);
  // Index 1 is an inner vertex; a bigger inner percent pushes it further from center.
  const distance = (p: { x: number; y: number }) => Math.hypot(p.x - 0.5, p.y - 0.5);
  expect(distance(wide![1])).toBeGreaterThan(distance(narrow![1]));

  // Out-of-range values clamp rather than inverting the star.
  expect(shapeOutline("star", 900)).toEqual(shapeOutline("star", 49));
  expect(shapeOutline("star", -5)).toEqual(shapeOutline("star", 1));
});

test("box types have no outline", () => {
  expect(shapeOutline("rect")).toBeNull();
  expect(shapeOutline("ellipse")).toBeNull();
  expect(shapeClipPath("rect")).toBeUndefined();
});

test("path data scales the unit outline into the box's own user units", () => {
  const d = shapeOutlinePathData(shapeOutline("arrow")!, 200, 50);
  expect(d.startsWith("M0 15")).toBe(true);
  expect(d.endsWith("Z")).toBe(true);
  expect(d).toContain("L200 25"); // the tip, at 100% × 50%
});

// ─── compileShapeStroke: SVG strokes are centered, so inside/outside double up ──

test("no stroke without a border width", () => {
  expect(compileShapeStroke({})).toBeNull();
  expect(compileShapeStroke({ borderWidth: 0, borderColor: "#f00" })).toBeNull();
});

test("inside and outside draw at double width; center draws at the authored width", () => {
  expect(compileShapeStroke({ borderWidth: 4, borderAlign: "inside" })?.strokeWidth).toBe(8);
  expect(compileShapeStroke({ borderWidth: 4, borderAlign: "outside" })?.strokeWidth).toBe(8);
  expect(compileShapeStroke({ borderWidth: 4, borderAlign: "center" })?.strokeWidth).toBe(4);
  // Inside is the default, matching the box border.
  expect(compileShapeStroke({ borderWidth: 4 })?.align).toBe("inside");
});

test("a bound border color token wins over the literal", () => {
  const stroke = compileShapeStroke(
    { borderWidth: 1, borderColor: "#000000", borderColorRef: "colors:c-primary" },
    (ref) => (ref === "colors:c-primary" ? "#ff0000" : undefined),
  );
  expect(stroke?.stroke).toBe("#ff0000");
});

test("border-style becomes a dash pattern scaled to the AUTHORED width", () => {
  // Scaling to the doubled width would make an inside dash read twice as long as
  // the same dash on a rect.
  const dashed = compileShapeStroke({ borderWidth: 2, borderAlign: "inside", borderStyle: "dashed" });
  expect(dashed?.strokeDasharray).toBe("6 4");

  const dotted = compileShapeStroke({ borderWidth: 2, borderStyle: "dotted" });
  expect(dotted?.strokeDasharray).toBe("0 4");
  expect(dotted?.strokeLinecap).toBe("round");

  // `double` has no single-stroke equivalent — fall back to solid, don't invent one.
  expect(compileShapeStroke({ borderWidth: 2, borderStyle: "double" })?.strokeDasharray).toBeUndefined();
  expect(compileShapeStroke({ borderWidth: 2, borderStyle: "solid" })?.strokeDasharray).toBeUndefined();
});

// ─── compileBorder: Center alignment on a plain box (F3) ──────────────────────

test("box Center is an outline inset by half its width", () => {
  const compiled = compileBorder({ borderWidth: 6, borderColor: "#123456", borderAlign: "center" }, "box");
  expect(compiled.outlineWidth).toBe(6);
  expect(compiled.outlineOffset).toBe(-3);
  expect(compiled.outlineColor).toBe("#123456");
  // Never a CSS border — that would shift the content box.
  expect(compiled.borderWidth).toBeUndefined();
});

test("box Outside keeps a zero offset; Inside stays a real border", () => {
  const outside = compileBorder({ borderWidth: 6, borderAlign: "outside" }, "box");
  expect(outside.outlineOffset).toBe(0);

  const inside = compileBorder({ borderWidth: 6, borderAlign: "inside" }, "box");
  expect(inside.borderWidth).toBe(6);
  expect(inside.outlineWidth).toBeUndefined();
});

test("Center's inset scales with the render scale, like every other px length", () => {
  const compiled = compileBorder({ borderWidth: 6, borderAlign: "center" }, "box", 2);
  expect(compiled.outlineWidth).toBe(12);
  expect(compiled.outlineOffset).toBe(-6);
});

// ─── Per-side borders (G13) ──────────────────────────────────────────────────

test("per-side widths compile to border-*-width longhands", () => {
  const compiled = compileBorder(
    { borderWidths: [1, 2, 3, 4], borderColor: "#abcdef", borderStyle: "dashed" },
    "box",
  );
  expect(compiled.borderTopWidth).toBe(1);
  expect(compiled.borderRightWidth).toBe(2);
  expect(compiled.borderBottomWidth).toBe(3);
  expect(compiled.borderLeftWidth).toBe(4);
  expect(compiled.borderColor).toBe("#abcdef");
  expect(compiled.borderStyle).toBe("dashed");
  // Never the uniform shorthand — it would override the longhands.
  expect(compiled.borderWidth).toBeUndefined();
});

test("a bottom-only divider is a per-side border with a zero uniform width", () => {
  const compiled = compileBorder({ borderWidth: 0, borderWidths: [0, 0, 1, 0] }, "box");
  expect(compiled.borderBottomWidth).toBe(1);
  expect(compiled.borderTopWidth).toBe(0);
  expect(compiled.borderStyle).toBe("solid");
});

test("per-side always draws Inside — alignment is ignored, never emitted as an outline", () => {
  const compiled = compileBorder(
    { borderWidth: 2, borderWidths: [2, 0, 0, 0], borderAlign: "outside" },
    "box",
  );
  expect(compiled.borderTopWidth).toBe(2);
  expect(compiled.outlineWidth).toBeUndefined();
});

test("per-side widths scale with the render scale", () => {
  const compiled = compileBorder({ borderWidths: [1, 2, 3, 4] }, "box", 3);
  expect(compiled.borderTopWidth).toBe(3);
  expect(compiled.borderLeftWidth).toBe(12);
});

test("hasPerSideWidths distinguishes an all-zero list from no list at all", () => {
  expect(hasPerSideWidths({ borderWidths: [0, 0, 0, 0] })).toBe(true);
  expect(hasPerSideWidths({ borderWidth: 4 })).toBe(false);
  expect(hasPerSideWidths({})).toBe(false);
});

test("clip-path shapes ignore per-side widths — one outline has no sides", () => {
  const stroke = compileShapeStroke({ borderWidth: 2, borderWidths: [9, 9, 9, 9] });
  expect(stroke?.strokeWidth).toBe(4); // 2 × the uniform width, doubled for Inside
});

// ─── pathIsClosed: which vector paths can carry a stroke alignment (F3) ───────

const anchor = (x: number, y: number) => ({ x, y, handleType: "corner" as const });

test("only a path whose every subpath closes has an interior to align against", () => {
  expect(pathIsClosed({ subpaths: [{ anchors: [anchor(0, 0), anchor(1, 1)], closed: true }] })).toBe(true);
  expect(pathIsClosed({ subpaths: [{ anchors: [anchor(0, 0), anchor(1, 1)], closed: false }] })).toBe(false);

  // One open subpath is enough to make the whole path's interior ill-defined.
  expect(
    pathIsClosed({
      subpaths: [
        { anchors: [anchor(0, 0), anchor(1, 1)], closed: true },
        { anchors: [anchor(2, 2), anchor(3, 3)], closed: false },
      ],
    }),
  ).toBe(false);
});

test("degenerate paths are not closed", () => {
  expect(pathIsClosed(undefined)).toBe(false);
  expect(pathIsClosed({ subpaths: [] })).toBe(false);
  // A "closed" single anchor encloses nothing.
  expect(pathIsClosed({ subpaths: [{ anchors: [anchor(0, 0)], closed: true }] })).toBe(false);
});
