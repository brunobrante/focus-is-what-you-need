import { beforeEach, expect, test } from "bun:test";
import {
  createScreen,
  createScreenVersion,
  listScreens,
  screenVersionLabel,
  screenVersionsFromList,
  updateScreen,
} from "@/lib/storage/repos/screens.repo";
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

test("new screen versions share the name and get stable V-tags", async () => {
  const home = await createScreen({ projectId: "p1", title: "Home", variant: "hero" });
  expect(screenVersionLabel(home)).toBeNull(); // standalone → no tag

  const v2 = await createScreenVersion({ screenId: home.id, mode: "copy" });
  expect(v2?.title).toBe("Home"); // same name, no "(copy)" suffix
  expect(v2?.versionIndex).toBe(2);

  const afterFirst = await listScreens();
  const main = afterFirst.find((s) => s.id === home.id)!;
  expect(main.versionIndex).toBe(1); // original becomes V1 ("main")
  expect(v2?.versionGroupId).toBe(main.versionGroupId);
  expect(screenVersionLabel(main)).toBe("V1");
  expect(screenVersionLabel(v2)).toBe("V2");

  const v3 = await createScreenVersion({ screenId: home.id, mode: "linked" });
  expect(v3?.title).toBe("Home");
  expect(v3?.versionIndex).toBe(3);
});

test("renaming any version renames the whole group", async () => {
  const home = await createScreen({ projectId: "p1", title: "Home", variant: "hero" });
  await createScreenVersion({ screenId: home.id, mode: "copy" });
  const v3 = await createScreenVersion({ screenId: home.id, mode: "copy" });

  // Rename via a non-main member.
  await updateScreen(v3!.id, { title: "Landing" });

  const all = await listScreens();
  const group = screenVersionsFromList(all, all.find((s) => s.id === home.id));
  expect(group.map((s) => s.title)).toEqual(["Landing", "Landing", "Landing"]);
  expect(group.map((s) => screenVersionLabel(s))).toEqual(["V1", "V2", "V3"]);
});
