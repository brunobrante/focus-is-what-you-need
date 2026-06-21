import type { CanvasKit, Paint } from "canvaskit-wasm";

export type ParsedColor = {
  r: number;
  g: number;
  b: number;
  alpha: number;
};

type PaintKey = string;

export class PaintPool {
  private readonly fills = new Map<PaintKey, Paint>();
  private readonly strokes = new Map<PaintKey, Paint>();

  constructor(private readonly ck: CanvasKit) {}

  getFill(color: string, alphaOverride?: number): Paint {
    const key = alphaOverride === undefined ? color : `${color}|${alphaOverride}`;
    let paint = this.fills.get(key);
    if (!paint) {
      paint = createFillPaint(this.ck, color, alphaOverride);
      this.fills.set(key, paint);
    }
    return paint;
  }

  getStroke(color: string, width: number, alphaOverride?: number): Paint {
    const key =
      alphaOverride === undefined ? `${color}|${width}` : `${color}|${width}|${alphaOverride}`;
    let paint = this.strokes.get(key);
    if (!paint) {
      paint = createStrokePaint(this.ck, color, width, alphaOverride);
      this.strokes.set(key, paint);
    }
    return paint;
  }

  dispose(): void {
    for (const paint of this.fills.values()) paint.delete();
    for (const paint of this.strokes.values()) paint.delete();
    this.fills.clear();
    this.strokes.clear();
  }
}

export function createFillPaint(ck: CanvasKit, color: string, alphaOverride?: number): Paint {
  const paint = new ck.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(ck.PaintStyle.Fill);
  setPaintColor(ck, paint, color, alphaOverride);
  return paint;
}

export function createStrokePaint(
  ck: CanvasKit,
  color: string,
  width: number,
  alphaOverride?: number,
): Paint {
  const paint = new ck.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(ck.PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  setPaintColor(ck, paint, color, alphaOverride);
  return paint;
}

export function setPaintColor(
  ck: CanvasKit,
  paint: Paint,
  color: string,
  alphaOverride?: number,
): void {
  const parsed = parseColor(color);
  paint.setColor(ck.Color(parsed.r, parsed.g, parsed.b, alphaOverride ?? parsed.alpha));
}

export function parseColor(input: string): ParsedColor {
  if (input.startsWith("#")) {
    const hex = input.slice(1);
    const value = Number.parseInt(hex.length === 3 ? expandShortHex(hex) : hex, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
      alpha: 1,
    };
  }

  const rgba = input.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((value) => value.trim());
    return {
      r: clampColor(Number(r)),
      g: clampColor(Number(g)),
      b: clampColor(Number(b)),
      alpha: Math.max(0, Math.min(1, Number(a))),
    };
  }

  return { r: 0, g: 0, b: 0, alpha: 1 };
}

export function expandShortHex(hex: string): string {
  return hex
    .split("")
    .map((value) => value + value)
    .join("");
}

export function clampColor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}
