import { expect, test } from "bun:test";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/domain/canvas/htmlScene/styleUtils";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { applyTextRunStyles, updateElementTextShallow } from "@/canvas/engine/actions";
import type { TextRun } from "@/domain/canvas/textRuns";

function mk(p: Partial<HtmlCanvasNode> & { id: string }): HtmlCanvasNode {
  return {
    id: p.id,
    parentId: p.parentId ?? null,
    name: p.name ?? p.id,
    kind: p.kind ?? "frame",
    tag: p.tag ?? "div",
    cssId: p.id,
    className: p.id,
    order: p.order ?? 0,
    bounds: p.bounds ?? { x: 0, y: 0, width: 200, height: 100 },
    style: p.style ?? defaultStyle(),
    text: p.text ?? null,
    imageUrl: p.imageUrl ?? null,
    appearance: p.appearance ?? "rect",
    visible: p.visible ?? true,
    locked: p.locked ?? false,
    instanceOf: p.instanceOf ?? null,
    ...(p.textRuns ? { textRuns: p.textRuns } : {}),
  };
}

function doc(nodes: HtmlCanvasNode[]): HtmlCanvasDocument {
  return {
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId: "root",
    viewport: { width: 200, height: 100 },
    nodes,
    updatedAt: 1,
  };
}

const runs: TextRun[] = [
  { text: "Already have an account? " },
  { text: "Sign in", styles: { fontWeight: "700" } },
];

test("styled runs survive a save + reload through the scene adapter", () => {
  const graph = serializeHtmlCanvasDocument(
    doc([
      mk({ id: "root", name: "Screen" }),
      mk({
        id: "t",
        parentId: "root",
        name: "Text",
        kind: "text",
        text: "Already have an account? Sign in",
        textRuns: runs,
      }),
    ]),
  );

  const loaded = canvasDocumentFromHtmlGraphJSON(graph);
  expect(loaded?.elements.t.runs).toEqual(runs);

  // Round-trip back out and in again — the runs must be byte-identical.
  const reserialized = htmlGraphJSONFromCanvasDocument(loaded!, graph, "Screen");
  const reloaded = canvasDocumentFromHtmlGraphJSON(reserialized);
  expect(reloaded?.elements.t.runs).toEqual(runs);
});

test("runs that no longer match the text degrade to uniform on load (text is never lost)", () => {
  const graph = serializeHtmlCanvasDocument(
    doc([
      mk({ id: "root", name: "Screen" }),
      mk({
        id: "t",
        parentId: "root",
        name: "Text",
        kind: "text",
        text: "different text entirely",
        textRuns: runs,
      }),
    ]),
  );
  const loaded = canvasDocumentFromHtmlGraphJSON(graph);
  expect(loaded?.elements.t.runs).toBeUndefined();
  expect(loaded?.elements.t.content).toBe("different text entirely");
});

test("a uniform paragraph persists no textRuns key", () => {
  const graph = serializeHtmlCanvasDocument(
    doc([
      mk({ id: "root", name: "Screen" }),
      mk({ id: "t", parentId: "root", name: "Text", kind: "text", text: "plain" }),
    ]),
  );
  const loaded = canvasDocumentFromHtmlGraphJSON(graph);
  const out = htmlGraphJSONFromCanvasDocument(loaded!, graph, "Screen");
  expect(JSON.parse(out).nodes.find((n: { id: string }) => n.id === "t").textRuns).toBeUndefined();
});

test("styling a range then editing outside it keeps the runs anchored", () => {
  let document = canvasDocumentFromHtmlGraphJSON(
    serializeHtmlCanvasDocument(
      doc([
        mk({ id: "root", name: "Screen" }),
        mk({
          id: "t",
          parentId: "root",
          name: "Text",
          kind: "text",
          text: "Already have an account? Sign in",
        }),
      ]),
    ),
  )!;

  // Bold "Sign in" (indices 25..32).
  document = applyTextRunStyles(document, "t", 25, 32, { fontWeight: "700" });
  expect(document.elements.t.runs).toEqual(runs);

  // Type "!" after "account?" (index 24); the caret after the edit is 25.
  document = updateElementTextShallow(document, "t", "Already have an account?! Sign in", 25);
  expect(document.elements.t.runs).toEqual([
    { text: "Already have an account?! " },
    { text: "Sign in", styles: { fontWeight: "700" } },
  ]);
});
