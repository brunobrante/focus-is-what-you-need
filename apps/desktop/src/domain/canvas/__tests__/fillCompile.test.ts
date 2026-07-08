import { expect, test } from "bun:test";
import type { Fill, GradientFill, ImageFill, SolidFill } from "../fill";
import {
  fillsFallbackColor,
  fillsToWritePatch,
  normalizeFills,
  synthImageFill,
  synthSolidFill,
} from "../fill";
import { adjustmentsToFilter, compileFills, gradientToCss, fillTargetForType } from "../fillCompile";

const solid = (over: Partial<SolidFill> = {}): SolidFill => ({ id: "s", type: "solid", color: "#112233", ...over });
const gradient = (over: Partial<GradientFill> = {}): GradientFill => ({
  id: "g",
  type: "gradient",
  kind: "linear",
  angle: 90,
  interpolation: "srgb",
  stops: [
    { color: "#000000", position: 0 },
    { color: "#FFFFFF", position: 1 },
  ],
  ...over,
});
const image = (over: Partial<ImageFill> = {}): ImageFill => ({ id: "i", type: "image", src: "a.png", fit: "fill", ...over });

// ── target mapping ────────────────────────────────────────────────────────────

test("fillTargetForType: lines/arrows/paths take no fill", () => {
  expect(fillTargetForType("rect")).toBe("box");
  expect(fillTargetForType("ellipse")).toBe("box");
  expect(fillTargetForType("star")).toBe("box");
  expect(fillTargetForType("text")).toBe("text");
  expect(fillTargetForType("image")).toBe("image");
  expect(fillTargetForType("line")).toBeNull();
  expect(fillTargetForType("arrow")).toBeNull();
  expect(fillTargetForType("path")).toBeNull();
  expect(fillTargetForType("svg")).toBeNull();
});

// ── gradient string ───────────────────────────────────────────────────────────

test("gradientToCss: sRGB linear emits no interpolation clause", () => {
  expect(gradientToCss(gradient(), 1)).toBe("linear-gradient(90deg, #000000 0%, #FFFFFF 100%)");
});

test("gradientToCss: oklch + nearest hue clauses", () => {
  expect(gradientToCss(gradient({ interpolation: "oklch" }), 1)).toContain("in oklch,");
  expect(gradientToCss(gradient({ interpolation: "oklch-shorter" }), 1)).toContain("in oklch shorter hue,");
});

test("gradientToCss: radial + conic heads", () => {
  expect(gradientToCss(gradient({ kind: "radial" }), 1)).toStartWith("radial-gradient(");
  expect(gradientToCss(gradient({ kind: "conic", angle: 45 }), 1)).toContain("conic-gradient(from 45deg");
});

test("gradientToCss: a bound gradient uses the resolved token verbatim", () => {
  const resolved = gradientToCss(gradient({ gradientRef: "gradients:g1" }), 1, () => "linear-gradient(0deg, red, blue)");
  expect(resolved).toBe("linear-gradient(0deg, red, blue)");
});

test("gradientToCss: layer opacity wraps each stop in color-mix", () => {
  expect(gradientToCss(gradient(), 0.5)).toContain("color-mix(in srgb, #000000 50%, transparent)");
});

// ── box compilation ───────────────────────────────────────────────────────────

test("compileFills: empty / disabled → no fills", () => {
  expect(compileFills(undefined, "box").hasFills).toBe(false);
  expect(compileFills([], "box").hasFills).toBe(false);
  expect(compileFills([solid({ enabled: false })], "box").hasFills).toBe(false);
});

test("compileFills: a single solid box layer is a degenerate gradient", () => {
  const out = compileFills([solid()], "box");
  expect(out.hasFills).toBe(true);
  expect(out.style.backgroundImage).toBe("linear-gradient(#112233, #112233)");
  expect(out.style.backgroundColor).toBe("transparent");
});

test("compileFills: stacked fills produce comma layers + blend list", () => {
  const out = compileFills([solid({ blendMode: "multiply" }), gradient()], "box");
  expect(out.style.backgroundImage?.split(", url").length).toBeGreaterThan(0);
  expect(out.style.backgroundImage).toContain("linear-gradient(#112233, #112233)");
  expect(out.style.backgroundImage).toContain("linear-gradient(90deg");
  expect(out.style.backgroundBlendMode).toBe("multiply, normal");
});

test("compileFills: image box layer repeats only when tiling", () => {
  expect(compileFills([image({ fit: "fill" })], "box").style.backgroundRepeat).toBe("no-repeat");
  expect(compileFills([image({ fit: "tile" })], "box").style.backgroundRepeat).toBe("repeat");
  expect(compileFills([image({ fit: "fill" })], "box").style.backgroundSize).toBe("cover");
  expect(compileFills([image({ fit: "fit" })], "box").style.backgroundSize).toBe("contain");
});

test("compileFills: text target clips the paint to the glyphs", () => {
  const out = compileFills([gradient()], "text");
  expect(out.style.backgroundClip).toBe("text");
  expect(out.style.WebkitTextFillColor).toBe("transparent");
});

test("compileFills: exact-gap tile becomes an SVG pattern overlay", () => {
  const out = compileFills([image({ fit: "tile", tileGap: 12, scale: 40 })], "box", undefined, "el1");
  expect(out.patternLayer).toBeTruthy();
  expect(out.patternLayer?.gap).toBe(12);
  expect(out.patternLayer?.motif).toBe(40);
});

// ── image element render path ─────────────────────────────────────────────────

test("compileFills: image element renders an <img> for fill/fit/crop", () => {
  const out = compileFills([image({ fit: "crop" })], "image");
  expect(out.imageRender?.mode).toBe("img");
  if (out.imageRender?.mode === "img") {
    expect(out.imageRender.src).toBe("a.png");
    expect(out.imageRender.objectFit).toBe("none");
  }
});

test("compileFills: image element tiles via a background div, never an <img>", () => {
  const out = compileFills([image({ fit: "tile" })], "image");
  expect(out.imageRender?.mode).toBe("background");
});

test("compileFills: a video fill renders as <video>", () => {
  const out = compileFills([{ id: "v", type: "video", src: "v.mp4", fit: "fill" }], "image");
  expect(out.imageRender?.mode).toBe("video");
});

test("compileFills: image adjustments emit an SVG filter for temp/tint", () => {
  const out = compileFills([image({ adjustments: { temperature: 30 } })], "image", undefined, "el2");
  expect(out.filterDefs.length).toBe(1);
  expect(out.imageRender?.mode).toBe("img");
  if (out.imageRender?.mode === "img") expect(out.imageRender.filter).toContain("url(#el2-adj)");
});

test("adjustmentsToFilter: clean multipliers map to CSS filter functions", () => {
  expect(adjustmentsToFilter({ exposure: 1.2, contrast: 0.9 }, undefined)).toBe("brightness(1.2) contrast(0.9)");
  expect(adjustmentsToFilter({ saturation: 1 }, undefined)).toBeUndefined();
});

// ── normalize / write-patch round-trip ────────────────────────────────────────

test("normalizeFills: synthesizes a solid from background when no fills", () => {
  const fills = normalizeFills({ type: "rect", background: "#abcdef" });
  expect(fills).toEqual([synthSolidFill("#abcdef", undefined)]);
});

test("normalizeFills: synthesizes an image fill for the image element", () => {
  const fills = normalizeFills({ type: "image", src: "p.png", objectFit: "contain" });
  expect(fills).toEqual([synthImageFill("p.png", "contain")]);
  expect((fills[0] as ImageFill).fit).toBe("fit");
});

test("normalizeFills: a defined empty list is the explicit no-fill state, not a phantom (M11)", () => {
  // An element that once had a background but now carries `fills: []` must read
  // back as empty — the panel shows an Add button, not a resurrected white solid.
  expect(normalizeFills({ type: "rect", fills: [], background: "#abcdef" })).toEqual([]);
  expect(normalizeFills({ type: "image", fills: [], src: "p.png" })).toEqual([]);
  expect(normalizeFills({ type: "text", fills: [], color: "#00ff00" })).toEqual([]);
});

test("compileFills: an explicit empty list is cleared (paints nothing), absent is legacy (M11)", () => {
  expect(compileFills([], "box").cleared).toBe(true);
  expect(compileFills([], "box").hasFills).toBe(false);
  expect(compileFills(undefined, "box").cleared).toBeUndefined();
});

test("fillsToWritePatch: a single plain solid collapses back to background", () => {
  const patch = fillsToWritePatch([solid({ color: "#ff0000", colorRef: "colors:c1" })], "rect");
  expect(patch.fills).toBeUndefined();
  expect(patch.background).toBe("#ff0000");
  expect(patch.backgroundRef).toBe("colors:c1");
});

test("fillsToWritePatch: a text single solid collapses to color, not background (M12)", () => {
  const patch = fillsToWritePatch([solid({ color: "#ff0000", colorRef: "colors:c1" })], "text");
  expect(patch.fills).toBeUndefined();
  expect(patch.color).toBe("#ff0000");
  expect(patch.colorRef).toBe("colors:c1");
  expect(patch.background).toBeUndefined();
  expect(patch.backgroundRef).toBeUndefined();
});

test("normalizeFills: a text solid reads back from color, not background (M12)", () => {
  const fills = normalizeFills({ type: "text", color: "#00ff00", colorRef: "colors:c2" });
  expect(fills).toEqual([synthSolidFill("#00ff00", "colors:c2")]);
});

test("fillsToWritePatch: a plain image collapses back to src + objectFit", () => {
  const patch = fillsToWritePatch([image({ src: "x.png", fit: "fit" })], "image");
  expect(patch.fills).toBeUndefined();
  expect(patch.src).toBe("x.png");
  expect(patch.objectFit).toBe("contain");
});

test("fillsToWritePatch: stacked / non-trivial fills are stored with a fallback color", () => {
  const fills: Fill[] = [gradient(), solid({ color: "#222222" })];
  const patch = fillsToWritePatch(fills, "rect");
  expect(patch.fills).toBe(fills);
  expect(patch.background).toBe("#222222"); // bottom-most solid
});

test("fillsToWritePatch: a tiled image does not collapse", () => {
  const patch = fillsToWritePatch([image({ fit: "tile" })], "image");
  expect(patch.fills).toBeTruthy();
});

test("fillsFallbackColor: prefers the bottom solid, else first gradient stop", () => {
  expect(fillsFallbackColor([gradient(), solid({ color: "#0a0a0a" })])).toBe("#0a0a0a");
  expect(fillsFallbackColor([gradient({ stops: [{ color: "#777777", position: 0 }, { color: "#fff", position: 1 }] })])).toBe(
    "#777777",
  );
  expect(fillsFallbackColor([image()])).toBeUndefined();
});
