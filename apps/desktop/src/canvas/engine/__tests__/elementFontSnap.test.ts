import { expect, test } from "bun:test";

import { snapToNearest, createElementForTool } from "@/canvas/engine/mutations/elementCreate";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";

test("snapToNearest picks the closest allowed value", () => {
  expect(snapToNearest(11.46, [8, 12])).toBe(12);
  expect(snapToNearest(9, [8, 12])).toBe(8);
  expect(snapToNearest(10, [8, 12])).toBe(8); // ties go to the first nearest
  expect(snapToNearest(100, [8, 12])).toBe(12);
});

test("snapToNearest returns the value unchanged when no sizes are allowed", () => {
  expect(snapToNearest(11.46, [])).toBe(11.46);
});

function settingsWithTextSnap(): GlobalSettings {
  return {
    ...DEFAULT_GLOBAL_SETTINGS,
    canvas: {
      ...DEFAULT_GLOBAL_SETTINGS.canvas,
      elementDefaults: {
        ...DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults,
        tools: {
          ...DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults.tools,
          text: {
            ...DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults.tools.text,
            fontSizeSnap: "designSystem",
          },
        },
      },
    },
  };
}

test("text font size snaps to the nearest design-system size on a small frame", () => {
  // A 50x50 frame scales the default 24px font well below 12; snapping rounds it
  // to the nearest allowed design-system size.
  const node = createElementForTool(
    "text",
    0,
    0,
    { width: 50, height: 50 },
    settingsWithTextSnap(),
    { allowedFontSizes: [8, 12] },
  );
  expect(node.styles.fontSize).toBe(8);
});

test("fixed size mode ignores frame adaptation", () => {
  const settings: GlobalSettings = {
    ...DEFAULT_GLOBAL_SETTINGS,
    canvas: {
      ...DEFAULT_GLOBAL_SETTINGS.canvas,
      elementDefaults: {
        ...DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults,
        tools: {
          ...DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults.tools,
          rect: {
            ...DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults.tools.rect,
            sizeMode: "fixed",
          },
        },
      },
    },
  };
  const node = createElementForTool("rect", 0, 0, { width: 50, height: 50 }, settings);
  expect(node.width).toBe(DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults.tools.rect.width);
});
