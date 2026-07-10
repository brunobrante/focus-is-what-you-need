// Color literals and the conversions the color picker needs. Pure, no I/O.
//
// The canonical literal the inspector writes is hex: `#RRGGBB` when opaque and
// `#RRGGBBAA` when translucent. Everything that reads a color (CSS, Skia paints)
// must therefore understand the 8-digit form.

export type Rgba = {
  /** 0–255 */
  r: number;
  /** 0–255 */
  g: number;
  /** 0–255 */
  b: number;
  /** 0–1 */
  a: number;
};

export type Hsv = {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Parses `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`. Returns null for anything else. */
export function parseHexColor(input: string): Rgba | null {
  const raw = input.trim();
  if (!HEX_RE.test(raw)) return null;
  const body = raw.slice(1);
  const hex =
    body.length <= 4
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

/** Also understands `rgb()` / `rgba()` (comma or slash separated). */
export function parseCssColor(input: string): Rgba | null {
  const hex = parseHexColor(input);
  if (hex) return hex;
  const match = input.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(/[,/\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const [r, g, b, a = "1"] = parts;
  const alpha = a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : Number(a);
  if (![r, g, b].every((p) => Number.isFinite(Number(p))) || !Number.isFinite(alpha)) return null;
  return {
    r: clampChannel(Number(r)),
    g: clampChannel(Number(g)),
    b: clampChannel(Number(b)),
    a: clamp01(alpha),
  };
}

/** `#RRGGBB` when fully opaque, `#RRGGBBAA` otherwise. Always uppercase. */
export function rgbaToHex({ r, g, b, a }: Rgba): string {
  const rgb = [r, g, b].map((c) => byteToHex(clampChannel(c))).join("");
  const alpha = Math.round(clamp01(a) * 255);
  return `#${rgb}${alpha >= 255 ? "" : byteToHex(alpha)}`.toUpperCase();
}

export function rgbToHsv({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Pick<Rgba, "r" | "g" | "b"> {
  const hue = ((h % 360) + 360) % 360;
  const c = clamp01(v) * clamp01(s);
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = clamp01(v) - c;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[sector];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** `rgb(r g b)` for the fully opaque color — used to paint picker gradients. */
export function rgbCss({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): string {
  return `rgb(${r} ${g} ${b})`;
}

function byteToHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
