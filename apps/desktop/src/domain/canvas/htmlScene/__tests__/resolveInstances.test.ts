import { expect, test } from "bun:test";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  buildMasterResolver,
  resolveInstances,
  serializeHtmlCanvasDocument,
  stripResolvedInstanceChildren,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/domain/canvas/htmlScene/styleUtils";

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

const master = doc("m-root", [
  mk({ id: "m-root", name: "Header" }),
  mk({ id: "m-a", parentId: "m-root", name: "Logo" }),
  mk({ id: "m-b", parentId: "m-a", name: "Glyph" }),
]);

const parent = doc("p-root", [
  mk({ id: "p-root", name: "Screen" }),
  mk({
    id: "inst",
    parentId: "p-root",
    name: "Header",
    instanceOf: { componentId: "c1", variantId: "v1" },
  }),
]);

const resolver = (ref: { componentId: string; variantId: string }) =>
  ref.variantId === "v1" ? master : null;

test("resolveInstances inlines the master subtree read-only under the instance node", () => {
  const resolved = resolveInstances(parent, resolver);
  const byId = new Map(resolved.nodes.map((n) => [n.id, n]));

  // Instance node survives and keeps its link.
  expect(byId.get("inst")?.instanceOf).toEqual({ componentId: "c1", variantId: "v1" });

  // Master content is inlined under the instance with namespaced ids, all locked.
  const a = byId.get("inst~m-a");
  const b = byId.get("inst~m-b");
  expect(a?.parentId).toBe("inst");
  expect(b?.parentId).toBe("inst~m-a");
  expect(a?.locked).toBe(true);
  expect(b?.locked).toBe(true);
  expect(a?.name).toBe("Logo");
});

test("stripResolvedInstanceChildren removes inlined content, leaving the bare instance", () => {
  const resolved = resolveInstances(parent, resolver);
  const stripped = stripResolvedInstanceChildren(resolved);
  const ids = stripped.nodes.map((n) => n.id).sort();
  expect(ids).toEqual(["inst", "p-root"]);
  // The link is preserved so the next load re-resolves it.
  expect(stripped.nodes.find((n) => n.id === "inst")?.instanceOf).toEqual({
    componentId: "c1",
    variantId: "v1",
  });
});

test("resolve → strip round-trips back to the stored shape (content never duplicated)", () => {
  const resolved = resolveInstances(parent, resolver);
  const stripped = stripResolvedInstanceChildren(resolved);
  expect(serializeHtmlCanvasDocument(stripped)).toBe(serializeHtmlCanvasDocument(parent));
});

test("resolveInstances guards against cycles", () => {
  // Master that contains an instance pointing back at itself.
  const cyclic = doc("c-root", [
    mk({ id: "c-root", name: "Header" }),
    mk({
      id: "c-self",
      parentId: "c-root",
      name: "Header",
      instanceOf: { componentId: "c1", variantId: "vc" },
    }),
  ]);
  const cyclicParent = doc("p-root", [
    mk({ id: "p-root" }),
    mk({
      id: "inst",
      parentId: "p-root",
      instanceOf: { componentId: "c1", variantId: "vc" },
    }),
  ]);
  const resolved = resolveInstances(cyclicParent, (ref) =>
    ref.variantId === "vc" ? cyclic : null,
  );
  // The nested self-instance is left as a bare node (no infinite expansion).
  const nested = resolved.nodes.find((n) => n.id === "inst~c-self");
  expect(nested).toBeDefined();
  expect(resolved.nodes.some((n) => n.id.includes("~c-self~"))).toBe(false);
});

test("buildMasterResolver resolves only variant-owned scenes", () => {
  const resolve = buildMasterResolver([
    { ownerType: "variant", ownerId: "v1", graphJSON: serializeHtmlCanvasDocument(master) },
    { ownerType: "screen", ownerId: "s1", graphJSON: serializeHtmlCanvasDocument(parent) },
  ]);
  expect(resolve({ componentId: "c1", variantId: "v1" })?.rootId).toBe("m-root");
  expect(resolve({ componentId: "c1", variantId: "missing" })).toBeNull();
});
