import { expect, test } from "bun:test";
import type { ElementStyles } from "../types";
import {
  childZIndex,
  compileChildLayout,
  compileConstraints,
  compileContainerLayout,
  compileFlip,
  compileTextResize,
} from "../layout";

// ── display gate ──────────────────────────────────────────────────────────────

test("container layout is empty unless display is flex or grid", () => {
  expect(compileContainerLayout({})).toEqual({});
  expect(compileContainerLayout({ display: "block" })).toEqual({});
  expect(compileContainerLayout({ display: "flex" }).display).toBe("flex");
  expect(compileContainerLayout({ display: "grid" }).display).toBe("grid");
});

// ── trap #1: the 9-point pad → justify/align, mapping flips with direction ─────

test("alignX→justify-content / alignY→align-items in a ROW", () => {
  const out = compileContainerLayout({ display: "flex", flexDirection: "row", alignX: "end", alignY: "center" });
  expect(out.justifyContent).toBe("flex-end"); // main axis = horizontal
  expect(out.alignItems).toBe("center"); // cross axis = vertical
});

test("the SAME pad flips to alignY→justify / alignX→align in a COLUMN", () => {
  const out = compileContainerLayout({ display: "flex", flexDirection: "column", alignX: "end", alignY: "center" });
  expect(out.justifyContent).toBe("center"); // main axis is now vertical (alignY)
  expect(out.alignItems).toBe("flex-end"); // cross axis is now horizontal (alignX)
});

// ── trap #2: "Auto" gap = space-between and drops gap; never gap: auto ─────────

test("distribute space-between sets justify-content and removes gap", () => {
  const out = compileContainerLayout({ display: "flex", gap: 12, distribute: "space-between" });
  expect(out.justifyContent).toBe("space-between");
  expect(out.gap).toBeUndefined();
});

test("a plain gap survives when there is no distribution", () => {
  expect(compileContainerLayout({ display: "flex", gap: 12 }).gap).toBe(12);
});

// ── trap #3: Fill is grow on the main axis, stretch on the cross axis ──────────

test("Fill width in a ROW parent grows (main axis)", () => {
  const out = compileChildLayout({ widthMode: "fill" }, { parentDisplay: "flex", parentDirection: "row" });
  expect(out.flexGrow).toBe(1);
  expect(out.flexBasis).toBe(0);
  expect(out.alignSelf).toBeUndefined();
});

test("Fill width in a COLUMN parent stretches (cross axis)", () => {
  const out = compileChildLayout({ widthMode: "fill" }, { parentDisplay: "flex", parentDirection: "column" });
  expect(out.alignSelf).toBe("stretch");
  expect(out.flexGrow).toBeUndefined();
});

test("Fill height in a ROW parent stretches (cross axis)", () => {
  const out = compileChildLayout({ heightMode: "fill" }, { parentDisplay: "flex", parentDirection: "row" });
  expect(out.alignSelf).toBe("stretch");
});

// ── trap #4: Hug → fit-content, but downgrades to Fixed if a child fills ───────

test("Hug compiles to fit-content", () => {
  expect(compileChildLayout({ widthMode: "hug" }).width).toBe("fit-content");
});

test("Hug downgrades to the fixed size when a child fills that axis", () => {
  const out = compileChildLayout({ widthMode: "hug" }, {}, { hugDowngradeWidth: true });
  expect(out.width).toBeUndefined(); // caller's px size stands instead
});

// ── trap #5: wrap emits explicit align-content (no-stretch default) ────────────

test("wrap sets flex-wrap and an explicit align-content default of flex-start", () => {
  const out = compileContainerLayout({ display: "flex", flexWrap: "wrap" });
  expect(out.flexWrap).toBe("wrap");
  expect(out.alignContent).toBe("flex-start");
});

test("an explicit align-content overrides the wrap default", () => {
  expect(compileContainerLayout({ display: "flex", flexWrap: "wrap", alignContent: "space-between" }).alignContent).toBe("space-between");
});

// ── trap #6: flips compose as scaleX/Y(-1) ────────────────────────────────────

test("flips compile to scaleX/Y(-1); none → undefined", () => {
  expect(compileFlip({})).toBeUndefined();
  expect(compileFlip({ flipH: true })).toBe("scaleX(-1)");
  expect(compileFlip({ flipV: true })).toBe("scaleY(-1)");
  expect(compileFlip({ flipH: true, flipV: true })).toBe("scaleX(-1) scaleY(-1)");
});

// ── trap #7: "First on top" is reversed z-index, not flex-reverse ──────────────

test("canvas stacking first-on-top reverses z-index without touching direction", () => {
  expect(childZIndex(0, 3, "first")).toBe(2);
  expect(childZIndex(2, 3, "first")).toBe(0);
  expect(childZIndex(0, 3, "last")).toBeUndefined();
  expect(childZIndex(0, 3, undefined)).toBeUndefined();
  // direction is never reversed by stacking:
  expect(compileContainerLayout({ display: "flex", canvasStacking: "first" }).flexDirection).toBeUndefined();
});

// ── trap #8: Strokes Included → border-box ────────────────────────────────────

test("strokes included sets box-sizing border-box; excluded emits nothing", () => {
  expect(compileContainerLayout({ display: "flex", strokesIncluded: true }).boxSizing).toBe("border-box");
  expect(compileContainerLayout({ display: "flex" }).boxSizing).toBeUndefined();
});

// ── trap #9: constraints ──────────────────────────────────────────────────────

const rect = { x: 10, y: 20, width: 100, height: 50 };
const frame = { width: 400, height: 300 };

test("left/top is the default constraint", () => {
  const out = compileConstraints(rect, frame, {});
  expect(out.left).toBe(10);
  expect(out.top).toBe(20);
});

test("right pins the far edge", () => {
  const out = compileConstraints(rect, frame, { constraintH: "right" });
  expect(out.right).toBe(400 - (10 + 100)); // 290
  expect(out.left).toBeUndefined();
});

test("left-right pins both edges and leaves width auto", () => {
  const out = compileConstraints(rect, frame, { constraintH: "left-right" });
  expect(out.left).toBe(10);
  expect(out.right).toBe(290);
  expect(out.width).toBeUndefined();
});

test("center positions by percentage and translates back by half", () => {
  const out = compileConstraints(rect, frame, { constraintH: "center", constraintV: "center" });
  expect(out.left).toBe(`${((10 + 50) / 400) * 100}%`); // center x = 60 → 15%
  expect(out.top).toBe(`${((20 + 25) / 300) * 100}%`); // center y = 45 → 15%
  expect(out.transform).toBe("translate(-50%, -50%)");
});

test("a single centered axis only translates that axis", () => {
  expect(compileConstraints(rect, frame, { constraintH: "center" }).transform).toBe("translate(-50%, 0)");
});

test("scale expresses position and size as percentages", () => {
  const out = compileConstraints(rect, frame, { constraintH: "scale", constraintV: "scale" });
  expect(out.left).toBe(`${(10 / 400) * 100}%`);
  expect(out.width).toBe(`${(100 / 400) * 100}%`);
  expect(out.height).toBe(`${(50 / 300) * 100}%`);
});

// ── trap #10: text resize is its own enum ─────────────────────────────────────

test("text resize maps to the three distinct CSS shapes", () => {
  expect(compileTextResize("auto-width")).toEqual({ width: "max-content", whiteSpace: "pre" });
  expect(compileTextResize("auto-height")).toEqual({ height: "auto", whiteSpace: "normal" });
  expect(compileTextResize("fixed")).toEqual({ overflow: "hidden" });
  expect(compileTextResize(undefined)).toEqual({});
});

// ── grid ──────────────────────────────────────────────────────────────────────

test("grid tracks compile fr / px / auto / min-content", () => {
  const out = compileContainerLayout({
    display: "grid",
    gridColumns: [
      { kind: "fill" },
      { kind: "fill", value: 2 },
      { kind: "fixed", value: 80 },
      { kind: "auto" },
      { kind: "min" },
    ],
  });
  expect(out.gridTemplateColumns).toBe("1fr 2fr 80px auto min-content");
});

test("grid child span and cell alignment", () => {
  const out = compileChildLayout(
    { gridColumnSpan: 2, gridRowSpan: 3, justifySelf: "center", alignSelf: "end" },
    { parentDisplay: "grid" },
  );
  expect(out.gridColumn).toBe("span 2");
  expect(out.gridRow).toBe("span 3");
  expect(out.justifySelf).toBe("center");
  expect(out.alignSelf).toBe("flex-end");
});

// ── padding: individual longhands override the uniform value ───────────────────

test("individual padding falls back to the uniform value per side", () => {
  const out = compileContainerLayout({ display: "flex", padding: 8, paddingTop: 20 });
  expect(out.paddingTop).toBe(20);
  expect(out.paddingRight).toBe(8);
  expect(out.paddingBottom).toBe(8);
  expect(out.paddingLeft).toBe(8);
  expect(out.padding).toBeUndefined();
});

test("a uniform padding alone compiles to the shorthand", () => {
  const out = compileContainerLayout({ display: "flex", padding: 8 });
  expect(out.padding).toBe(8);
  expect(out.paddingTop).toBeUndefined();
});

// ── min/max clamps stack on the sizing mode ───────────────────────────────────

test("min/max sizes pass through (and scale)", () => {
  const styles: ElementStyles = { widthMode: "fill", maxWidth: 720, minHeight: 64 };
  const out = compileChildLayout(styles, { parentDisplay: "flex", parentDirection: "row", renderScale: 2 });
  expect(out.flexGrow).toBe(1); // sizing mode still applies
  expect(out.maxWidth).toBe(1440); // clamp stacks on top, scaled
  expect(out.minHeight).toBe(128);
});

// ── renderScale ───────────────────────────────────────────────────────────────

test("gaps and padding scale with renderScale", () => {
  const out = compileContainerLayout({ display: "flex", gap: 10, padding: 4 }, 2);
  expect(out.gap).toBe(20);
  expect(out.padding).toBe(8);
});

// ── alignSelf override wins over a Fill stretch ────────────────────────────────

test("an explicit align-self overrides the cross-axis Fill stretch", () => {
  const out = compileChildLayout(
    { heightMode: "fill", alignSelf: "center" },
    { parentDisplay: "flex", parentDirection: "row" },
  );
  expect(out.alignSelf).toBe("center");
});

// ── baseline is row-only ───────────────────────────────────────────────────────

test("baseline aligns items in a row but is ignored in a column", () => {
  expect(compileContainerLayout({ display: "flex", flexDirection: "row", baseline: true }).alignItems).toBe("baseline");
  expect(compileContainerLayout({ display: "flex", flexDirection: "column", baseline: true, alignX: "center" }).alignItems).toBe("center");
});
