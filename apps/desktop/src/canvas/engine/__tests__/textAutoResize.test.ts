import { expect, test } from "bun:test";
import { createElementForTool } from "@/canvas/engine/mutations/elementCreate";

// G4 — new text defaults to auto-width: both axes hug the content and the box
// grows while typing (applyTextFitSizingInPlace runs on every content change).
test("a new text element defaults to fit sizing on both axes", () => {
  const node = createElementForTool("text", 100, 100, { width: 400, height: 400 });
  expect(node.type).toBe("text");
  expect(node.sizing).toEqual({ width: "fit", height: "fit" });
});

test("non-text tools get no sizing default", () => {
  const node = createElementForTool("rect", 100, 100, { width: 400, height: 400 });
  expect(node.sizing).toBeUndefined();
});
