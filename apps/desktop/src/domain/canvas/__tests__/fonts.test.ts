import { describe, expect, it } from "bun:test";
import {
  DEFAULT_FONT_STACK,
  findFontFamily,
  fontFamilyGroups,
  mergeFontFamilies,
  nearestWeight,
  primaryFamilyOf,
  STANDARD_FONT_FAMILIES,
  STANDARD_WEIGHTS,
  toFontFamily,
  weightLabel,
  weightsForStack,
} from "../fonts";

const helvetica = toFontFamily({
  family: "Helvetica Neue",
  weights: [300, 400, 700],
  italic: true,
  monospaced: false,
});

describe("primaryFamilyOf", () => {
  it("reads the first family, unquoted", () => {
    expect(primaryFamilyOf("'Geist Variable', system-ui, sans-serif")).toBe("Geist Variable");
    expect(primaryFamilyOf('"Helvetica Neue", sans-serif')).toBe("Helvetica Neue");
    expect(primaryFamilyOf("Inter, system-ui, sans-serif")).toBe("Inter");
    expect(primaryFamilyOf("system-ui")).toBe("system-ui");
  });
});

describe("toFontFamily", () => {
  it("quotes multi-word families only when they are not bare identifiers", () => {
    expect(helvetica.stack).toBe("Helvetica Neue, sans-serif");
    expect(toFontFamily({ family: "PT Sans", weights: [400], italic: false, monospaced: false }).stack)
      .toBe("PT Sans, sans-serif");
    expect(toFontFamily({ family: "Yu Gothic 4", weights: [400], italic: false, monospaced: false }).stack)
      .toBe("'Yu Gothic 4', sans-serif");
  });

  it("falls back to a monospace generic for fixed-pitch families", () => {
    const mono = toFontFamily({ family: "Menlo", weights: [400], italic: false, monospaced: true });
    expect(mono.stack).toBe("Menlo, monospace");
  });

  it("sorts weights and never leaves a family weightless", () => {
    const messy = toFontFamily({ family: "Ugly", weights: [700, 100, 400], italic: false, monospaced: false });
    expect(messy.weights).toEqual([100, 400, 700]);
    expect(toFontFamily({ family: "Bare", weights: [], italic: false, monospaced: false }).weights).toEqual([400]);
  });
});

describe("mergeFontFamilies", () => {
  it("keeps the standard stacks first and drops installed duplicates of them", () => {
    const installedInter = toFontFamily({ family: "inter", weights: [400], italic: false, monospaced: false });
    const merged = mergeFontFamilies([installedInter, helvetica]);
    expect(merged.slice(0, STANDARD_FONT_FAMILIES.length)).toEqual([...STANDARD_FONT_FAMILIES]);
    expect(merged.filter((font) => font.family.toLowerCase() === "inter")).toHaveLength(1);
    expect(merged.at(-1)?.family).toBe("Helvetica Neue");
  });
});

describe("findFontFamily / weightsForStack", () => {
  const families = mergeFontFamilies([helvetica]);

  it("matches a stored stack by its first family", () => {
    expect(findFontFamily(families, "Helvetica Neue, sans-serif")?.family).toBe("Helvetica Neue");
    // Same family, a stack the catalog never wrote.
    expect(findFontFamily(families, "'Helvetica Neue', Arial")?.family).toBe("Helvetica Neue");
    expect(findFontFamily(families, "Comic Sans MS")).toBeUndefined();
    expect(findFontFamily(families, undefined)).toBeUndefined();
  });

  it("offers the family's own weights, or all nine when the family is unknown", () => {
    expect(weightsForStack(families, "Helvetica Neue, sans-serif")).toEqual([300, 400, 700]);
    expect(weightsForStack(families, "Comic Sans MS")).toEqual(STANDARD_WEIGHTS);
    expect(weightsForStack(families, DEFAULT_FONT_STACK)).toEqual(STANDARD_WEIGHTS);
  });
});

describe("nearestWeight", () => {
  it("snaps to the closest available weight, ties going lighter", () => {
    expect(nearestWeight([300, 400, 700], 600)).toBe(700);
    expect(nearestWeight([300, 400, 700], 400)).toBe(400);
    expect(nearestWeight([300, 700], 500)).toBe(300);
    expect(nearestWeight([], 550)).toBe(550);
  });
});

describe("weightLabel", () => {
  it("names the nine steps and passes off-step variable weights through", () => {
    expect(weightLabel(400)).toBe("Regular");
    expect(weightLabel(600)).toBe("Semibold");
    expect(weightLabel(450)).toBe("450");
  });
});

describe("fontFamilyGroups", () => {
  const families = mergeFontFamilies([helvetica]);

  it("splits standard from installed", () => {
    const groups = fontFamilyGroups(families, DEFAULT_FONT_STACK);
    expect(groups.map((g) => g.label)).toEqual(["Standard", "Installed"]);
    expect(groups[1].options).toEqual([{ label: "Helvetica Neue", value: "Helvetica Neue, sans-serif" }]);
  });

  it("omits the Installed group before enumeration lands", () => {
    expect(fontFamilyGroups(STANDARD_FONT_FAMILIES, DEFAULT_FONT_STACK).map((g) => g.label)).toEqual(["Standard"]);
  });

  it("surfaces an unrecognized stored stack as a Current entry so it is never silently dropped", () => {
    const groups = fontFamilyGroups(families, "'Comic Sans MS', cursive");
    expect(groups[0]).toEqual({
      label: "Current",
      options: [{ label: "Comic Sans MS", value: "'Comic Sans MS', cursive" }],
    });
  });
});
