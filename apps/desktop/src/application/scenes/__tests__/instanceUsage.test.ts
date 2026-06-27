import { beforeEach, expect, test } from "bun:test";

import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { resetRecordStoreCache } from "@/lib/storage/store";
import {
  createBlankHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
} from "@/domain/canvas/htmlScene/document";
import { makeNode } from "@/domain/canvas/htmlScene/nodeHelpers";
import {
  deriveSceneUsage,
  instanceUsageForComponents,
  primeInstanceUsage,
  reconcileSceneUsage,
  reconcileSceneUsageSync,
  resetInstanceUsageRebuilt,
} from "@/application/scenes/instanceUsage";

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }
  removeItem(key: string): void {
    this.rows.delete(key);
  }
}

beforeEach(() => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  resetInstanceUsageRebuilt();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

function sceneWith(
  instances: Array<{ nodeId: string; componentId: string; variantId: string }>,
): string {
  const doc = createBlankHtmlCanvasDocument({ name: "S", width: 100, height: 100 });
  const nodes = instances.map((inst, i) => ({
    ...makeNode({
      id: inst.nodeId,
      parentId: doc.rootId,
      name: "Inst",
      type: "frame",
      order: i + 1,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      props: {},
    }),
    instanceOf: { componentId: inst.componentId, variantId: inst.variantId },
  }));
  return serializeHtmlCanvasDocument({ ...doc, nodes: [...doc.nodes, ...nodes] });
}

test("deriveSceneUsage extracts one row per instance node", () => {
  const json = sceneWith([
    { nodeId: "n1", componentId: "c1", variantId: "v1" },
    { nodeId: "n2", componentId: "c2", variantId: "v2" },
  ]);
  const rows = deriveSceneUsage("ownerVar", json);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    id: "ownerVar:n1",
    componentId: "c1",
    variantId: "v1",
    ownerVariantId: "ownerVar",
    nodeId: "n1",
  });
});

test("reconcile + index resolves usage by component", async () => {
  await reconcileSceneUsage(
    "variant",
    "varA",
    sceneWith([{ nodeId: "n1", componentId: "c1", variantId: "v1" }]),
  );
  const rows = await instanceUsageForComponents(new Set(["c1"]));
  expect(rows.map((r) => r.ownerVariantId)).toEqual(["varA"]);
  expect(await instanceUsageForComponents(new Set(["other"]))).toHaveLength(0);
});

test("sync reconcile (warm cache) adds and reaps without awaiting a list", async () => {
  // Warm the cache so the sync peek sees existing rows (the boot prime).
  await primeInstanceUsage();
  reconcileSceneUsageSync(
    "variant",
    "varB",
    sceneWith([
      { nodeId: "n1", componentId: "c1", variantId: "v1" },
      { nodeId: "n2", componentId: "c1", variantId: "v1" },
    ]),
  );
  expect(await instanceUsageForComponents(new Set(["c1"]))).toHaveLength(2);
  // Re-save with n2 gone — the sync peek now sees the two rows it just wrote.
  reconcileSceneUsageSync(
    "variant",
    "varB",
    sceneWith([{ nodeId: "n1", componentId: "c1", variantId: "v1" }]),
  );
  expect(await instanceUsageForComponents(new Set(["c1"]))).toHaveLength(1);
});

test("reconcile removes stale rows when an instance is deleted", async () => {
  await reconcileSceneUsage(
    "variant",
    "varA",
    sceneWith([
      { nodeId: "n1", componentId: "c1", variantId: "v1" },
      { nodeId: "n2", componentId: "c1", variantId: "v1" },
    ]),
  );
  expect(await instanceUsageForComponents(new Set(["c1"]))).toHaveLength(2);
  // Re-save with n2 gone — its usage row must be reaped.
  resetInstanceUsageRebuilt();
  await reconcileSceneUsage(
    "variant",
    "varA",
    sceneWith([{ nodeId: "n1", componentId: "c1", variantId: "v1" }]),
  );
  expect(await instanceUsageForComponents(new Set(["c1"]))).toHaveLength(1);
});
