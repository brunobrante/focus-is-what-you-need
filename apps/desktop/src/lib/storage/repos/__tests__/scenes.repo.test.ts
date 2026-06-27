import { beforeEach, expect, test } from "bun:test";

import {
  htmlCanvasDocumentFromJSON,
  createDefaultHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import { getCanvasMockBundleForScreen } from "@/components/mocks/data/canvasMocks";
import { flushThumbnailJobs } from "@/application/thumbnails/thumbnailQueue";
import { upsertScene } from "@/lib/storage/repos/scenes.repo";
import { setOwner } from "@/lib/storage/repos/edges.repo";
import { TABLES, listTable, replaceTable, resetRecordStoreCache } from "@/lib/storage/store";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { resetEdgeIndex } from "@/application/graph/edgeIndex";
import type { ComponentRow, SceneRow, ThumbnailRow, VariantRow } from "@/lib/storage/schema";

class MemoryStorage {
  private rows = new Map<string, string>();

  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }
}

beforeEach(async () => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  resetEdgeIndex();
  await flushThumbnailJobs();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await replaceTable<ComponentRow>(TABLES.components, []);
  await replaceTable<SceneRow>(TABLES.scenes, []);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, []);
  await replaceTable<VariantRow>(TABLES.variants, []);
});

test("upsertScene keeps the derived snapshot thumbnail in sync", async () => {
  const graphJSON = serializeHtmlCanvasDocument(
    createDefaultHtmlCanvasDocument({
      name: "Header",
      projectType: "mobile",
      targetKind: "variant",
    }),
  );

  await upsertScene({
    ownerType: "variant",
    ownerId: "variant-1",
    graphJSON,
  });
  await flushThumbnailJobs();

  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  expect(thumbnails).toHaveLength(1);
  expect(thumbnails[0]).toMatchObject({
    ownerType: "variant",
    ownerId: "variant-1",
  });
  expect(thumbnails[0]!.dataUrl).toStartWith("data:image/svg+xml;utf8,");
  expect(decodeURIComponent(thumbnails[0]!.dataUrl)).toContain("Header");
});

test("upsertScene propagates connected component snapshots to parent screen", async () => {
  const bundle = await getCanvasMockBundleForScreen(
    { title: "Home", variant: "hero" },
    "mobile",
  );
  expect(bundle).not.toBeNull();
  const header = bundle!.components.find((component) => component.name === "Header")!;

  await replaceTable<VariantRow>(TABLES.variants, [
    {
      id: "variant-home",
      ownerKind: "screen",
      ownerId: "screen-home",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "variant-header",
      ownerKind: "component",
      ownerId: "component-header",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  await replaceTable<ComponentRow>(TABLES.components, [
    {
      id: "component-header",
      projectId: "project-1",
      name: "Header",
      kind: "Layout",
      category: null,
      description: null,
      assignedScreenIds: [],
      activeVariantId: "variant-header",
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  // Screen-top-level master → owned by the screen's main variant (the edge).
  await setOwner({ type: "variant", id: "variant-home" }, { type: "component", id: "component-header" });
  await replaceTable<SceneRow>(TABLES.scenes, [
    {
      id: "variant:variant-home",
      ownerType: "variant",
      ownerId: "variant-home",
      graphJSON: bundle!.screen.graphJSON,
      sceneVersion: 1,
      updatedAt: 1,
    },
    {
      id: "variant:variant-header",
      ownerType: "variant",
      ownerId: "variant-header",
      graphJSON: header.canvas.graphJSON,
      sceneVersion: 1,
      updatedAt: 1,
    },
  ]);

  const editedHeader = htmlCanvasDocumentFromJSON(header.canvas.graphJSON)!;
  const titleNode = editedHeader.nodes.find((node) => node.text === "Operational Summary");
  expect(titleNode).toBeDefined();
  titleNode!.text = "Updated Summary";
  const editedHeaderGraphJSON = serializeHtmlCanvasDocument(editedHeader);

  await upsertScene({
    ownerType: "variant",
    ownerId: "variant-header",
    graphJSON: editedHeaderGraphJSON,
  });
  await flushThumbnailJobs();

  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const screenScene = scenes.find(
    (scene) => scene.ownerType === "variant" && scene.ownerId === "variant-home",
  );
  expect(screenScene?.graphJSON).toContain("Updated Summary");

  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  const screenThumbnail = thumbnails.find(
    (thumbnail) => thumbnail.ownerType === "variant" && thumbnail.ownerId === "variant-home",
  );
  expect(screenThumbnail?.dataUrl).toStartWith("data:image/svg+xml;utf8,");
  expect(decodeURIComponent(screenThumbnail!.dataUrl)).toContain("Updated Summary");
});

test("upsertScene propagates connected nested component snapshots through every parent", async () => {
  const bundle = await getCanvasMockBundleForScreen(
    { title: "Home", variant: "hero" },
    "mobile",
  );
  expect(bundle).not.toBeNull();
  const header = bundle!.components.find((component) => component.name === "Header")!;
  const logo = header.children.find((component) => component.name === "Logo Design")!;

  await replaceTable<VariantRow>(TABLES.variants, [
    {
      id: "variant-home",
      ownerKind: "screen",
      ownerId: "screen-home",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "variant-header",
      ownerKind: "component",
      ownerId: "component-header",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "variant-logo",
      ownerKind: "component",
      ownerId: "component-logo",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  await replaceTable<ComponentRow>(TABLES.components, [
    {
      id: "component-header",
      projectId: "project-1",
      name: "Header",
      kind: "Layout",
      category: null,
      description: null,
      assignedScreenIds: [],
      activeVariantId: "variant-header",
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "component-logo",
      projectId: "project-1",
      name: "Logo Design",
      kind: "Atom",
      category: null,
      description: null,
      assignedScreenIds: [],
      activeVariantId: "variant-logo",
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  // Ownership edges: header is screen-top-level (owned by the screen's main
  // variant), logo is nested under the header component's variant.
  await setOwner({ type: "variant", id: "variant-home" }, { type: "component", id: "component-header" });
  await setOwner({ type: "variant", id: "variant-header" }, { type: "component", id: "component-logo" });
  await replaceTable<SceneRow>(TABLES.scenes, [
    {
      id: "variant:variant-home",
      ownerType: "variant",
      ownerId: "variant-home",
      graphJSON: bundle!.screen.graphJSON,
      sceneVersion: 1,
      updatedAt: 1,
    },
    {
      id: "variant:variant-header",
      ownerType: "variant",
      ownerId: "variant-header",
      graphJSON: header.canvas.graphJSON,
      sceneVersion: 1,
      updatedAt: 1,
    },
    {
      id: "variant:variant-logo",
      ownerType: "variant",
      ownerId: "variant-logo",
      graphJSON: logo.canvas.graphJSON,
      sceneVersion: 1,
      updatedAt: 1,
    },
  ]);

  const editedLogo = htmlCanvasDocumentFromJSON(logo.canvas.graphJSON)!;
  const initialsNode = editedLogo.nodes.find((node) => node.text === "AO");
  expect(initialsNode).toBeDefined();
  initialsNode!.text = "ZX";
  const editedLogoGraphJSON = serializeHtmlCanvasDocument(editedLogo);

  await upsertScene({
    ownerType: "variant",
    ownerId: "variant-logo",
    graphJSON: editedLogoGraphJSON,
  });
  await flushThumbnailJobs();

  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const headerScene = scenes.find(
    (scene) => scene.ownerType === "variant" && scene.ownerId === "variant-header",
  );
  const screenScene = scenes.find(
    (scene) => scene.ownerType === "variant" && scene.ownerId === "variant-home",
  );
  expect(headerScene?.graphJSON).toContain("ZX");
  expect(headerScene?.sceneVersion).toBe(2);
  expect(screenScene?.graphJSON).toContain("ZX");
  expect(screenScene?.sceneVersion).toBe(2);

  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  const headerThumbnail = thumbnails.find(
    (thumbnail) => thumbnail.ownerType === "variant" && thumbnail.ownerId === "variant-header",
  );
  const screenThumbnail = thumbnails.find(
    (thumbnail) => thumbnail.ownerType === "variant" && thumbnail.ownerId === "variant-home",
  );
  expect(decodeURIComponent(headerThumbnail!.dataUrl)).toContain("ZX");
  expect(decodeURIComponent(screenThumbnail!.dataUrl)).toContain("ZX");
});

test("upsertScene replaces duplicate-name siblings by sourceNodeId", async () => {
  await replaceTable<VariantRow>(TABLES.variants, [
    {
      id: "variant-screen-1",
      ownerKind: "screen",
      ownerId: "screen-1",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "variant-green",
      ownerKind: "component",
      ownerId: "component-green",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  await replaceTable<ComponentRow>(TABLES.components, [
    {
      id: "component-green",
      projectId: "project-1",
      name: "Rectangle",
      kind: "Custom",
      category: null,
      description: null,
      assignedScreenIds: [],
      sourceNodeId: "green-wrapper",
      activeVariantId: "variant-green",
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  // Screen-top-level master → owned by the screen's main variant.
  await setOwner({ type: "variant", id: "variant-screen-1" }, { type: "component", id: "component-green" });

  await replaceTable<SceneRow>(TABLES.scenes, [
    {
      id: "variant:variant-screen-1",
      ownerType: "variant",
      ownerId: "variant-screen-1",
      graphJSON: duplicateRectangleScreenGraph(),
      sceneVersion: 1,
      updatedAt: 1,
    },
    {
      id: "variant:variant-green",
      ownerType: "variant",
      ownerId: "variant-green",
      graphJSON: duplicateRectangleComponentGraph("#74BF3F"),
      sceneVersion: 1,
      updatedAt: 1,
    },
  ]);

  await upsertScene({
    ownerType: "variant",
    ownerId: "variant-green",
    graphJSON: duplicateRectangleComponentGraph("#0066FF"),
  });

  const screenScene = (await listTable<SceneRow>(TABLES.scenes)).find(
    (scene) => scene.ownerType === "variant" && scene.ownerId === "variant-screen-1",
  );
  const screenDocument = htmlCanvasDocumentFromJSON(screenScene!.graphJSON)!;
  const orangeChild = screenDocument.nodes.find((node) => node.id === "orange-child");
  const greenChild = screenDocument.nodes.find((node) => node.id === "green-child");

  expect(orangeChild?.style.background).toBe("#FF6B00");
  expect(greenChild?.style.background).toBe("#0066FF");
});

function duplicateRectangleScreenGraph(): string {
  return serializeHtmlCanvasDocument({
    format: "html-css-canvas",
    version: 1,
    rootId: "screen-root",
    viewport: { width: 320, height: 420 },
    nodes: [
      testNode("screen-root", null, "Screen", 0, 0, 320, 420, "#F7F7F2", 0),
      testNode("orange-wrapper", "screen-root", "Rectangle", 72, 43, 158, 126, "#DDEBFF", 0),
      testNode("orange-child", "orange-wrapper", "Rectangle", 12, 24, 134, 76, "#FF6B00", 0),
      testNode("green-wrapper", "screen-root", "Rectangle", 47, 227, 160, 126, "#DDEBFF", 1),
      testNode("green-child", "green-wrapper", "Rectangle", 12, 24, 136, 78, "#74BF3F", 0),
    ],
    updatedAt: 1,
  });
}

function duplicateRectangleComponentGraph(background: string): string {
  return serializeHtmlCanvasDocument({
    format: "html-css-canvas",
    version: 1,
    rootId: "green-canvas",
    viewport: { width: 160, height: 126 },
    nodes: [
      testNode("green-canvas", null, "Rectangle Canvas", 0, 0, 160, 126, "transparent", 0),
      testNode("green-wrapper", "green-canvas", "Rectangle", 0, 0, 160, 126, "#DDEBFF", 0),
      testNode("green-child", "green-wrapper", "Rectangle", 12, 24, 136, 78, background, 0),
    ],
    updatedAt: 1,
  });
}

function testNode(
  id: string,
  parentId: string | null,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  background: string,
  order: number,
) {
  return {
    id,
    parentId,
    name,
    kind: "frame" as const,
    tag: "div" as const,
    cssId: id,
    className: id,
    order,
    bounds: { x, y, width, height },
    style: {
      background,
      color: "#17211D",
      opacity: 1,
      borderColor: "transparent",
      borderWidth: 0,
      borderStyle: "none" as const,
      borderRadius: 0,
      shadow: "none",
      display: "block" as const,
      flexDirection: "column" as const,
      align: "start" as const,
      justify: "start" as const,
      gap: 0,
      paddingX: 0,
      paddingY: 0,
      marginX: 0,
      marginY: 0,
      widthMode: "fixed" as const,
      heightMode: "fixed" as const,
      rotation: 0,
      fontFamily: "Inter",
      fontSize: 14,
      fontWeight: 400,
      textAlign: "left" as const,
      objectFit: "cover" as const,
      overflow: "visible" as const,
    },
    text: null,
    imageUrl: null,
    appearance: "rect" as const,
    visible: true,
    locked: false,
  };
}
