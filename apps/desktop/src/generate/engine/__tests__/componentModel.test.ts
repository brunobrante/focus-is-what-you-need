import { expect, test } from "bun:test";
import type { SavedComponent, ToolReference } from "../types";
import {
  ensureRootComponent,
  findSpatialParent,
  referenceStackDataFromComponents,
  sourceRootComponentId,
} from "../componentModel";

const reference: ToolReference = {
  id: "reference",
  name: "reference.png",
  type: "PNG",
  w: 390,
  h: 844,
  url: "data:image/png;base64,AA==",
};

function component(
  id: string,
  box: SavedComponent["box"],
  parentId: string | null = sourceRootComponentId(reference.id),
): SavedComponent {
  return {
    id,
    name: id,
    box,
    dataUrl: "data:image/png;base64,AA==",
    type: "PNG",
    createdAt: "2026-01-01T00:00:00.000Z",
    parentId,
  };
}

function root(id: string, box: SavedComponent["box"]): SavedComponent {
  return { ...component(id, box, null), kind: "root", rootId: id, isDefaultRoot: false };
}

test("ensureRootComponent derives the smallest spatial parent", () => {
  const rootId = sourceRootComponentId(reference.id);
  const normalized = ensureRootComponent(
    [
      component("header-label", { x: 24, y: 24, w: 110, h: 18 }, "missing-parent"),
      component("header", { x: 16, y: 16, w: 358, h: 72 }),
      component("content-card", { x: 24, y: 120, w: 342, h: 160 }),
    ],
    reference,
  );

  expect(normalized[0]).toMatchObject({
    id: rootId,
    parentId: null,
    box: { x: 0, y: 0, w: 390, h: 844 },
  });
  expect(normalized.find((entry) => entry.id === "header")?.parentId).toBe(rootId);
  expect(normalized.find((entry) => entry.id === "header-label")?.parentId).toBe("header");
  expect(normalized.find((entry) => entry.id === "content-card")?.parentId).toBe(rootId);
});

test("findSpatialParent falls back to root when no tighter parent contains the component", () => {
  const rootNode = component(sourceRootComponentId(reference.id), { x: 0, y: 0, w: 390, h: 844 }, null);
  const floating = component("floating-action", { x: 304, y: 760, w: 54, h: 54 });
  const sibling = component("toolbar", { x: 16, y: 700, w: 120, h: 48 });

  expect(findSpatialParent(floating, [rootNode, floating, sibling], rootNode.id)?.id).toBe(rootNode.id);
});

test("ensureRootComponent stamps kind and rootId for backward-compatible single-root data", () => {
  const rootId = sourceRootComponentId(reference.id);
  const normalized = ensureRootComponent([component("header", { x: 16, y: 16, w: 358, h: 72 })], reference);

  const rootNode = normalized.find((entry) => entry.id === rootId);
  const header = normalized.find((entry) => entry.id === "header");
  expect(rootNode).toMatchObject({ kind: "root", isDefaultRoot: true, parentId: null, rootId });
  expect(header).toMatchObject({ kind: "cut", parentId: rootId, rootId });
});

test("a redefined (trimmed) default root is preserved, not pinned back to the full image", () => {
  const rootId = sourceRootComponentId(reference.id);
  const trimmed: SavedComponent = {
    ...component(rootId, { x: 12, y: 40, w: 360, h: 760 }, null),
    name: "Root",
    kind: "root",
    rootId,
    isDefaultRoot: false,
  };
  const normalized = ensureRootComponent([trimmed], reference);

  const rootNode = normalized.find((entry) => entry.id === rootId);
  expect(rootNode).toMatchObject({
    box: { x: 12, y: 40, w: 360, h: 760 },
    isDefaultRoot: false,
    parentId: null,
  });
  // No second full-image default root was injected.
  expect(normalized.filter((entry) => entry.parentId == null).length).toBe(1);
});

test("multiple roots keep their cuts independent", () => {
  const cutA = { ...component("cut-a", { x: 10, y: 10, w: 100, h: 50 }), rootId: "root-rA" };
  const cutB = { ...component("cut-b", { x: 10, y: 450, w: 100, h: 50 }), rootId: "root-rB" };
  const normalized = ensureRootComponent(
    [
      root("root-rA", { x: 0, y: 0, w: 390, h: 400 }),
      root("root-rB", { x: 0, y: 440, w: 390, h: 400 }),
      cutA,
      cutB,
    ],
    reference,
  );

  expect(normalized.find((entry) => entry.id === "cut-a")).toMatchObject({
    parentId: "root-rA",
    rootId: "root-rA",
  });
  expect(normalized.find((entry) => entry.id === "cut-b")).toMatchObject({
    parentId: "root-rB",
    rootId: "root-rB",
  });
});

test("spatial inference never steals children across roots", () => {
  // root-rB fully contains root-rA. A cut owned by root-rB sits inside root-rA's
  // region but must still attach to root-rB, never to root-rA.
  const cut = { ...component("cut", { x: 20, y: 20, w: 80, h: 40 }), rootId: "root-rB" };
  const normalized = ensureRootComponent(
    [
      root("root-rA", { x: 0, y: 0, w: 390, h: 500 }),
      root("root-rB", { x: 0, y: 0, w: 390, h: 844 }),
      cut,
    ],
    reference,
  );

  expect(normalized.find((entry) => entry.id === "cut")?.parentId).toBe("root-rB");
});

test("referenceStackDataFromComponents emits roots and cuts as a v2 stack", () => {
  const rootId = sourceRootComponentId(reference.id);
  const components = ensureRootComponent(
    [
      root("root-rA", { x: 0, y: 0, w: 390, h: 400 }),
      { ...component("cut-a", { x: 10, y: 10, w: 100, h: 50 }), rootId: "root-rA" },
    ],
    reference,
  );

  const data = referenceStackDataFromComponents({
    item: reference,
    components,
    rootComponentId: rootId,
    primaryComponentId: rootId,
  });

  expect(data.version).toBe(2);
  expect(data.rootComponentId).toBe(rootId);
  // Two roots: the implicit default (no file) and the explicit one (with a file).
  expect(data.roots?.length).toBe(2);
  const defaultRoot = data.roots?.find((entry) => entry.id === rootId);
  const explicitRoot = data.roots?.find((entry) => entry.id === "root-rA");
  expect(defaultRoot).toMatchObject({ isDefault: true, file: null });
  expect(explicitRoot?.isDefault).toBe(false);
  expect(explicitRoot?.file).toBeTruthy();
  // Cuts carry their owning root and never include a root node.
  expect(data.components.map((entry) => entry.id)).toEqual(["cut-a"]);
  expect(data.components[0]).toMatchObject({ rootId: "root-rA", parentId: "root-rA" });
  expect(data.components[0]?.file).toBeTruthy();
});
