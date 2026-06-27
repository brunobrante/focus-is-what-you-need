import { beforeEach, expect, test } from "bun:test";
import { componentPathFromRoot } from "@/canvas/canvasUtils";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { TABLES, putRecord, resetRecordStoreCache } from "@/lib/storage/store";
import { primeEdgeIndex, resetEdgeIndex } from "@/application/graph/edgeIndex";
import { setOwner } from "@/lib/storage/repos/edges.repo";
import type { ComponentRow, VariantRow } from "@/lib/storage/schema";

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(k: string) { return this.rows.get(k) ?? null; }
  setItem(k: string, v: string) { this.rows.set(k, v); }
  removeItem(k: string) { this.rows.delete(k); }
}

beforeEach(() => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  resetEdgeIndex();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

// Ownership is the edge now, so componentPathFromRoot resolves screenId/parentVariantId
// off the graph (not row fields). Rows only carry id/name/activeVariantId.
function comp(p: { id: string; name: string; activeVariantId: string }): ComponentRow {
  return { id: p.id, name: p.name, activeVariantId: p.activeVariantId } as unknown as ComponentRow;
}

function seedVariant(id: string, ownerKind: "screen" | "component", ownerId: string, order = 0): void {
  putRecord<VariantRow>(TABLES.variants, {
    id, ownerKind, ownerId, name: id, order, seedKey: null, createdAt: 1, updatedAt: 1,
  } as VariantRow);
}

async function own(componentId: string, variantId: string): Promise<void> {
  await setOwner({ type: "variant", id: variantId }, { type: "component", id: componentId });
}

// A component created directly in a screen's main resolves to that screen.
test("screen-owned component resolves to its screen", async () => {
  seedVariant("v-screen-main", "screen", "screen-1", 0);
  await own("c1", "v-screen-main");
  await primeEdgeIndex();
  const c = comp({ id: "c1", name: "Header", activeVariantId: "v-c1" });
  expect(componentPathFromRoot(c, [c])).toEqual({ screenId: "screen-1", names: ["Header"] });
});

// A nested component (owned by a parent component's variant) climbs to the screen.
test("nested component climbs through the parent component to the screen", async () => {
  seedVariant("v-screen-main", "screen", "screen-1", 0);
  seedVariant("v-c1", "component", "c1", 0);
  await own("c1", "v-screen-main");
  await own("c2", "v-c1");
  await primeEdgeIndex();
  const parent = comp({ id: "c1", name: "Header", activeVariantId: "v-c1" });
  const child = comp({ id: "c2", name: "Logo", activeVariantId: "v-c2" });
  expect(componentPathFromRoot(child, [parent, child])).toEqual({
    screenId: "screen-1",
    names: ["Header", "Logo"],
  });
});

// A component owned by a screen's VERSION variant resolves to that screen — a versioned
// screen is a normal screen. The variants param lets the tail recognize the screen-owned
// variant when no component owns it as its active variant.
test("version-owned component resolves to its screen when variants are provided", async () => {
  seedVariant("v-screen-version-1", "screen", "screen-1", 1);
  await own("c3", "v-screen-version-1");
  await primeEdgeIndex();
  const versioned = comp({ id: "c3", name: "Header", activeVariantId: "v-c3" });
  const variants = [
    { id: "v-screen-version-1", ownerKind: "screen", ownerId: "screen-1" },
    { id: "v-screen-main", ownerKind: "screen", ownerId: "screen-1" },
  ];
  expect(componentPathFromRoot(versioned, [versioned], variants)).toEqual({
    screenId: "screen-1",
    names: ["Header"],
  });
});

// Without the variants list, a version-owned component cannot be resolved (back-compat
// path) — it falls through to a null screen rather than throwing.
test("version-owned component yields a null screen without the variants list", async () => {
  seedVariant("v-screen-version-1", "screen", "screen-1", 1);
  await own("c3", "v-screen-version-1");
  await primeEdgeIndex();
  const versioned = comp({ id: "c3", name: "Header", activeVariantId: "v-c3" });
  expect(componentPathFromRoot(versioned, [versioned])).toEqual({
    screenId: null,
    names: ["Header"],
  });
});
