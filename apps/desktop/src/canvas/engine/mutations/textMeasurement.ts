import type { ElementNode } from "../types";

/**
 * Measures the rendered width (px) of a single line of text for a given CSS
 * `font` shorthand. `fontSize` is passed separately so the non-DOM fallback can
 * estimate without parsing the font string.
 *
 * This is injectable (see {@link setTextWidthMeasurer}) so the engine's
 * text-fit geometry is deterministic in tests instead of silently diverging
 * between a real `<canvas>` and the Bun character-width heuristic — the seam
 * ORG-16 asked for.
 */
export type TextWidthMeasurer = (text: string, font: string, fontSize: number) => number;

export function fontForNode(node: ElementNode): string {
  const fontWeight = node.styles.fontWeight ?? "400";
  const fontSize = node.styles.fontSize ?? 16;
  const fontFamily = node.styles.fontFamily || "Inter, system-ui, sans-serif";
  return `${fontWeight} ${fontSize}px ${fontFamily}`;
}

let textMeasureCanvas: HTMLCanvasElement | null = null;

function canvasContext(): CanvasRenderingContext2D | null {
  if (!globalThis.document) return null;
  textMeasureCanvas ??= globalThis.document.createElement("canvas");
  return textMeasureCanvas.getContext("2d");
}

/**
 * Default measurer: a cached offscreen `<canvas>` 2D context when a DOM is
 * present, else a coarse character-width heuristic for non-DOM runtimes (Bun).
 */
export const defaultTextWidthMeasurer: TextWidthMeasurer = (text, font, fontSize) => {
  const ctx = canvasContext();
  if (ctx) {
    ctx.font = font;
    return ctx.measureText(text).width;
  }
  return text.length * fontSize * 0.55;
};

let measurer: TextWidthMeasurer = defaultTextWidthMeasurer;

/** Test/host seam: override the measurer (pass `null` to restore the default). */
export function setTextWidthMeasurer(next: TextWidthMeasurer | null): void {
  measurer = next ?? defaultTextWidthMeasurer;
}

export function measureTextWidth(text: string, font: string, fontSize: number): number {
  return measurer(text, font, fontSize);
}
