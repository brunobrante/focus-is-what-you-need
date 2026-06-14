import { afterEach, expect, test } from "bun:test";

import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import {
  isModifierCommandActive,
  resolveSettingsLayers,
} from "@/domain/settings/resolve";

const originalNavigator = globalThis.navigator;

function setPlatform(platform: string): void {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { platform },
  });
}

function keyboardState(
  overrides: Partial<Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">>,
): Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

test("modifier mod resolves to Command on macOS", () => {
  setPlatform("MacIntel");

  expect(
    isModifierCommandActive(
      keyboardState({ metaKey: true }),
      DEFAULT_GLOBAL_SETTINGS,
      "canvas.drag.reparent",
    ),
  ).toBe(true);
  expect(
    isModifierCommandActive(
      keyboardState({ ctrlKey: true }),
      DEFAULT_GLOBAL_SETTINGS,
      "canvas.drag.reparent",
    ),
  ).toBe(false);
});

test("modifier mod resolves to Control on non-macOS platforms", () => {
  setPlatform("Win32");

  expect(
    isModifierCommandActive(
      keyboardState({ ctrlKey: true }),
      DEFAULT_GLOBAL_SETTINGS,
      "canvas.drag.reparent",
    ),
  ).toBe(true);
  expect(
    isModifierCommandActive(
      keyboardState({ metaKey: true }),
      DEFAULT_GLOBAL_SETTINGS,
      "canvas.drag.reparent",
    ),
  ).toBe(false);
});

test("resolveSettingsLayers cascades defaults -> global -> workspace -> project", () => {
  const resolved = resolveSettingsLayers([
    { canvas: { elementDefaults: { tools: { rect: { styles: { background: "#111111" } } } } } },
    { canvas: { elementDefaults: { tools: { rect: { styles: { background: "#222222" } } } } } },
    { canvas: { elementDefaults: { tools: { rect: { width: 999 } } } } },
  ]);
  const rect = resolved.canvas.elementDefaults.tools.rect;
  // Project layer wins for width; workspace layer wins for background over global.
  expect(rect.width).toBe(999);
  expect(rect.styles.background).toBe("#222222");
  // Unset fields still fall back to the defaults.
  expect(rect.height).toBe(DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults.tools.rect.height);
});

test("resolveSettingsLayers ignores null/undefined layers and deep-merges styles", () => {
  const resolved = resolveSettingsLayers([
    null,
    { canvas: { elementDefaults: { tools: { text: { styles: { fontSize: 40 } } } } } },
    undefined,
  ]);
  const text = resolved.canvas.elementDefaults.tools.text;
  expect(text.styles.fontSize).toBe(40);
  // Sibling style fields from defaults are preserved through the deep merge.
  expect(text.styles.color).toBe(
    DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults.tools.text.styles.color,
  );
});

test("parent distance overlay uses the default Control modifier", () => {
  setPlatform("MacIntel");

  expect(
    isModifierCommandActive(
      keyboardState({ ctrlKey: true }),
      DEFAULT_GLOBAL_SETTINGS,
      "canvas.overlay.parentDistances",
    ),
  ).toBe(true);
  expect(
    isModifierCommandActive(
      keyboardState({ metaKey: true }),
      DEFAULT_GLOBAL_SETTINGS,
      "canvas.overlay.parentDistances",
    ),
  ).toBe(false);
});
