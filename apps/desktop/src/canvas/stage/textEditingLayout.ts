import type { ElementNode, Rect } from "@/canvas/engine/types";

export type TextLayout = {
  text: string;
  font: string;
  fontSize: number;
  lineHeight: number;
  contentX: number;
  contentY: number;
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

function fontForNode(node: ElementNode): string {
  const style = node.styles;
  const weight = style.fontWeight ?? "400";
  const size = style.fontSize ?? 16;
  const family = style.fontFamily || "Inter, system-ui, sans-serif";
  return `${weight} ${size}px ${family}`;
}

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

export function getTextLayout(node: ElementNode): TextLayout {
  const text = node.content ?? "";
  const fontSize = node.styles.fontSize ?? 16;
  const lineHeight = fontSize * 1.12;
  const font = fontForNode(node);
  const ctx = getMeasureContext();
  const padding = node.styles.padding ?? 0;
  const borderWidth = node.styles.borderWidth ?? 0;
  const contentInset = padding + borderWidth;
  const contentX = contentInset;
  const contentY = contentInset;
  const contentWidth = Math.max(1, node.width - contentInset * 2);

  if (ctx) ctx.font = font;
  const measure = (value: string) =>
    ctx ? ctx.measureText(value).width : value.length * fontSize * 0.55;
  const measureRange = (start: number, end: number) => measure(text.slice(start, end));

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
      y: contentY + lineIndex * lineHeight,
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
    contentWidth,
    lines,
  };
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
      Math.floor((localY - layout.contentY) / layout.lineHeight),
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
