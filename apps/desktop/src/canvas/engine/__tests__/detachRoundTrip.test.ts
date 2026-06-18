import { expect, test } from "bun:test";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/lib/canvas/htmlScene/styleUtils";
import {
  buildMasterResolver,
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { detachInstance } from "@/canvas/engine/actions";

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
    bounds: p.bounds ?? { x: 0, y: 0, width: 100, height: 100 },
    style: p.style ?? defaultStyle(),
    text: p.text ?? null,
    imageUrl: p.imageUrl ?? null,
    appearance: p.appearance ?? "rect",
    visible: p.visible ?? true,
    locked: p.locked ?? false,
    instanceOf: p.instanceOf ?? null,
  };
}

function doc(rootId: string, nodes: HtmlCanvasNode[]): HtmlCanvasDocument {
  return {
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId,
    viewport: { width: 100, height: 100 },
    nodes,
    updatedAt: 1,
  };
}

// A master "Header" with a single child "Logo".
const masterJSON = serializeHtmlCanvasDocument(
  doc("m-root", [
    mk({ id: "m-root", name: "Header" }),
    mk({ id: "m-a", parentId: "m-root", name: "Logo", bounds: { x: 8, y: 8, width: 40, height: 24 } }),
  ]),
);

// A screen scene that links the master as an instance node.
const parentJSON = serializeHtmlCanvasDocument(
  doc("p-root", [
    mk({ id: "p-root", name: "Screen" }),
    mk({
      id: "inst",
      parentId: "p-root",
      name: "Header",
      instanceOf: { componentId: "c1", variantId: "v1" },
    }),
  ]),
);

const resolveMaster = buildMasterResolver([
  { ownerType: "variant", ownerId: "v1", graphJSON: masterJSON },
]);

// Regression for the detach corruption: detaching an instance and saving must NOT
// resurrect the `instanceOf` link from the previously-stored node, and must persist
// the formerly-inlined master content as plain editable own content.
test("detach → save does not resurrect the link and keeps the content editable", () => {
  // Load the screen; the instance is resolved read-only.
  const loaded = canvasDocumentFromHtmlGraphJSON(parentJSON, { resolveMaster });
  expect(loaded).not.toBeNull();
  expect(loaded!.elements["inst"]?.instanceOf).toEqual({ componentId: "c1", variantId: "v1" });
  expect(loaded!.elements["inst~m-a"]?.locked).toBe(true);

  // Detach the instance.
  const detached = detachInstance(loaded!, "inst");
  expect(detached.elements["inst"]?.instanceOf).toBeNull();
  expect(detached.elements["inst~m-a"]?.locked).toBe(false);

  // Save, passing the original scene as the previous graph (the bug source: the
  // previous "inst" node still carried `instanceOf`).
  const savedJSON = htmlGraphJSONFromCanvasDocument(detached, parentJSON, "Screen");
  const saved = htmlCanvasDocumentFromJSON(savedJSON)!;
  const savedInst = saved.nodes.find((n) => n.id === "inst");
  // The link must be gone — not restored from the previous node.
  expect(savedInst?.instanceOf ?? null).toBeNull();
  // The master content is now stored as own content (not stripped away as instance
  // children would be).
  expect(saved.nodes.some((n) => n.id === "inst~m-a")).toBe(true);

  // Re-load the saved scene: the detached subtree stays editable and is NOT
  // re-inlined (no duplicate master content).
  const reloaded = canvasDocumentFromHtmlGraphJSON(savedJSON, { resolveMaster })!;
  expect(reloaded.elements["inst"]?.instanceOf ?? null).toBeNull();
  expect(reloaded.elements["inst~m-a"]).toBeDefined();
  expect(reloaded.elements["inst~m-a"]?.locked).toBeFalsy();
  // Exactly one node carries the Logo content — no duplication from a stray re-resolve.
  expect(reloaded.elements["inst"]?.children).toEqual(["inst~m-a"]);
});
