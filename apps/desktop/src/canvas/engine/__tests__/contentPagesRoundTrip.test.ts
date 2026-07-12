import { test, expect } from "bun:test";
import {
  createBlankHtmlCanvasDocument,
  ensureHtmlCanvasSubjectRoot,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { constrainAll, insertElement, createElementForTool } from "@/canvas/engine/actions";
import { getContentAxis, getContentPages, getContentRootBounds } from "@/canvas/engine/geometry";

// Screen pages must survive the persisted scene format: `contentPages` +
// `contentAxis` live on the scene's subject/root node, and elements placed on
// page 2+ must NOT be clamped back into page 1 by the load-time constrainAll.

function blankScene(): string {
  return serializeHtmlCanvasDocument(
    createBlankHtmlCanvasDocument({ name: "Screen", width: 390, height: 844 }),
  );
}

// A real promoted-subject scene: a "<name> Canvas" wrapper around a full-bleed
// subject frame, so `getSubjectWrapperChild` actually promotes and the page
// fields exercise the subject-node write path (not the plain root).
function wrappedScene(): string {
  return serializeHtmlCanvasDocument(
    ensureHtmlCanvasSubjectRoot(
      createBlankHtmlCanvasDocument({ name: "Card", width: 342, height: 220 }),
      { wrapperName: "Card Canvas" },
    ),
  );
}

test("contentPages/contentAxis round-trip through the scene format (plain root)", () => {
  const base = canvasDocumentFromHtmlGraphJSON(blankScene())!;
  base.canvas = { ...base.canvas, contentPages: 3, contentAxis: "vertical" };

  const json = htmlGraphJSONFromCanvasDocument(base, null, "Screen");
  const reloaded = canvasDocumentFromHtmlGraphJSON(json)!;

  expect(getContentPages(reloaded)).toBe(3);
  expect(getContentAxis(reloaded)).toBe("vertical");
});

test("contentPages/contentAxis round-trip through the promoted-subject format", () => {
  const base = canvasDocumentFromHtmlGraphJSON(wrappedScene(), { promoteSubjectRoot: true })!;
  base.canvas = { ...base.canvas, contentPages: 2, contentAxis: "horizontal" };

  const json = htmlGraphJSONFromCanvasDocument(base, wrappedScene(), "Card");
  const reloaded = canvasDocumentFromHtmlGraphJSON(json, { promoteSubjectRoot: true })!;

  expect(getContentPages(reloaded)).toBe(2);
  expect(getContentAxis(reloaded)).toBe("horizontal");
});

test("single-page documents persist no content fields (clean default)", () => {
  const base = canvasDocumentFromHtmlGraphJSON(blankScene())!;
  const json = htmlGraphJSONFromCanvasDocument(base, null, "Screen");
  expect(json.includes("contentPages")).toBe(false);
});

test("constrainAll keeps page-2 root elements in place (load-time clamp)", () => {
  const base = canvasDocumentFromHtmlGraphJSON(blankScene())!;
  base.canvas = { ...base.canvas, contentPages: 2, contentAxis: "vertical" };

  const node = createElementForTool("rect", 100, 1200, base.canvas);
  node.width = 80;
  node.height = 80;
  node.x = 100;
  node.y = 1200; // page 2 (device height 844)
  const withRect = insertElement(base, node);
  expect(withRect.elements[node.id].y).toBe(1200);

  const constrained = constrainAll(withRect);
  expect(constrained.elements[node.id].y).toBe(1200);
  expect(constrained.elements[node.id].x).toBe(100);
});

test("horizontal content bounds extend width, not height", () => {
  const base = canvasDocumentFromHtmlGraphJSON(blankScene())!;
  base.canvas = { ...base.canvas, contentPages: 3, contentAxis: "horizontal" };
  const bounds = getContentRootBounds(base);
  expect(bounds.width).toBe(390 * 3);
  expect(bounds.height).toBe(844);
});
