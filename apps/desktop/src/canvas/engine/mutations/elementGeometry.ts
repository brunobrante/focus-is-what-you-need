import { runsForContent, segmentsInRange } from "@/domain/canvas/textRuns";
import { getElementDefinition } from "../elementDefinitions";
import type { CanvasDocument, ElementNode, ElementSizing, ElementStyles, Rect } from "../types";
import { applyChildConstraintsInPlace } from "./elementConstraints";
import { mutateElementShallow, shallowCloneDocument } from "./coreUtils";
import {
  clamp,
  clampRotatedRectToBounds,
  getParentBounds,
  getParentSize,
  MIN_ELEMENT_SIZE,
  normalizeAngle,
  roundAngle,
  roundPixel,
} from "../geometry";
import { fontForNode, measureTextWidth } from "./textMeasurement";

export function clampNodeToParentBounds(document: CanvasDocument, id: string): void {
  const node = document.elements[id];
  if (!node) return;
  const parentBounds = getParentBounds(document, id);
  const clamped = clampRotatedRectToBounds(
    { x: parentBounds.x + node.x, y: parentBounds.y + node.y, width: node.width, height: node.height },
    node.rotation,
    parentBounds,
  );
  node.x = roundPixel(clamped.x - parentBounds.x);
  node.y = roundPixel(clamped.y - parentBounds.y);
}

export function updateElementGeometry(document: CanvasDocument, id: string, patch: Partial<Rect>): CanvasDocument {
  // Shallow clone + per-node copy (P6): inspector commits snapshot into history,
  // and a deep structuredClone per commit made every snapshot a full independent
  // copy of the scene. Untouched nodes now share structurally across history.
  const next = shallowCloneDocument(document);
  const node = mutateElementShallow(next, id);
  if (!node) return document;
  const oldSize = { width: node.width, height: node.height };
  const parentSize = getParentSize(next, id);
  const c = getElementDefinition(node.type).capabilities.constraints;
  const minW = c.width.min;
  const maxW = Math.min(parentSize.width, c.width.max ?? parentSize.width);
  const minH = c.height.min;
  const maxH = Math.min(parentSize.height, c.height.max ?? parentSize.height);
  const widthFit = isTextFit(node, "width");
  const heightFit = isTextFit(node, "height");
  node.width = roundPixel(clamp(widthFit ? node.width : patch.width ?? node.width, minW, maxW));
  node.height = roundPixel(clamp(heightFit ? node.height : patch.height ?? node.height, minH, maxH));
  node.x = roundPixel(clamp(patch.x ?? node.x, 0, parentSize.width - node.width));
  node.y = roundPixel(clamp(patch.y ?? node.y, 0, parentSize.height - node.height));
  applyTextFitSizingInPlace(next, id);
  clampNodeToParentBounds(next, id);
  // Reflow pinned children when the container's size changed (G5).
  applyChildConstraintsInPlace(next, id, oldSize, { width: node.width, height: node.height });
  return next;
}

export function updateElementRotation(document: CanvasDocument, id: string, rotation: number): CanvasDocument {
  const next = shallowCloneDocument(document);
  const node = mutateElementShallow(next, id);
  if (!node) return document;
  node.rotation = roundAngle(normalizeAngle(rotation));
  clampNodeToParentBounds(next, id);
  return next;
}

export function updateElementStyles(
  document: CanvasDocument,
  id: string,
  styles: Partial<ElementStyles>,
): CanvasDocument {
  const next = shallowCloneDocument(document);
  const node = mutateElementShallow(next, id);
  if (!node) return document;
  node.styles = { ...node.styles, ...styles };
  const def = getElementDefinition(node.type).capabilities;
  if (styles.borderRadius !== undefined) {
    if (def.radiusRole === "corner") {
      // Store the user's value verbatim (e.g. 9999 for a pill); the radius is
      // clamped only at render (CSS caps border-radius at 50% automatically), so a
      // pill stays a pill across resizes (D1). Just keep it non-negative.
      node.styles.borderRadius = roundPixel(Math.max(0, styles.borderRadius));
    } else if (def.radiusRole === "ratio" && def.constraints.radius) {
      const { min, max } = def.constraints.radius;
      node.styles.borderRadius = roundPixel(clamp(styles.borderRadius, min, max ?? styles.borderRadius));
    }
  }
  applyTextFitSizingInPlace(next, id);
  return next;
}

function isTextFit(node: ElementNode, axis: keyof ElementSizing): boolean {
  return node.type === "text" && node.sizing?.[axis] === "fit";
}

// Tokenize a line into maximal whitespace / non-whitespace runs. Wrapping only
// ever happens at run boundaries (or, for an over-long word, inside it), so
// measuring per run instead of per character makes this O(words) instead of
// O(len²) in `measure` calls (P7) while producing the identical break positions
// as the previous char-by-char scan (matches `overflow-wrap: break-word`).
function tokenizeLine(text: string, start: number, end: number): Array<{ end: number; isWs: boolean }> {
  const tokens: Array<{ end: number; isWs: boolean }> = [];
  let i = start;
  const isWsChar = (c: string) => c === " " || c === "\t";
  while (i < end) {
    const ws = isWsChar(text[i]);
    let tokenEnd = i + 1;
    while (tokenEnd < end && isWsChar(text[tokenEnd]) === ws) tokenEnd += 1;
    tokens.push({ end: tokenEnd, isWs: ws });
    i = tokenEnd;
  }
  return tokens;
}

/**
 * How many visual lines `text[start, end)` occupies at `contentWidth`.
 *
 * Indices rather than a substring because widths are measured per styled run
 * (G10), which only the absolute offsets can resolve. Exported for the P7
 * equivalence test; not part of the public geometry API.
 */
export function wrapLineCount(
  text: string,
  start: number,
  end: number,
  contentWidth: number,
  measureRange: (from: number, to: number) => number,
): number {
  if (end <= start) return 1;
  const tokens = tokenizeLine(text, start, end);
  let wraps = 0;
  let lineStart = start;
  let lastWrapAfter: number | null = null;
  let i = 0;

  while (i < tokens.length) {
    const tokenEnd = tokens[i].end;
    // The whole run from lineStart through this token fits → accept it.
    if (measureRange(lineStart, tokenEnd) <= contentWidth) {
      if (tokens[i].isWs) lastWrapAfter = tokenEnd;
      i += 1;
      continue;
    }
    // Overflow with a wrap opportunity behind us → wrap at the last space run and
    // re-examine this token on the new line.
    if (lastWrapAfter !== null && lastWrapAfter > lineStart) {
      wraps += 1;
      lineStart = lastWrapAfter;
      lastWrapAfter = null;
      continue;
    }
    // No wrap opportunity: the current word alone overflows the line — break it
    // character-by-character (break-word). Only the over-long word pays O(len²).
    let c = lineStart + 1;
    while (c < tokenEnd && measureRange(lineStart, c + 1) <= contentWidth) c += 1;
    wraps += 1;
    lineStart = c;
    lastWrapAfter = null;
    if (c >= tokenEnd) i += 1;
  }

  return wraps + 1;
}

type TextFitMetrics = {
  lineHeight: number;
  contentInset: number;
  text: string;
  /** Hard-break (`\n`) line spans, as absolute `[start, end)` offsets into `text`. */
  lines: Array<{ start: number; end: number }>;
  measureRange: (from: number, to: number) => number;
};

function getTextFitMetrics(node: ElementNode): TextFitMetrics {
  const fontSize = node.styles.fontSize ?? 16;
  const lineHeight = fontSize * 1.12;
  const text = node.content ?? "";
  // A styled run may change family or weight mid-paragraph, so a range's width is
  // the sum of its per-run pieces — matching how the DOM shapes one span at a time.
  const runs = runsForContent(text, node.runs);
  const measureRange = (from: number, to: number) =>
    segmentsInRange(runs, from, to).reduce(
      (width, segment) =>
        width + measureTextWidth(text.slice(segment.start, segment.end), fontForNode(node, segment.styles), fontSize),
      0,
    );

  const lines: Array<{ start: number; end: number }> = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || text[i] === "\n") {
      lines.push({ start: lineStart, end: i });
      lineStart = i + 1;
    }
  }

  const padding = node.styles.padding ?? 0;
  const borderWidth = node.styles.borderWidth ?? 0;
  const contentInset = (padding + borderWidth) * 2;
  return { lineHeight, contentInset, text, lines, measureRange };
}

function getFittedTextWidth(metrics: TextFitMetrics): number {
  const contentWidth = Math.max(0, ...metrics.lines.map((line) => metrics.measureRange(line.start, line.end)));
  return Math.ceil(contentWidth + metrics.contentInset);
}

function getFittedTextHeight(metrics: TextFitMetrics, width: number): number {
  const effectiveContentWidth = Math.max(1, width - metrics.contentInset);
  const visualLineCount = Math.max(
    1,
    metrics.lines.reduce(
      (total, line) =>
        total + wrapLineCount(metrics.text, line.start, line.end, effectiveContentWidth, metrics.measureRange),
      0,
    ),
  );
  return Math.ceil(visualLineCount * metrics.lineHeight + metrics.contentInset);
}

export function applyTextFitSizingInPlace(document: CanvasDocument, id: string): void {
  const node = document.elements[id];
  if (!node || node.type !== "text") return;
  const sizing = {
    width: node.sizing?.width ?? "fixed",
    height: node.sizing?.height ?? "fixed",
  } satisfies Required<ElementSizing>;
  if (sizing.width !== "fit" && sizing.height !== "fit") return;

  const parentSize = getParentSize(document, id);
  const constraints = getElementDefinition(node.type).capabilities.constraints;
  const maxWidth = Math.min(parentSize.width, constraints.width.max ?? parentSize.width);
  const maxHeight = Math.min(parentSize.height, constraints.height.max ?? parentSize.height);
  const metrics = getTextFitMetrics(node);

  if (sizing.width === "fit") {
    node.width = roundPixel(clamp(getFittedTextWidth(metrics), constraints.width.min, maxWidth));
  }
  if (sizing.height === "fit") {
    node.height = roundPixel(clamp(getFittedTextHeight(metrics, node.width), constraints.height.min, maxHeight));
  }
  node.x = roundPixel(clamp(node.x, 0, parentSize.width - node.width));
  node.y = roundPixel(clamp(node.y, 0, parentSize.height - node.height));
  clampNodeToParentBounds(document, id);
}

export function setTextElementSizing(
  document: CanvasDocument,
  id: string,
  sizing: ElementSizing,
): CanvasDocument {
  const next = shallowCloneDocument(document);
  const node = mutateElementShallow(next, id);
  if (!node || node.type !== "text") return document;
  node.sizing = {
    ...node.sizing,
    ...sizing,
  };
  applyTextFitSizingInPlace(next, id);
  return next;
}

export function fitTextElementToContent(document: CanvasDocument, id: string): CanvasDocument {
  const next = setTextElementSizing(document, id, { width: "fit", height: "fit" });
  return next;
}
