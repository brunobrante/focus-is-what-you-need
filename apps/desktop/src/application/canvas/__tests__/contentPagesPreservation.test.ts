import { test, expect } from "bun:test";
import {
  createBlankHtmlCanvasDocument,
  ensureHtmlCanvasSubjectRoot,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { getContentAxis, getContentPages } from "@/canvas/engine/geometry";
import { withPreservedContentPages } from "../canvasMaterializer";

// Screen pages are master-truth on a component's own scene. A parent save
// re-derives the component scene from its node (via `canvasDocumentForNode`),
// which carries NO page fields — `withPreservedContentPages` must transplant the
// existing pages back onto that re-derived graph so they are never clobbered.

/** A plain-root component scene (as created in a component's own editor). */
function plainComponentScene(pages?: number, axis?: "vertical" | "horizontal"): string {
  const doc = canvasDocumentFromHtmlGraphJSON(
    serializeHtmlCanvasDocument(
      createBlankHtmlCanvasDocument({ name: "Card", width: 342, height: 220 }),
    ),
  )!;
  if (pages) doc.canvas = { ...doc.canvas, contentPages: pages, contentAxis: axis ?? "vertical" };
  return htmlGraphJSONFromCanvasDocument(doc, null, "Card");
}

/** A wrapper (promoted-subject) component scene, as mock-seeded components are. */
function wrappedComponentScene(pages?: number, axis?: "vertical" | "horizontal"): string {
  const wrapped = serializeHtmlCanvasDocument(
    ensureHtmlCanvasSubjectRoot(
      createBlankHtmlCanvasDocument({ name: "Card", width: 342, height: 220 }),
      { wrapperName: "Card Canvas" },
    ),
  );
  const doc = canvasDocumentFromHtmlGraphJSON(wrapped, { promoteSubjectRoot: true })!;
  if (pages) doc.canvas = { ...doc.canvas, contentPages: pages, contentAxis: axis ?? "vertical" };
  return htmlGraphJSONFromCanvasDocument(doc, wrapped, "Card");
}

test("re-derived graph without pages keeps the existing scene's pages (plain root)", () => {
  const existing = plainComponentScene(3, "vertical");
  const reDerived = plainComponentScene(); // materializer output — no page fields

  const merged = withPreservedContentPages(existing, reDerived, "Card");
  const reloaded = canvasDocumentFromHtmlGraphJSON(merged, { promoteSubjectRoot: true })!;

  expect(getContentPages(reloaded)).toBe(3);
  expect(getContentAxis(reloaded)).toBe("vertical");
});

test("pages survive on the promoted-subject (wrapper) scene format", () => {
  const existing = wrappedComponentScene(2, "horizontal");
  const reDerived = plainComponentScene(); // parent re-derivation is always plain

  const merged = withPreservedContentPages(existing, reDerived, "Card");
  const reloaded = canvasDocumentFromHtmlGraphJSON(merged, { promoteSubjectRoot: true })!;

  expect(getContentPages(reloaded)).toBe(2);
  expect(getContentAxis(reloaded)).toBe("horizontal");
});

test("no existing pages leaves the re-derived graph untouched", () => {
  const existing = plainComponentScene(); // single page
  const reDerived = plainComponentScene();

  expect(withPreservedContentPages(existing, reDerived, "Card")).toBe(reDerived);
});

test("author collapsing pages to one is respected (existing single page wins)", () => {
  // The component's own editor just saved a single-page scene; a later parent
  // re-derivation must NOT resurrect stale pages.
  const existing = plainComponentScene(); // collapsed to 1
  const reDerived = plainComponentScene();

  const merged = withPreservedContentPages(existing, reDerived, "Card");
  const reloaded = canvasDocumentFromHtmlGraphJSON(merged, { promoteSubjectRoot: true })!;
  expect(getContentPages(reloaded)).toBe(1);
});

test("a re-derivation that already carries pages is left as-is", () => {
  const existing = plainComponentScene(4, "vertical");
  const reDerived = plainComponentScene(2, "horizontal"); // author-set pages present

  // Incoming already has pages → returned unchanged, incoming wins.
  expect(withPreservedContentPages(existing, reDerived, "Card")).toBe(reDerived);
});
