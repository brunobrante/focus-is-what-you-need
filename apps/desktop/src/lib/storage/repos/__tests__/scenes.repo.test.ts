import { beforeEach, expect, test } from "bun:test";

import {
  htmlCanvasDocumentFromJSON,
  createDefaultHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import { getCanvasMockBundleForScreen } from "@/components/mocks/data/canvasMocks";
import { upsertScene } from "@/lib/storage/repos/scenes.repo";
import { TABLES, getTable, setTable } from "@/lib/storage/store";
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
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await setTable<ComponentRow>(TABLES.components, []);
  await setTable<SceneRow>(TABLES.scenes, []);
  await setTable<ThumbnailRow>(TABLES.thumbnails, []);
  await setTable<VariantRow>(TABLES.variants, []);
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

  const thumbnails = await getTable<ThumbnailRow>(TABLES.thumbnails);
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

  await setTable<VariantRow>(TABLES.variants, [
    {
      id: "variant-header",
      componentId: "component-header",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  await setTable<ComponentRow>(TABLES.components, [
    {
      id: "component-header",
      projectId: "project-1",
      screenId: "screen-home",
      parentVariantId: null,
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
  await setTable<SceneRow>(TABLES.scenes, [
    {
      id: "scene-home",
      ownerType: "screen",
      ownerId: "screen-home",
      graphJSON: bundle!.screen.graphJSON,
      sceneVersion: 1,
      updatedAt: 1,
    },
    {
      id: "scene-header",
      ownerType: "variant",
      ownerId: "variant-header",
      graphJSON: header.canvas.graphJSON,
      sceneVersion: 1,
      updatedAt: 1,
    },
  ]);

  const editedHeader = htmlCanvasDocumentFromJSON(header.canvas.graphJSON)!;
  const titleNode = editedHeader.nodes.find((node) => node.text === "Resumo operacional");
  expect(titleNode).toBeDefined();
  titleNode!.text = "Resumo conectado";
  const editedHeaderGraphJSON = serializeHtmlCanvasDocument(editedHeader);

  await upsertScene({
    ownerType: "variant",
    ownerId: "variant-header",
    graphJSON: editedHeaderGraphJSON,
  });

  const scenes = await getTable<SceneRow>(TABLES.scenes);
  const screenScene = scenes.find(
    (scene) => scene.ownerType === "screen" && scene.ownerId === "screen-home",
  );
  expect(screenScene?.graphJSON).toContain("Resumo conectado");

  const thumbnails = await getTable<ThumbnailRow>(TABLES.thumbnails);
  const screenThumbnail = thumbnails.find(
    (thumbnail) => thumbnail.ownerType === "screen" && thumbnail.ownerId === "screen-home",
  );
  expect(screenThumbnail?.dataUrl).toStartWith("data:image/svg+xml;utf8,");
  expect(decodeURIComponent(screenThumbnail!.dataUrl)).toContain("Resumo conectado");
});

test("upsertScene propagates connected nested component snapshots through every parent", async () => {
  const bundle = await getCanvasMockBundleForScreen(
    { title: "Home", variant: "hero" },
    "mobile",
  );
  expect(bundle).not.toBeNull();
  const header = bundle!.components.find((component) => component.name === "Header")!;
  const logo = header.children.find((component) => component.name === "Logo Design")!;

  await setTable<VariantRow>(TABLES.variants, [
    {
      id: "variant-header",
      componentId: "component-header",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "variant-logo",
      componentId: "component-logo",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  await setTable<ComponentRow>(TABLES.components, [
    {
      id: "component-header",
      projectId: "project-1",
      screenId: "screen-home",
      parentVariantId: null,
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
      screenId: null,
      parentVariantId: "variant-header",
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
  await setTable<SceneRow>(TABLES.scenes, [
    {
      id: "scene-home",
      ownerType: "screen",
      ownerId: "screen-home",
      graphJSON: bundle!.screen.graphJSON,
      sceneVersion: 1,
      updatedAt: 1,
    },
    {
      id: "scene-header",
      ownerType: "variant",
      ownerId: "variant-header",
      graphJSON: header.canvas.graphJSON,
      sceneVersion: 1,
      updatedAt: 1,
    },
    {
      id: "scene-logo",
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

  const scenes = await getTable<SceneRow>(TABLES.scenes);
  const headerScene = scenes.find(
    (scene) => scene.ownerType === "variant" && scene.ownerId === "variant-header",
  );
  const screenScene = scenes.find(
    (scene) => scene.ownerType === "screen" && scene.ownerId === "screen-home",
  );
  expect(headerScene?.graphJSON).toContain("ZX");
  expect(headerScene?.sceneVersion).toBe(2);
  expect(screenScene?.graphJSON).toContain("ZX");
  expect(screenScene?.sceneVersion).toBe(2);

  const thumbnails = await getTable<ThumbnailRow>(TABLES.thumbnails);
  const headerThumbnail = thumbnails.find(
    (thumbnail) => thumbnail.ownerType === "variant" && thumbnail.ownerId === "variant-header",
  );
  const screenThumbnail = thumbnails.find(
    (thumbnail) => thumbnail.ownerType === "screen" && thumbnail.ownerId === "screen-home",
  );
  expect(decodeURIComponent(headerThumbnail!.dataUrl)).toContain("ZX");
  expect(decodeURIComponent(screenThumbnail!.dataUrl)).toContain("ZX");
});

test("upsertScene replaces duplicate-name siblings by sourceNodeId", async () => {
  await setTable<VariantRow>(TABLES.variants, [
    {
      id: "variant-green",
      componentId: "component-green",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  await setTable<ComponentRow>(TABLES.components, [
    {
      id: "component-green",
      projectId: "project-1",
      screenId: "screen-1",
      parentVariantId: null,
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

  await setTable<SceneRow>(TABLES.scenes, [
    {
      id: "scene-screen",
      ownerType: "screen",
      ownerId: "screen-1",
      graphJSON: duplicateRectangleScreenGraph(),
      sceneVersion: 1,
      updatedAt: 1,
    },
    {
      id: "scene-green",
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

  const screenScene = (await getTable<SceneRow>(TABLES.scenes)).find(
    (scene) => scene.ownerType === "screen" && scene.ownerId === "screen-1",
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
