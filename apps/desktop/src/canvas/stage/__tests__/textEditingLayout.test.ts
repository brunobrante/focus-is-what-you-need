import { expect, test } from "bun:test";
import type { ElementNode } from "@/canvas/engine/types";
import {
  getCaretRect,
  getIndexFromPoint,
  getSelectionRects,
  getTextLayout,
} from "../textEditingLayout";

function textNode(overrides: Partial<ElementNode> = {}): ElementNode {
  return {
    id: "text",
    type: "text",
    parentId: null,
    children: [],
    name: "Text",
    x: 0,
    y: 0,
    width: 120,
    height: 120,
    rotation: 0,
    styles: {
      fontSize: 10,
      fontWeight: "400",
      fontFamily: "Inter",
      textAlign: "left",
    },
    content: "",
    ...overrides,
    styles: {
      fontSize: 10,
      fontWeight: "400",
      fontFamily: "Inter",
      textAlign: "left",
      ...overrides.styles,
    },
  };
}

test("wraps text by node width when computing caret position", () => {
  const node = textNode({ width: 1, content: "abc" });
  const layout = getTextLayout(node);

  expect(layout.lines.map((line) => [line.start, line.end])).toEqual([
    [0, 1],
    [1, 2],
    [2, 3],
  ]);
  expect(getCaretRect(node, 2).y).toBeCloseTo(layout.lineHeight * 2);
});

test("hit testing uses the visual line under the pointer", () => {
  const node = textNode({ width: 1, content: "abc" });
  const layout = getTextLayout(node);

  expect(getIndexFromPoint(node, 0, layout.lineHeight + 1)).toBe(1);
  expect(getIndexFromPoint(node, 0, layout.lineHeight * 2 + 1)).toBe(2);
});

test("selection rects are split by wrapped visual lines", () => {
  const node = textNode({ width: 1, content: "abc" });
  const rects = getSelectionRects(node, 0, 3);

  expect(rects).toHaveLength(3);
  expect(rects[0]?.y).toBeCloseTo(0);
  expect(rects[1]?.y).toBeCloseTo(11.2);
  expect(rects[2]?.y).toBeCloseTo(22.4);
});

test("honors an explicit line-height ratio (M8)", () => {
  const node = textNode({ content: "a\nb", styles: { lineHeight: 2 } });
  const layout = getTextLayout(node);
  expect(layout.lineHeight).toBeCloseTo(20); // fontSize 10 × 2
  expect(getCaretRect(node, 2).y).toBeCloseTo(20); // second line
});

test("vertical-align middle shifts the text block down within the box (M8)", () => {
  const node = textNode({ content: "a", height: 120, styles: { verticalAlign: "middle" } });
  const layout = getTextLayout(node);
  // (contentHeight 120 − textHeight 11.2) / 2 = 54.4
  expect(layout.top).toBeCloseTo(54.4);
  expect(getCaretRect(node, 0).y).toBeCloseTo(54.4);
  // Hit-testing reads through the same offset.
  expect(getIndexFromPoint(node, 0, 54.4 + 1)).toBe(0);
});

test("letter-spacing widens caret advance (M8)", () => {
  const plain = textNode({ content: "ab" });
  const spaced = textNode({ content: "ab", styles: { letterSpacing: 50 } });
  expect(getCaretRect(spaced, 1).x).toBeGreaterThan(getCaretRect(plain, 1).x);
});

test("explicit newlines move the caret to the next visual line", () => {
  const node = textNode({ content: "ab\ncd" });
  const layout = getTextLayout(node);

  expect(layout.lines.map((line) => [line.start, line.end])).toEqual([
    [0, 2],
    [3, 5],
  ]);
  expect(getCaretRect(node, 3)).toMatchObject({ x: 0, y: layout.lineHeight });
});
