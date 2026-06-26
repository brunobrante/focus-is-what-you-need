import { expect, test } from "bun:test";

import {
  collectDescendantIds,
  collectDescendantIdsFrom,
  groupNodesByParent,
  subjectNodeForDocument,
  uniqueNodeId,
} from "@/lib/canvas/htmlScene/graphNodeHelpers";
import type { HtmlCanvasDocument, HtmlCanvasNode } from "@/lib/canvas/htmlScene/types";

// The helpers read only id/parentId/name/bounds/order, so build minimal nodes.
function node(partial: Partial<HtmlCanvasNode> & { id: string }): HtmlCanvasNode {
  return {
    id: partial.id,
    parentId: partial.parentId ?? null,
    name: partial.name ?? partial.id,
    order: partial.order ?? 0,
    bounds: partial.bounds ?? { x: 0, y: 0, width: 100, height: 100 },
  } as HtmlCanvasNode;
}

function doc(rootId: string, nodes: HtmlCanvasNode[]): HtmlCanvasDocument {
  return { rootId, nodes } as HtmlCanvasDocument;
}

test("subjectNodeForDocument unwraps a '<name> Canvas' root to its sole full-bleed child", () => {
  const root = node({ id: "r", name: "Home Canvas", bounds: { x: 0, y: 0, width: 390, height: 844 } });
  const child = node({ id: "c", parentId: "r", bounds: { x: 0, y: 0, width: 390, height: 844 } });
  expect(subjectNodeForDocument(doc("r", [root, child]))?.id).toBe("c");
});

test("subjectNodeForDocument returns the root when there is no Canvas wrapper", () => {
  const root = node({ id: "r", name: "Card", bounds: { x: 0, y: 0, width: 200, height: 80 } });
  const child = node({ id: "c", parentId: "r", bounds: { x: 10, y: 10, width: 50, height: 20 } });
  expect(subjectNodeForDocument(doc("r", [root, child]))?.id).toBe("r");
});

test("subjectNodeForDocument is null when the root id is missing", () => {
  expect(subjectNodeForDocument(doc("missing", [node({ id: "x" })]))).toBeNull();
});

test("groupNodesByParent groups children and sorts them by order", () => {
  const groups = groupNodesByParent([
    node({ id: "b", parentId: "p", order: 2 }),
    node({ id: "a", parentId: "p", order: 1 }),
    node({ id: "root" }), // no parent — skipped
  ]);
  expect(groups.get("p")?.map((n) => n.id)).toEqual(["a", "b"]);
  expect(groups.has("root")).toBe(false);
});

test("collectDescendantIds walks the whole subtree", () => {
  const ids = collectDescendantIds(
    [
      node({ id: "p" }),
      node({ id: "a", parentId: "p" }),
      node({ id: "b", parentId: "a" }),
      node({ id: "other" }),
    ],
    "p",
  );
  expect([...ids].sort()).toEqual(["a", "b"]);
});

test("collectDescendantIdsFrom terminates on a cyclic parent map (guard)", () => {
  // a -> b -> a: a malformed cycle must not loop forever.
  const byParent = new Map<string, HtmlCanvasNode[]>([
    ["a", [node({ id: "b", parentId: "a" })]],
    ["b", [node({ id: "a", parentId: "b" })]],
  ]);
  const ids = collectDescendantIdsFrom(byParent, "a");
  expect([...ids].sort()).toEqual(["a", "b"]);
});

test("uniqueNodeId returns the preferred id, then suffixes on collision", () => {
  expect(uniqueNodeId("n", new Set())).toBe("n");
  expect(uniqueNodeId("n", new Set(["n"]))).toBe("n-1");
  expect(uniqueNodeId("n", new Set(["n", "n-1"]))).toBe("n-2");
});
