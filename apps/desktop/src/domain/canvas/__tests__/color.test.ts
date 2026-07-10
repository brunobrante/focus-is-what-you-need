import { describe, expect, it } from "bun:test";
import { hsvToRgb, parseCssColor, parseHexColor, rgbToHsv, rgbaToHex } from "../color";

describe("parseHexColor", () => {
  it("expands short hex", () => {
    expect(parseHexColor("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseHexColor("#f008")).toEqual({ r: 255, g: 0, b: 0, a: 136 / 255 });
  });

  it("reads the alpha channel of an 8-digit hex", () => {
    expect(parseHexColor("#0D99FF80")).toEqual({ r: 13, g: 153, b: 255, a: 128 / 255 });
  });

  it("rejects non-hex literals", () => {
    expect(parseHexColor("red")).toBeNull();
    expect(parseHexColor("#red")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
  });
});

describe("parseCssColor", () => {
  it("reads rgb() and rgba(), comma or slash separated", () => {
    expect(parseCssColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseCssColor("rgba(1,2,3,0.5)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseCssColor("rgb(1 2 3 / 50%)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
  });

  it("returns null for wide-gamut literals it cannot represent", () => {
    expect(parseCssColor("color(display-p3 1 0 0)")).toBeNull();
    expect(parseCssColor("oklch(0.7 0.1 200)")).toBeNull();
  });
});

describe("rgbaToHex", () => {
  it("drops the alpha byte when opaque", () => {
    expect(rgbaToHex({ r: 13, g: 153, b: 255, a: 1 })).toBe("#0D99FF");
  });

  it("appends the alpha byte otherwise", () => {
    expect(rgbaToHex({ r: 0, g: 0, b: 0, a: 0 })).toBe("#00000000");
    expect(rgbaToHex({ r: 255, g: 255, b: 255, a: 0.5 })).toBe("#FFFFFF80");
  });
});

describe("hsv round-trip", () => {
  it("preserves the rgb triple", () => {
    for (const rgb of [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 13, g: 153, b: 255 },
      { r: 120, g: 200, b: 40 },
    ]) {
      expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
    }
  });

  it("maps the primaries onto hue sectors", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 }).h).toBe(0);
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBe(120);
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBe(240);
  });

  it("wraps hue 360 back to red", () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 });
  });
});
