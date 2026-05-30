import { beforeEach, expect, test } from "bun:test";

import { createProject, deleteProject, findProjectByName } from "@/lib/storage/repos/projects.repo";
import { ensureSeededAndMigrated } from "@/lib/storage/seed";
import { TABLES, listTable, replaceTable, resetRecordStoreCache } from "@/lib/storage/store";
import { resetPersistenceSingletons } from "@/infrastructure/persistence/createPersistence";
import type {
  ComponentRow,
  ProjectRow,
  ReferenceRow,
  ScreenRow,
  VariantRow,
} from "@/lib/storage/schema";

class MemoryStorage {
  private rows = new Map<string, string>();

  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }
}

beforeEach(() => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

test("createProject survives the first seed pass", async () => {
  await createProject({ name: "Projeto cliente", type: "desktop" });

  await ensureSeededAndMigrated();

  expect(await findProjectByName("Projeto cliente")).not.toBeNull();
});

test("deleteProject removes project-owned screens, components, variants, and references", async () => {
  const project: ProjectRow = {
    id: "project-1",
    name: "Projeto removível",
    type: "desktop",
    createdAt: 1,
    updatedAt: 1,
  };
  await replaceTable<ProjectRow>(TABLES.projects, [project]);
  await replaceTable<ScreenRow>(TABLES.screens, [
    {
      id: "screen-1",
      projectId: project.id,
      title: "Home",
      variant: "hero",
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  await replaceTable<ComponentRow>(TABLES.components, [
    {
      id: "component-1",
      projectId: project.id,
      screenId: "screen-1",
      parentVariantId: null,
      name: "Header",
      kind: "Layout",
      activeVariantId: "variant-1",
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  await replaceTable<VariantRow>(TABLES.variants, [
    {
      id: "variant-1",
      componentId: "component-1",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  await replaceTable<ReferenceRow>(TABLES.references, [
    {
      id: "reference-1",
      projectId: project.id,
      ownerType: "project",
      ownerId: project.id,
      title: "Ref",
      source: "ref.png",
      origin: "upload",
      bg: "#000",
      accent: "#fff",
      kind: "hero",
      createdAt: 1,
    },
  ]);

  await deleteProject(project.id);

  expect(await listTable<ProjectRow>(TABLES.projects)).toEqual([]);
  expect(await listTable<ScreenRow>(TABLES.screens)).toEqual([]);
  expect(await listTable<ComponentRow>(TABLES.components)).toEqual([]);
  expect(await listTable<VariantRow>(TABLES.variants)).toEqual([]);
  expect(await listTable<ReferenceRow>(TABLES.references)).toEqual([]);
});
