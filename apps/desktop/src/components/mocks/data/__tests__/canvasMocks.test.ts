import { expect, test } from "bun:test";

import {
  getCanvasCardEmptyMock,
  getCanvasMockBundleForScreen,
  getCanvasMockDataset,
  getCanvasMockForScreen,
  getCanvasMockForTemplate,
} from "@/components/mocks/data/canvasMocks";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { htmlCanvasDocumentFromJSON, getHtmlCanvasChildren } from "@/lib/canvas/htmlScene";

test("canvas mock dataset exposes seeded screen scenes per project type", async () => {
  const mocks = await getCanvasMockDataset();

  expect(Object.keys(mocks).sort()).toEqual([
    "mock-desktop-alignment-debug",
    "mock-desktop-detail",
    "mock-desktop-formulario",
    "mock-desktop-home",
    "mock-desktop-list",
    "mock-mobile-alignment-debug",
    "mock-mobile-detail",
    "mock-mobile-formulario",
    "mock-mobile-home",
    "mock-mobile-list",
    "mock-tablet-alignment-debug",
    "mock-tablet-detail",
    "mock-tablet-formulario",
    "mock-tablet-home",
    "mock-tablet-list",
  ]);
  expect(mocks["mock-mobile-home"].graphJSON).toContain("Home");
  expect(mocks["mock-mobile-list"].graphJSON).toContain("Listagem");
  expect(mocks["mock-mobile-detail"].graphJSON).toContain("Detalhe");
  expect(mocks["mock-tablet-formulario"].graphJSON).toContain("Formulário");
  expect(mocks["mock-mobile-alignment-debug"].graphJSON).toContain("Red Alignment Box");
  expect(mocks["mock-mobile-home"].graphJSON).not.toEqual(
    mocks["mock-desktop-home"].graphJSON,
  );
});

test("screen and template lookups resolve seeded screens and still skip profile", async () => {
  const home = await getCanvasMockForScreen(
    { title: "Home", variant: "hero" },
    "mobile",
  );
  const list = await getCanvasMockForScreen(
    { title: "Listagem", variant: "list" },
    "mobile",
  );
  const detail = await getCanvasMockForScreen(
    { title: "Detalhe", variant: "detail" },
    "desktop",
  );
  const form = await getCanvasMockForScreen({
    title: "Formulário",
    variant: "form",
  }, "desktop");
  const alignment = await getCanvasMockForScreen(
    { title: "Alignment Debug", variant: "blank" },
    "mobile",
  );
  const profileTemplate = getCanvasMockForTemplate("profile", "tablet");

  expect(home?.key).toBe("mock-mobile-home");
  expect(list?.key).toBe("mock-mobile-list");
  expect(detail?.key).toBe("mock-desktop-detail");
  expect(form?.key).toBe("mock-desktop-formulario");
  expect(alignment?.key).toBe("mock-mobile-alignment-debug");
  expect(profileTemplate).toBeNull();
});

test("alignment debug mock is a white screen with one centered 30px red component", async () => {
  const bundle = await getCanvasMockBundleForScreen(
    { title: "Alignment Debug", variant: "blank" },
    "mobile",
  );
  expect(bundle).not.toBeNull();

  const storedDocument = canvasDocumentFromHtmlGraphJSON(bundle!.screen.graphJSON)!;
  expect(storedDocument.canvas.width).toBe(390);
  expect(storedDocument.canvas.height).toBe(844);

  const root = storedDocument.elements[storedDocument.rootIds[0]!];
  expect(root?.name).toBe("Alignment Debug");
  expect(root?.locked).toBe(true);
  expect(root?.children.map((id) => storedDocument.elements[id]?.name)).toEqual([
    "Red Alignment Box",
  ]);

  const box = storedDocument.elements[root!.children[0]!];
  expect(box).toMatchObject({
    name: "Red Alignment Box",
    x: 180,
    y: 407,
    width: 30,
    height: 30,
  });
  expect(box?.styles.background).toBe("#FF0000");

  const promotedDocument = canvasDocumentFromHtmlGraphJSON(
    bundle!.screen.graphJSON,
    { promoteSubjectRoot: true },
  )!;
  expect(promotedDocument.canvas.background).toBe("#FFFFFF");
  expect(promotedDocument.elements[promotedDocument.rootIds[0]!]?.name).toBe(
    "Red Alignment Box",
  );
});

test("mock graph keeps the screen/component subject as the locked canvas root element", async () => {
  const bundle = await getCanvasMockBundleForScreen(
    { title: "Home", variant: "hero" },
    "mobile",
  );
  expect(bundle).not.toBeNull();

  const htmlDocument = htmlCanvasDocumentFromJSON(bundle!.screen.graphJSON);
  expect(htmlDocument).not.toBeNull();
  const wrapper = htmlDocument!.nodes.find((node) => node.id === htmlDocument!.rootId)!;
  expect(wrapper.name).toBe("Home Canvas");
  const screenSubjects = getHtmlCanvasChildren(htmlDocument!, wrapper.id);
  expect(screenSubjects.map((node) => node.name)).toEqual(["Home"]);
  expect(screenSubjects[0]!.locked).toBe(true);

  const canvasDocument = canvasDocumentFromHtmlGraphJSON(bundle!.screen.graphJSON)!;
  expect(canvasDocument.canvas.width).toBe(390);
  expect(canvasDocument.canvas.height).toBe(844);
  expect(canvasDocument.rootIds).toHaveLength(1);
  const home = canvasDocument.elements[canvasDocument.rootIds[0]!];
  expect(home?.name).toBe("Home");
  expect(home?.locked).toBe(true);
  expect(home?.children.map((id) => canvasDocument.elements[id]?.name)).toEqual([
    "Header",
    "Hero Banner",
    "Category Strip",
    "Featured List",
    "Mobile App Cart",
  ]);

  const promotedScreenDocument = canvasDocumentFromHtmlGraphJSON(
    bundle!.screen.graphJSON,
    { promoteSubjectRoot: true },
  )!;
  expect(promotedScreenDocument.canvas.width).toBe(390);
  expect(promotedScreenDocument.canvas.height).toBe(844);
  expect(promotedScreenDocument.canvas.background).toBe("#EEF2FF");
  expect(promotedScreenDocument.rootIds.map((id) => promotedScreenDocument.elements[id]?.name)).toEqual([
    "Header",
    "Hero Banner",
    "Category Strip",
    "Featured List",
    "Mobile App Cart",
  ]);
  expect(Object.values(promotedScreenDocument.elements).some((node) => node.name === "Home")).toBe(false);

  const header = bundle!.components.find((component) => component.name === "Header");
  expect(header).toBeDefined();
  const headerDocument = canvasDocumentFromHtmlGraphJSON(header!.canvas.graphJSON)!;
  expect(headerDocument.canvas.width).toBe(342);
  expect(headerDocument.canvas.height).toBe(72);
  expect(headerDocument.rootIds).toHaveLength(1);
  const headerRoot = headerDocument.elements[headerDocument.rootIds[0]!];
  expect(headerRoot?.name).toBe("Header");
  expect(headerRoot?.locked).toBe(true);
  expect(headerRoot?.children.map((id) => headerDocument.elements[id]?.name)).toEqual([
    "Logo Design",
    "Header Copy",
    "Search Button",
  ]);

  const logoId = headerRoot!.children[0]!;
  const logoDocument = canvasDocumentFromHtmlGraphJSON(
    header!.children.find((component) => component.name === "Logo Design")!.canvas.graphJSON,
  )!;
  expect(logoDocument.canvas.width).toBe(52);
  expect(logoDocument.canvas.height).toBe(52);
  const logoRoot = logoDocument.elements[logoDocument.rootIds[0]!];
  expect(logoRoot?.name).toBe("Logo Design");
  expect(logoRoot?.locked).toBe(true);
  expect(headerDocument.elements[logoId]?.name).toBe("Logo Design");

  const promotedHeaderDocument = canvasDocumentFromHtmlGraphJSON(
    header!.canvas.graphJSON,
    { promoteSubjectRoot: true },
  )!;
  expect(promotedHeaderDocument.canvas.width).toBe(342);
  expect(promotedHeaderDocument.canvas.height).toBe(72);
  expect(promotedHeaderDocument.canvas.background).toBe("#FFE08A");
  expect(promotedHeaderDocument.rootIds.map((id) => promotedHeaderDocument.elements[id]?.name)).toEqual([
    "Logo Design",
    "Header Copy",
    "Search Button",
  ]);
  expect(Object.values(promotedHeaderDocument.elements).some((node) => node.name === "Header")).toBe(false);

  const resizedGraphJSON = htmlGraphJSONFromCanvasDocument(
    {
      ...promotedHeaderDocument,
      canvas: {
        ...promotedHeaderDocument.canvas,
        width: 410,
        height: 96,
      },
    },
    header!.canvas.graphJSON,
    "Header",
  );
  const roundTripHeaderDocument = canvasDocumentFromHtmlGraphJSON(
    resizedGraphJSON,
    { promoteSubjectRoot: true },
  )!;
  expect(roundTripHeaderDocument.canvas.width).toBe(410);
  expect(roundTripHeaderDocument.canvas.height).toBe(96);
  expect(roundTripHeaderDocument.canvas.background).toBe("#FFE08A");
  expect(roundTripHeaderDocument.rootIds.map((id) => roundTripHeaderDocument.elements[id]?.name)).toEqual([
    "Logo Design",
    "Header Copy",
    "Search Button",
  ]);
});

test("empty card mocks are visual placeholders per project type, not canvas scenes", () => {
  const mobile = getCanvasCardEmptyMock("mobile");
  const tablet = getCanvasCardEmptyMock("tablet");
  const desktop = getCanvasCardEmptyMock("desktop");

  expect(mobile.key).toBe("mock-mobile-empty-card");
  expect(tablet.key).toBe("mock-tablet-empty-card");
  expect(desktop.key).toBe("mock-desktop-empty-card");
  expect(mobile).not.toHaveProperty("graphJSON");
});
