import { expect, test } from "bun:test";

import { buildHtmlExport } from "@/lib/canvas/export/htmlExport";
import type { CanvasDocument, ElementNode, ElementStyles } from "@/canvas/engine/types";

function starNode(styles: ElementStyles): ElementNode {
  return {
    id: "s1",
    type: "star",
    parentId: null,
    children: [],
    name: "Star",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    styles,
  };
}

function docWith(node: ElementNode): CanvasDocument {
  return {
    canvas: { width: 200, height: 200, background: "#ffffff", rotation: 0 },
    rootIds: [node.id],
    elements: { [node.id]: node },
  };
}

function exportHtml(styles: ElementStyles): string {
  const result = buildHtmlExport(docWith(starNode(styles)), "s1", "standalone");
  expect(result).not.toBeNull();
  return result!.files[0].text;
}

test("a bordered clip-path shape exports its SVG stroke, not just the clipped fill", () => {
  const html = exportHtml({ background: "#00ff00", borderWidth: 3, borderColor: "#ff0000" });
  expect(html).toContain("clip-path");
  expect(html).toContain("<svg");
  expect(html).toContain('stroke="#ff0000"');
  // Inside is the default: doubled width, then clipped back to the outline.
  expect(html).toContain('stroke-width="6"');
  expect(html).toContain("<clipPath");
});

test("Outside alignment exports a mask, Center exports a bare stroke", () => {
  const outside = exportHtml({ borderWidth: 2, borderColor: "#000", borderAlign: "outside" });
  expect(outside).toContain("<mask");
  expect(outside).toContain('stroke-width="4"');

  const center = exportHtml({ borderWidth: 2, borderColor: "#000", borderAlign: "center" });
  expect(center).not.toContain("<mask");
  expect(center).not.toContain("<clipPath");
  expect(center).toContain('stroke-width="2"');
});

test("an unbordered shape exports no stroke markup at all", () => {
  const html = exportHtml({ background: "#00ff00" });
  expect(html).toContain("clip-path");
  expect(html).not.toContain("<svg");
});

test("the fill moves to the inner clipped box, off the outer one", () => {
  const html = exportHtml({ background: "#00ff00", borderWidth: 1, borderColor: "#000" });
  // The inner div is inline-styled and carries both the clip and the background.
  const innerDiv = html.match(/<div style="([^"]*)"><\/div>/)?.[1] ?? "";
  expect(innerDiv).toContain("clip-path");
  expect(innerDiv).toContain("#00ff00");
});
