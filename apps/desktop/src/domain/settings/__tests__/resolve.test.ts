import { afterEach, expect, test } from "bun:test";

import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { isModifierCommandActive } from "@/domain/settings/resolve";

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
