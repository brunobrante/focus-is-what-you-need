import { expect, test } from "bun:test";

import {
  createBlankHtmlCanvasDocument,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene/document";
import { makeNode } from "@/lib/canvas/htmlScene/nodeHelpers";
import { defaultStyle } from "@/lib/canvas/htmlScene/styleUtils";
import type { HtmlCanvasNode } from "@/lib/canvas/htmlScene/types";

function docWith(extra: HtmlCanvasNode[]): ReturnType<typeof createBlankHtmlCanvasDocument> {
  const doc = createBlankHtmlCanvasDocument({ name: "Frame", width: 200, height: 120 });
  return { ...doc, nodes: [...doc.nodes, ...extra] };
}

function child(overrides: Partial<HtmlCanvasNode>): HtmlCanvasNode {
  return {
    ...makeNode({
      id: "c1",
      parentId: "node-root",
      name: "Box",
      type: "frame",
      order: 1,
      bounds: { x: 10, y: 20, width: 30, height: 40 },
      props: {},
    }),
    ...overrides,
  };
}

test("serialize→parse→serialize is canonical (idempotent)", () => {
  const doc = docWith([child({})]);
  const once = serializeHtmlCanvasDocument(doc);
  const parsed = htmlCanvasDocumentFromJSON(once)!;
  const twice = serializeHtmlCanvasDocument(parsed);
  expect(twice).toBe(once); // string-equality save-skip holds across a round-trip
});

test("a default node omits style + derived cssId/className but rehydrates fully", () => {
  const doc = docWith([child({})]);
  const json = serializeHtmlCanvasDocument(doc);
  // The default-styled child carries no `style` and no cssId/className in the blob.
  const blob = JSON.parse(json) as { nodes: Array<Record<string, unknown>> };
  const compactChild = blob.nodes.find((n) => n.id === "c1")!;
  expect(compactChild.style).toBeUndefined();
  expect(compactChild.cssId).toBeUndefined();
  expect("visible" in compactChild).toBe(false);
  // …yet the parsed node is fully populated with the defaults.
  const parsed = htmlCanvasDocumentFromJSON(json)!;
  const node = parsed.nodes.find((n) => n.id === "c1")!;
  expect(node.style).toEqual(defaultStyle());
  expect(node.visible).toBe(true);
  expect(node.locked).toBe(false);
  expect(node.appearance).toBe("rect");
  expect(node.cssId).toBe("box");
});

test("custom style + flags survive the round-trip", () => {
  const doc = docWith([
    child({
      cssId: "custom-id",
      visible: false,
      locked: true,
      text: "Hello",
      style: { ...defaultStyle(), background: "#FF0000", fontSize: 24 },
    }),
  ]);
  const parsed = htmlCanvasDocumentFromJSON(serializeHtmlCanvasDocument(doc))!;
  const node = parsed.nodes.find((n) => n.id === "c1")!;
  expect(node.cssId).toBe("custom-id");
  expect(node.visible).toBe(false);
  expect(node.locked).toBe(true);
  expect(node.text).toBe("Hello");
  expect(node.style.background).toBe("#FF0000");
  expect(node.style.fontSize).toBe(24);
  // Non-overridden style props still resolve to the defaults.
  expect(node.style.color).toBe(defaultStyle().color);
});

test("bounds are rounded to 2 decimals", () => {
  const doc = docWith([child({ bounds: { x: 10.123456, y: 0, width: 30.005, height: 40 } })]);
  const blob = JSON.parse(serializeHtmlCanvasDocument(doc)) as {
    nodes: Array<{ id: string; bounds: { x: number; width: number } }>;
  };
  const c = blob.nodes.find((n) => n.id === "c1")!;
  expect(c.bounds.x).toBe(10.12);
  expect(c.bounds.width).toBe(30.01);
});
