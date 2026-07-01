import { test, expect } from "bun:test";
import type { CanvasDocument, ElementNode } from "@/canvas/engine/types";
import {
  createBlankHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { svgForElement, svgForIconDocument } from "@/lib/canvas/export/svgExport";

// A vector (svg container + child path) must survive the persisted scene format.
// Before the format carried vector data, every path degraded to a full-bounds rect
// on reload and the SVG export emitted no <path> — the root cause of the buggy
// SVG-icon canvas + empty icon cards.
function seedWithStar(): { document: CanvasDocument; blank: string; svgId: string; pathId: string } {
  const blank = serializeHtmlCanvasDocument(
    createBlankHtmlCanvasDocument({ name: "Icon", width: 24, height: 24 }),
  );
  const base = canvasDocumentFromHtmlGraphJSON(blank, { promoteSubjectRoot: true })!;

  const path: ElementNode = {
    id: "path-star",
    type: "path",
    parentId: "svg-star",
    children: [],
    name: "Star",
    x: 0,
    y: 0,
    width: 24,
    height: 24,
    rotation: 0,
    visible: true,
    locked: false,
    styles: { fill: "#182033", fillRule: "nonzero", opacity: 1 },
    viewBox: { width: 24, height: 24 },
    path: {
      subpaths: [
        {
          closed: true,
          anchors: [
            { x: 12, y: 2, handleType: "corner" },
            { x: 15, y: 9, handleType: "corner" },
            { x: 22, y: 9, handleType: "corner" },
            { x: 16, y: 14, handleType: "corner" },
            { x: 12, y: 20, handleType: "corner" },
          ],
        },
      ],
      fillRule: "nonzero",
    },
  };
  const svg: ElementNode = {
    id: "svg-star",
    type: "svg",
    parentId: null,
    children: ["path-star"],
    name: "SVG",
    x: 0,
    y: 0,
    width: 24,
    height: 24,
    rotation: 0,
    visible: true,
    locked: false,
    styles: { opacity: 1 },
    viewBox: { width: 24, height: 24 },
  };
  const document: CanvasDocument = {
    ...base,
    rootIds: [...base.rootIds, "svg-star"],
    elements: { ...base.elements, "svg-star": svg, "path-star": path },
  };
  return { document, blank, svgId: "svg-star", pathId: "path-star" };
}

test("a path node survives persist + reload with its vector data", () => {
  const { document, blank } = seedWithStar();
  const graphJSON = htmlGraphJSONFromCanvasDocument(document, blank, "Icon");
  const reloaded = canvasDocumentFromHtmlGraphJSON(graphJSON, { promoteSubjectRoot: true })!;

  const path = reloaded.elements["path-star"];
  expect(path?.type).toBe("path");
  expect(path?.path?.subpaths[0]?.anchors.length).toBe(5);
  expect(path?.viewBox).toEqual({ width: 24, height: 24 });
  expect(path?.styles.fill).toBe("#182033");

  const svg = reloaded.elements["svg-star"];
  expect(svg?.type).toBe("svg");
  expect(svg?.children).toContain("path-star");
});

test("the SVG export of a vector emits a real <path>", () => {
  const { document, svgId } = seedWithStar();
  const exported = svgForElement(document, svgId, "Icon");
  expect(exported).toBeTruthy();
  expect(exported!).toContain("<path");
  expect(exported!).toContain('fill="#182033"');
});

// An icon's paths are DIRECT children of its artboard (no sealed svg container).
// The icon export must serialize the whole artboard's content into one <svg>,
// WITHOUT baking the transparent artboard frame as a <rect> — otherwise every
// open→save cycle would re-import that rect and accumulate junk.
test("svgForIconDocument emits the paths without the artboard rect", () => {
  const blank = serializeHtmlCanvasDocument(
    createBlankHtmlCanvasDocument({ name: "Bell", width: 24, height: 24 }),
  );
  const base = canvasDocumentFromHtmlGraphJSON(blank, { promoteSubjectRoot: true })!;
  const path: ElementNode = {
    id: "path-bell",
    type: "path",
    parentId: null,
    children: [],
    name: "Path 1",
    x: 0,
    y: 0,
    width: 24,
    height: 24,
    rotation: 0,
    visible: true,
    locked: false,
    styles: { fill: "none", stroke: "#000000", strokeWidth: 2, opacity: 1 },
    viewBox: { width: 24, height: 24 },
    path: { subpaths: [{ closed: false, anchors: [
      { x: 6, y: 8, handleType: "corner" },
      { x: 18, y: 8, handleType: "corner" },
    ] }] },
  };
  const document: CanvasDocument = {
    ...base,
    rootIds: [...base.rootIds, "path-bell"],
    elements: { ...base.elements, "path-bell": path },
  };

  const exported = svgForIconDocument(document, "Bell");
  expect(exported).toBeTruthy();
  expect(exported!).toContain("<path");
  expect(exported!).toContain('stroke="#000000"');
  expect(exported!).not.toContain("<rect");
});
