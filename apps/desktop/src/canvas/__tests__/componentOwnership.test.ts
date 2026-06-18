import { expect, test } from "bun:test";
import { componentPathFromRoot } from "@/canvas/canvasUtils";
import type { ComponentRow } from "@/lib/storage/schema";

function comp(p: {
  id: string;
  name: string;
  screenId?: string | null;
  parentVariantId?: string | null;
  activeVariantId: string;
}): ComponentRow {
  return {
    id: p.id,
    name: p.name,
    screenId: p.screenId ?? null,
    parentVariantId: p.parentVariantId ?? null,
    activeVariantId: p.activeVariantId,
  } as unknown as ComponentRow;
}

// A component created directly in a screen's main resolves to that screen.
test("screen-owned component resolves to its screen", () => {
  const c = comp({ id: "c1", name: "Header", screenId: "screen-1", activeVariantId: "v-c1" });
  expect(componentPathFromRoot(c, [c])).toEqual({ screenId: "screen-1", names: ["Header"] });
});

// A nested component (owned by a parent component's variant) climbs to the screen.
test("nested component climbs through the parent component to the screen", () => {
  const parent = comp({ id: "c1", name: "Header", screenId: "screen-1", activeVariantId: "v-c1" });
  const child = comp({ id: "c2", name: "Logo", parentVariantId: "v-c1", activeVariantId: "v-c2" });
  expect(componentPathFromRoot(child, [parent, child])).toEqual({
    screenId: "screen-1",
    names: ["Header", "Logo"],
  });
});

// A component owned by a screen's VERSION variant resolves to that screen — a versioned
// screen is a normal screen. This needs the variants list to recognize the screen-owned
// variant; without it the old code returned null.
test("version-owned component resolves to its screen when variants are provided", () => {
  const versioned = comp({
    id: "c3",
    name: "Header",
    parentVariantId: "v-screen-version-1",
    activeVariantId: "v-c3",
  });
  const variants = [
    { id: "v-screen-version-1", ownerKind: "screen", ownerId: "screen-1" },
    { id: "v-screen-main", ownerKind: "screen", ownerId: "screen-1" },
  ];
  expect(componentPathFromRoot(versioned, [versioned], variants)).toEqual({
    screenId: "screen-1",
    names: ["Header"],
  });
});

// Without the variants list, a version-owned component cannot be resolved (back-compat
// path) — it falls through to a null screen rather than throwing.
test("version-owned component yields a null screen without the variants list", () => {
  const versioned = comp({
    id: "c3",
    name: "Header",
    parentVariantId: "v-screen-version-1",
    activeVariantId: "v-c3",
  });
  expect(componentPathFromRoot(versioned, [versioned])).toEqual({
    screenId: null,
    names: ["Header"],
  });
});
