import { beforeEach, expect, test } from "bun:test";
import {
  createScreen,
  createScreenVersion,
} from "@/lib/storage/repos/screens.repo";
import {
  isMainVariant,
  listVariantsByScreen,
  variantVersionLabel,
} from "@/lib/storage/repos/variants.repo";
import { TABLES, replaceTable, resetRecordStoreCache } from "@/lib/storage/store";
import { resetPersistenceSingletons } from "@/infrastructure/persistence/createPersistence";
import type { ComponentRow, SceneRow, ScreenRow, ThumbnailRow, VariantRow } from "@/lib/storage/schema";

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

beforeEach(async () => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await replaceTable<ScreenRow>(TABLES.screens, []);
  await replaceTable<ComponentRow>(TABLES.components, []);
  await replaceTable<SceneRow>(TABLES.scenes, []);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, []);
  await replaceTable<VariantRow>(TABLES.variants, []);
});

test("a new screen owns a single main variant", async () => {
  const home = await createScreen({ projectId: "p1", title: "Home", variant: "hero" });

  const variants = await listVariantsByScreen(home.id);
  expect(variants).toHaveLength(1);
  expect(variants[0]!.id).toBe(home.activeVariantId);
  expect(variants[0]!.ownerKind).toBe("screen");
  expect(isMainVariant(variants[0]!)).toBe(true);
  expect(variantVersionLabel(variants[0]!)).toBe("main");
});

test("screen versions are variants of the screen with stable V-tags", async () => {
  const home = await createScreen({ projectId: "p1", title: "Home", variant: "hero" });

  const v1 = await createScreenVersion({ screenId: home.id, mode: "copy" });
  expect(v1?.ownerKind).toBe("screen");
  expect(v1?.ownerId).toBe(home.id);
  expect(variantVersionLabel(v1!)).toBe("V1");

  const v2 = await createScreenVersion({ screenId: home.id, mode: "linked" });
  expect(variantVersionLabel(v2!)).toBe("V2");

  // The original is "main"; the first version created is V1.
  const variants = await listVariantsByScreen(home.id);
  expect(variants.map((v) => variantVersionLabel(v))).toEqual(["main", "V1", "V2"]);
});
