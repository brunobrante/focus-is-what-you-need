import type { CanvasKit, Paint } from "canvaskit-wasm";

import { parseCssColor } from "@/domain/canvas/color";

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
  // `#RRGGBBAA` (what the color picker writes for a translucent color) must keep
  // its alpha channel here, or a 50%-opaque border paints fully opaque on canvas.
  const parsed = parseCssColor(input);
  return parsed ? { r: parsed.r, g: parsed.g, b: parsed.b, alpha: parsed.a } : { r: 0, g: 0, b: 0, alpha: 1 };
}
