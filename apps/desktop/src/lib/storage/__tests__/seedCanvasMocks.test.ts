import { beforeEach, expect, test } from "bun:test";

import {
  getCanvasMockDataset,
} from "@/components/mocks/data/canvasMocks";
import { canvasDocumentFromHtmlGraphJSON } from "@/canvas/engine/htmlSceneAdapter";
import { parentVariantIdOf, screenIdOfComponent } from "@/application/graph/componentOwnership";
import { ensureSeededAndMigrated } from "@/lib/storage/seed";
import { TABLES, listTable, replaceTable, resetRecordStoreCache, setMeta } from "@/lib/storage/store";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import type {
  ComponentRow,
  Meta,
  ProjectRow,
  SceneRow,
  ScreenRow,
  ThumbnailRow,
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

test("fresh seed writes screen and component canvas scenes for hierarchical mocks", async () => {
  await ensureSeededAndMigrated();

  const mocks = await getCanvasMockDataset();
  const projects = await listTable<ProjectRow>(TABLES.projects);
  const screens = await listTable<ScreenRow>(TABLES.screens);
  const components = await listTable<ComponentRow>(TABLES.components);
  const variants = await listTable<VariantRow>(TABLES.variants);
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);

  const mobileProject = projects.find((project) => project.type === "mobile");
  const desktopProject = projects.find((project) => project.type === "desktop");
  const alignmentProject = projects.find((project) => project.name === "Alignment Debug");
  const mobileHome = screens.find(
    (screen) => screen.projectId === mobileProject?.id && screen.title === "Home",
  );
  const desktopForm = screens.find(
    (screen) =>
      screen.projectId === desktopProject?.id && screen.title === "Form",
  );
  const mobileList = screens.find(
    (screen) =>
      screen.projectId === mobileProject?.id && screen.title === "List",
  );
  const alignmentScreen = screens.find(
    (screen) =>
      screen.projectId === alignmentProject?.id && screen.title === "Alignment Debug",
  );

  expect(mobileHome).toBeDefined();
  expect(desktopForm).toBeDefined();
  expect(mobileList).toBeDefined();
  expect(alignmentProject).toBeDefined();
  expect(alignmentScreen).toBeDefined();
  expect(
    screens
      .filter((screen) => screen.projectId === desktopProject?.id)
      .map((screen) => screen.title),
  ).toEqual(["Home", "List", "Detail", "Form"]);

  // A screen's scene/thumbnail lives on its main (active) variant.
  const sceneFor = (screenId: string) => {
    const screen = screens.find((s) => s.id === screenId);
    return scenes.find(
      (scene) => scene.ownerType === "variant" && scene.ownerId === screen?.activeVariantId,
    );
  };
  const thumbFor = (screenId: string) => {
    const screen = screens.find((s) => s.id === screenId);
    return thumbnails.find(
      (thumb) => thumb.ownerType === "variant" && thumb.ownerId === screen?.activeVariantId,
    );
  };

  expect(sceneFor(mobileHome!.id)?.graphJSON).toBe(
    mocks["mock-mobile-home"].graphJSON,
  );
  expect(sceneFor(desktopForm!.id)?.graphJSON).toBe(
    mocks["mock-desktop-formulario"].graphJSON,
  );
  expect(sceneFor(mobileList!.id)?.graphJSON).toBe(
    mocks["mock-mobile-list"].graphJSON,
  );
  expect(sceneFor(alignmentScreen!.id)?.graphJSON).toBe(
    mocks["mock-mobile-alignment-debug"].graphJSON,
  );
  expect(thumbFor(mobileHome!.id)?.dataUrl).toBe(
    mocks["mock-mobile-home"].snapshot,
  );

  const mobileHomeDocument = canvasDocumentFromHtmlGraphJSON(
    sceneFor(mobileHome!.id)!.graphJSON,
  )!;
  expect(mobileHomeDocument.rootIds).toHaveLength(1);
  const mobileHomeRoot = mobileHomeDocument.elements[mobileHomeDocument.rootIds[0]!];
  expect(mobileHomeRoot?.name).toBe("Home");
  expect(mobileHomeRoot?.locked).toBe(true);

  const mobileHomeComponents = components.filter(
    (component) =>
      screenIdOfComponent(component.id) === mobileHome!.id,
  );
  expect(mobileHomeComponents.map((component) => component.name)).toEqual([
    "Header",
    "Hero Banner",
    "Category Strip",
    "Featured List",
    "Mobile App Cart",
  ]);

  const header = mobileHomeComponents.find((component) => component.name === "Header");
  expect(header).toBeDefined();

  const alignmentComponents = components.filter(
    (component) =>
      screenIdOfComponent(component.id) === alignmentScreen!.id,
  );
  expect(alignmentComponents.map((component) => component.name)).toEqual([
    "Red Alignment Box",
  ]);

  const headerVariant = variants.find(
    (variant) => variant.ownerKind === "component" && variant.ownerId === header?.id,
  );
  expect(headerVariant).toBeDefined();
  expect(
    scenes.some(
      (scene) =>
        scene.ownerType === "variant" && scene.ownerId === headerVariant!.id,
    ),
  ).toBe(true);
  const headerScene = scenes.find(
    (scene) =>
      scene.ownerType === "variant" && scene.ownerId === headerVariant!.id,
  );
  const headerDocument = canvasDocumentFromHtmlGraphJSON(headerScene!.graphJSON)!;
  expect(headerDocument.rootIds).toHaveLength(1);
  const headerRoot = headerDocument.elements[headerDocument.rootIds[0]!];
  expect(headerRoot?.name).toBe("Header");
  expect(headerRoot?.locked).toBe(true);
  expect(headerRoot?.children.map((id) => headerDocument.elements[id]?.name)).toEqual([
    "Logo Design",
    "Header Copy",
    "Search Button",
  ]);
  expect(
    thumbnails.some(
      (thumbnail) =>
        thumbnail.ownerType === "variant" &&
        thumbnail.ownerId === headerVariant!.id,
    ),
  ).toBe(true);
  expect(variants.every((variant) => variant.seedKey === null)).toBe(true);
});

test("v7 migration repairs missing mock hierarchy, scenes, and thumbnails", async () => {
  // Schema mismatch (7 ≠ current) triggers a full reseed, wiping any stale state.
  // The test verifies the resulting seed contains the correct hierarchy for the
  // mobile Home screen.
  setMeta<Meta>({ schemaVersion: 7, seededAt: 1 });

  await replaceTable<ProjectRow>(TABLES.projects, []);
  await replaceTable<ScreenRow>(TABLES.screens, []);
  await replaceTable<ComponentRow>(TABLES.components, []);
  await replaceTable<VariantRow>(TABLES.variants, []);
  await replaceTable<SceneRow>(TABLES.scenes, []);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, []);

  await ensureSeededAndMigrated();

  const projects = await listTable<ProjectRow>(TABLES.projects);
  const screens = await listTable<ScreenRow>(TABLES.screens);
  const components = await listTable<ComponentRow>(TABLES.components);
  const variants = await listTable<VariantRow>(TABLES.variants);
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);

  const mobileProject = projects.find(
    (p) => p.type === "mobile" && p.name !== "Alignment Debug",
  );
  const homeScreen = screens.find(
    (s) => s.projectId === mobileProject?.id && s.title === "Home",
  );
  expect(homeScreen).toBeDefined();

  const topLevel = components
    .filter((c) => screenIdOfComponent(c.id) === homeScreen!.id)
    .sort((a, b) => a.order - b.order);
  expect(topLevel.map((c) => c.name)).toEqual([
    "Header",
    "Hero Banner",
    "Category Strip",
    "Featured List",
    "Mobile App Cart",
  ]);
  expect(
    components.some((c) => parentVariantIdOf(c.id) === topLevel[0]!.activeVariantId),
  ).toBe(true);
  // One variant per component, plus one main variant per screen.
  expect(variants).toHaveLength(components.length + screens.length);

  // A screen's scene/thumbnail lives on its main (active) variant.
  expect(
    scenes.some((s) => s.ownerType === "variant" && s.ownerId === homeScreen!.activeVariantId),
  ).toBe(true);
  expect(
    thumbnails.some((t) => t.ownerType === "variant" && t.ownerId === homeScreen!.activeVariantId),
  ).toBe(true);

  // The screen's main variant is owned by the screen.
  const homeMainVariant = variants.find(
    (v) => v.ownerKind === "screen" && v.ownerId === homeScreen!.id,
  );
  expect(homeMainVariant?.id).toBe(homeScreen!.activeVariantId);
});

test("v9 migration replaces stale full-screen component scenes with component-sized scenes", async () => {
  // Schema mismatch (9 ≠ current) triggers a full reseed. The stale data
  // (component scenes sized as the full screen) is wiped and replaced by the
  // correctly component-sized scenes from the fresh seed.
  setMeta<Meta>({ schemaVersion: 9, seededAt: 1 });

  await replaceTable<ProjectRow>(TABLES.projects, []);
  await replaceTable<ScreenRow>(TABLES.screens, []);
  await replaceTable<ComponentRow>(TABLES.components, []);
  await replaceTable<VariantRow>(TABLES.variants, []);
  await replaceTable<SceneRow>(TABLES.scenes, []);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, []);

  await ensureSeededAndMigrated();

  const projects = await listTable<ProjectRow>(TABLES.projects);
  const screens = await listTable<ScreenRow>(TABLES.screens);
  const components = await listTable<ComponentRow>(TABLES.components);
  const scenes = await listTable<SceneRow>(TABLES.scenes);

  const mobileProject = projects.find(
    (p) => p.type === "mobile" && p.name !== "Alignment Debug",
  );
  const homeScreen = screens.find(
    (s) => s.projectId === mobileProject?.id && s.title === "Home",
  );
  expect(homeScreen).toBeDefined();

  const header = components.find(
    (c) => screenIdOfComponent(c.id) === homeScreen!.id && c.name === "Header",
  );
  expect(header).toBeDefined();

  const headerScene = scenes.find(
    (s) => s.ownerType === "variant" && s.ownerId === header!.activeVariantId,
  );
  expect(headerScene).toBeDefined();

  const headerDocument = canvasDocumentFromHtmlGraphJSON(headerScene!.graphJSON)!;
  expect(headerDocument.canvas.width).toBe(342);
  expect(headerDocument.canvas.height).toBe(72);
  const headerRoot = headerDocument.elements[headerDocument.rootIds[0]!];
  expect(headerRoot?.name).toBe("Header");
  expect(headerRoot?.locked).toBe(true);

  const logo = components.find(
    (c) => parentVariantIdOf(c.id) === header!.activeVariantId && c.name === "Logo Design",
  );
  expect(logo).toBeDefined();
  const logoScene = scenes.find(
    (s) => s.ownerType === "variant" && s.ownerId === logo!.activeVariantId,
  );
  const logoDocument = canvasDocumentFromHtmlGraphJSON(logoScene!.graphJSON)!;
  expect(logoDocument.canvas.width).toBe(52);
  expect(logoDocument.canvas.height).toBe(52);
  expect(logoDocument.elements[logoDocument.rootIds[0]!]?.name).toBe("Logo Design");
});
