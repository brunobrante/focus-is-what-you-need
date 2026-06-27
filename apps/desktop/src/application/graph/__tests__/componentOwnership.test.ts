import { beforeEach, expect, test } from "bun:test";

import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { TABLES, putRecord, resetRecordStoreCache } from "@/lib/storage/store";
import { resetEdgeIndex, primeEdgeIndex } from "@/application/graph/edgeIndex";
import { setOwner } from "@/lib/storage/repos/edges.repo";
import {
  parentVariantIdOf,
  screenIdOfComponent,
} from "@/application/graph/componentOwnership";
import type { VariantRow } from "@/lib/storage/schema";

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
  resetEdgeIndex();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

const t = 0;

function seedVariant(
  id: string,
  ownerKind: "screen" | "component",
  ownerId: string,
  order: number,
): void {
  putRecord<VariantRow>(TABLES.variants, {
    id,
    ownerKind,
    ownerId,
    name: id,
    order,
    seedKey: null,
    createdAt: t,
    updatedAt: t,
  } as VariantRow);
}

async function own(ownerType: "variant" | "project" | "workspace", ownerId: string, componentId: string) {
  await setOwner({ type: ownerType, id: ownerId }, { type: "component", id: componentId });
  await primeEdgeIndex();
}

test("owned by a screen's MAIN variant → screenId, no parentVariantId", async () => {
  seedVariant("v-main", "screen", "s1", 0);
  await own("variant", "v-main", "c1");

  expect(screenIdOfComponent("c1")).toBe("s1");
  expect(parentVariantIdOf("c1")).toBeNull();
});

test("owned by a component variant → parentVariantId, no screenId", async () => {
  seedVariant("v-comp", "component", "parent-c", 0);
  await own("variant", "v-comp", "c1");

  expect(parentVariantIdOf("c1")).toBe("v-comp");
  expect(screenIdOfComponent("c1")).toBeNull();
});

test("owned by a screen VERSION variant (order > 0) → parentVariantId, not screenId", async () => {
  // Copy-version children of a screen are owned by the version variant, which is a
  // screen variant with order > 0 — that is parentVariantId, NOT screen-top-level.
  seedVariant("v-version", "screen", "s1", 1);
  await own("variant", "v-version", "c1");

  expect(parentVariantIdOf("c1")).toBe("v-version");
  expect(screenIdOfComponent("c1")).toBeNull();
});

test("project- or workspace-global → both null", async () => {
  await own("project", "p1", "cp");
  await own("workspace", "w1", "cw");

  expect(screenIdOfComponent("cp")).toBeNull();
  expect(parentVariantIdOf("cp")).toBeNull();
  expect(screenIdOfComponent("cw")).toBeNull();
  expect(parentVariantIdOf("cw")).toBeNull();
});

test("draft (no owner edge) → both null", async () => {
  await primeEdgeIndex();
  expect(screenIdOfComponent("draft")).toBeNull();
  expect(parentVariantIdOf("draft")).toBeNull();
});
