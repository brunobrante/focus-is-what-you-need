import { test, expect } from "bun:test";
import type { CanvasDocument, ElementNode, ElementStyles } from "@/canvas/engine/types";
import {
  createBlankHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";

// The persisted scene format is the source of truth, so a border that renders but
// doesn't round-trip is a border the user loses on reload. `borderAlign: "center"`
// (F3) and `borderWidths` (G13) are both new to the format.

function roundTrip(styles: ElementStyles): ElementStyles {
  const blank = serializeHtmlCanvasDocument(
    createBlankHtmlCanvasDocument({ name: "Frame", width: 100, height: 100 }),
  );
  const base = canvasDocumentFromHtmlGraphJSON(blank, { promoteSubjectRoot: true })!;

  const rect: ElementNode = {
    id: "rect-1",
    type: "rect",
    parentId: null,
    children: [],
    name: "Rect",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    visible: true,
    locked: false,
    styles,
  };
  const document: CanvasDocument = {
    ...base,
    rootIds: [...base.rootIds, rect.id],
    elements: { ...base.elements, [rect.id]: rect },
  };

  const json = htmlGraphJSONFromCanvasDocument(document, blank, "Frame");
  const restored = canvasDocumentFromHtmlGraphJSON(json, { promoteSubjectRoot: true })!;
  return restored.elements["rect-1"].styles;
}

test("per-side border widths survive a save/load round trip", () => {
  const styles = roundTrip({ borderWidth: 0, borderWidths: [0, 0, 2, 0], borderColor: "#ff0000" });
  expect(styles.borderWidths).toEqual([0, 0, 2, 0]);
  expect(styles.borderColor).toBe("#ff0000");
});

test("a bottom-only divider keeps its style through the round trip", () => {
  // The uniform width is 0, so a naive `borderWidth > 0 ? style : "none"` would drop
  // the style and the divider would come back styleless.
  const styles = roundTrip({ borderWidth: 0, borderWidths: [0, 0, 1, 0], borderStyle: "dashed" });
  expect(styles.borderStyle).toBe("dashed");
  expect(styles.borderWidths).toEqual([0, 0, 1, 0]);
});

test("Center alignment survives the round trip", () => {
  expect(roundTrip({ borderWidth: 3, borderAlign: "center" }).borderAlign).toBe("center");
  expect(roundTrip({ borderWidth: 3, borderAlign: "outside" }).borderAlign).toBe("outside");
});

test("clearing per-side widths persists as cleared, not resurrected", () => {
  expect(roundTrip({ borderWidth: 2 }).borderWidths).toBeUndefined();
});
