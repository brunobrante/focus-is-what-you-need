import { runsForContent, segmentsInRange, type TextRunStyles } from "@/domain/canvas/textRuns";
import type { ElementNode, Rect } from "@/canvas/engine/types";

export type TextLayout = {
  text: string;
  font: string;
  fontSize: number;
  lineHeight: number;
  contentX: number;
  contentY: number;
  /** Y of the first line's top, including the vertical-align offset (M8). */
  top: number;
  contentWidth: number;
  lines: TextLayoutLine[];
};

export type TextLayoutLine = {
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  charX: number[];
};

let measureCanvas: HTMLCanvasElement | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureCanvas) {
    measureCanvas = globalThis.document?.createElement("canvas") ?? null;
  }
  return measureCanvas?.getContext("2d") ?? null;
}

/**
 * The CSS `font` shorthand for a slice of `node`, with a styled run's overrides
 * layered on (G10). Font size stays element-level, so runs never change the line
 * box — only glyph widths.
 */
function fontForNode(node: ElementNode, run?: TextRunStyles): string {
  const style = node.styles;
  // CSS `font` shorthand order: font-style font-weight font-size family. Include
  // font-style so italic text measures with the italic metrics the DOM renders (M8).
  const resolvedStyle = run?.fontStyle ?? style.fontStyle;
  const fontStyle = resolvedStyle ? `${resolvedStyle} ` : "";
  const weight = run?.fontWeight ?? style.fontWeight ?? "400";
  const size = style.fontSize ?? 16;
  const family = run?.fontFamily ?? style.fontFamily ?? "";
  return `${fontStyle}${weight} ${size}px ${family || "Inter, system-ui, sans-serif"}`;
}

// Mirrors CSS `text-transform`; the DOM renders the transformed glyphs, so the
// caret/selection measurement must too (M8). Upper/lower/capitalize are 1:1 char
// maps for the common case; on the rare length-changing map (e.g. ß→SS) we fall
// back so caret indices stay aligned to the original string.
function applyTextTransform(text: string, transform: string | undefined): string {
  let out: string;
  switch (transform) {
    case "uppercase":
      out = text.toUpperCase();
      break;
    case "lowercase":
      out = text.toLowerCase();
      break;
    case "capitalize":
      out = text.replace(/(^|\s)(\S)/g, (_, sep, ch) => sep + ch.toUpperCase());
      break;
    default:
      return text;
  }
  return out.length === text.length ? out : text;
}

// The DOM's default (unset) line-height is the `.text-element` CSS class's 1.12,
// not `normal`; a set `styles.lineHeight` is a unitless ratio that overrides it.
const DEFAULT_LINE_HEIGHT_RATIO = 1.12;

function textStartForNode(node: ElementNode, contentWidth: number, textWidth: number): number {
  if (node.styles.textAlign === "center") {
    return Math.max(0, (contentWidth - textWidth) / 2);
  }
  if (node.styles.textAlign === "right") {
    return Math.max(0, contentWidth - textWidth);
  }
  return 0;
}

function isWrapOpportunity(char: string): boolean {
  return char === " " || char === "\t";
}

function computeTextLayout(node: ElementNode): TextLayout {
  const styles = node.styles;
  const text = node.content ?? "";
  const fontSize = styles.fontSize ?? 16;
  const lineHeightRatio =
    typeof styles.lineHeight === "number" && Number.isFinite(styles.lineHeight)
      ? styles.lineHeight
      : DEFAULT_LINE_HEIGHT_RATIO;
  const lineHeight = fontSize * lineHeightRatio;
  const font = fontForNode(node);
  const ctx = getMeasureContext();
  const padding = styles.padding ?? 0;
  const borderWidth = styles.borderWidth ?? 0;
  const contentInset = padding + borderWidth;
  const contentX = contentInset;
  const contentY = contentInset;
  const contentWidth = Math.max(1, node.width - contentInset * 2);

  // `(ctx as object)` so the `in` test reads the feature without narrowing `ctx`
  // itself to `never` in the unsupported branch (lib.dom now declares the prop).
  const ctxSpacing = ctx != null && "letterSpacing" in (ctx as object);
  // letter-spacing: `%` → em → px, added between glyphs (M8). Prefer the native
  // ctx.letterSpacing so measureText includes it; fall back to per-char addition.
  const letterSpacingPxFor = (run?: TextRunStyles) => {
    const percent = run?.letterSpacing ?? styles.letterSpacing;
    return typeof percent === "number" && percent !== 0 ? (percent / 100) * fontSize : 0;
  };

  // The DOM renders the case-transformed glyphs; measure them (indices stay 1:1).
  const measuredText = applyTextTransform(text, styles.textTransform);
  // Widths are summed per styled run (G10): each run is its own shaping context in
  // the DOM (a `<span>`), so measuring them separately is what the render does too.
  const runs = runsForContent(text, node.runs);
  const measureSegment = (value: string, run: TextRunStyles | undefined) => {
    const letterSpacingPx = letterSpacingPxFor(run);
    if (!ctx) return value.length * fontSize * 0.55 + letterSpacingPx * value.length;
    ctx.font = fontForNode(node, run);
    if (ctxSpacing) {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacingPx}px`;
      return ctx.measureText(value).width;
    }
    return ctx.measureText(value).width + letterSpacingPx * value.length;
  };
  const measureRange = (start: number, end: number) =>
    segmentsInRange(runs, start, end).reduce(
      (width, segment) => width + measureSegment(measuredText.slice(segment.start, segment.end), segment.styles),
      0,
    );

  const ranges: Array<{ start: number; end: number }> = [];
  let lineStart = 0;
  let index = 0;
  let lastWrapAfter: number | null = null;

  while (index < text.length) {
    const char = text[index];
    if (char === "\n") {
      ranges.push({ start: lineStart, end: index });
      index += 1;
      lineStart = index;
      lastWrapAfter = null;
      continue;
    }

    const candidateEnd = index + 1;
    const candidateWidth = measureRange(lineStart, candidateEnd);
    if (candidateWidth <= contentWidth || candidateEnd === lineStart + 1) {
      if (isWrapOpportunity(char)) lastWrapAfter = candidateEnd;
      index = candidateEnd;
      continue;
    }

    if (lastWrapAfter !== null && lastWrapAfter > lineStart) {
      ranges.push({ start: lineStart, end: lastWrapAfter });
      lineStart = lastWrapAfter;
      index = lineStart;
      lastWrapAfter = null;
      continue;
    }

    ranges.push({ start: lineStart, end: index });
    lineStart = index;
    lastWrapAfter = null;
  }

  ranges.push({ start: lineStart, end: text.length });

  // vertical-align (compiled as a flex column in the DOM): shift the whole text
  // block down within the content box when it is taller than the text (M8).
  const contentHeight = Math.max(0, node.height - contentInset * 2);
  const totalTextHeight = ranges.length * lineHeight;
  const vFactor =
    styles.verticalAlign === "middle" ? 0.5 : styles.verticalAlign === "bottom" ? 1 : 0;
  const vOffset = Math.max(0, (contentHeight - totalTextHeight) * vFactor);
  const top = contentY + vOffset;

  const lines = ranges.map((range, lineIndex) => {
    const width = measureRange(range.start, range.end);
    const charX: number[] = [];
    for (let charIndex = range.start; charIndex <= range.end; charIndex += 1) {
      charX.push(measureRange(range.start, charIndex));
    }
    return {
      start: range.start,
      end: range.end,
      x: contentX + textStartForNode(node, contentWidth, width),
      y: top + lineIndex * lineHeight,
      width,
      charX,
    };
  });

  return {
    text,
    font,
    fontSize,
    lineHeight,
    contentX,
    contentY,
    top,
    contentWidth,
    lines,
  };
}

let layoutCache: { key: string; layout: TextLayout } | null = null;

function layoutKey(node: ElementNode): string {
  const s = node.styles;
  return [
    node.content ?? "",
    // Styled runs change glyph widths, so they change every caret x (G10).
    node.runs ? JSON.stringify(node.runs) : "",
    node.width,
    node.height, // verticalAlign offset depends on box height
    `${s.fontStyle ?? ""} ${s.fontWeight ?? "400"} ${s.fontSize ?? 16} ${s.fontFamily ?? ""}`,
    s.textAlign ?? "left",
    s.padding ?? 0,
    s.borderWidth ?? 0,
    s.lineHeight ?? "",
    s.letterSpacing ?? 0,
    s.textTransform ?? "none",
    s.verticalAlign ?? "top",
  ].join("|");
}

/**
 * `computeTextLayout` is O(n²) in `measureText` calls per line, and the caret /
 * selection / hit-test helpers all call it. During editing it is repeatedly asked
 * for the same node, so a single-slot keyed cache removes nearly all the cost: the
 * O(n²) work then runs once per real text/size/font change instead of every frame.
 *
 * The key must include every field `computeTextLayout` reads — extend it if a new
 * layout-affecting style is added.
 */
export function getTextLayout(node: ElementNode): TextLayout {
  const key = layoutKey(node);
  if (layoutCache && layoutCache.key === key) return layoutCache.layout;
  const layout = computeTextLayout(node);
  layoutCache = { key, layout };
  return layout;
}

function getLineForCaret(layout: TextLayout, index: number): TextLayoutLine {
  const clampedIndex = Math.max(0, Math.min(index, layout.text.length));
  for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex += 1) {
    const line = layout.lines[lineIndex];
    if (clampedIndex < line.end) return line;
    if (clampedIndex === line.end) {
      const nextLine = layout.lines[lineIndex + 1];
      if (nextLine?.start === clampedIndex && clampedIndex !== layout.text.length) {
        continue;
      }
      return line;
    }
  }
  return layout.lines[layout.lines.length - 1];
}

export function getCaretRect(node: ElementNode, index: number): Rect {
  const layout = getTextLayout(node);
  const line = getLineForCaret(layout, index);
  const clampedIndex = Math.max(line.start, Math.min(index, line.end));
  const charOffset = clampedIndex - line.start;
  return {
    x: line.x + (line.charX[charOffset] ?? 0),
    y: line.y,
    width: 1,
    height: layout.lineHeight,
  };
}

export function getIndexFromPoint(
  node: ElementNode,
  localX: number,
  localY: number,
): number {
  const layout = getTextLayout(node);
  const lineIndex = Math.max(
    0,
    Math.min(
      layout.lines.length - 1,
      Math.floor((localY - layout.top) / layout.lineHeight),
    ),
  );
  const line = layout.lines[lineIndex];
  const x = localX - line.x;
  if (x <= 0) return line.start;
  if (x >= line.width) return line.end;

  const lineLength = line.end - line.start;
  for (let index = 0; index < lineLength; index += 1) {
    const left = line.charX[index] ?? 0;
    const right = line.charX[index + 1] ?? left;
    const midpoint = left + (right - left) / 2;
    if (x <= midpoint) return line.start + index;
  }
  return line.end;
}

export function getSelectionRects(
  node: ElementNode,
  start: number,
  end: number,
): Rect[] {
  const layout = getTextLayout(node);
  const from = Math.max(0, Math.min(start, end, layout.text.length));
  const to = Math.max(0, Math.min(Math.max(start, end), layout.text.length));
  if (from === to) return [];

  return layout.lines.flatMap((line) => {
    const lineStart = Math.max(from, line.start);
    const lineEnd = Math.min(to, line.end);
    if (lineStart >= lineEnd) return [];

    const left = line.x + (line.charX[lineStart - line.start] ?? 0);
    const right = line.x + (line.charX[lineEnd - line.start] ?? left);
    return [{
      x: left,
      y: line.y,
      width: Math.max(1, right - left),
      height: layout.lineHeight,
    }];
  });
}
