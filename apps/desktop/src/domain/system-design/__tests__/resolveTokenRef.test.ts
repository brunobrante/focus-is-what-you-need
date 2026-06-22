import { describe, expect, it } from "bun:test";
import { emptySystemDesignTokens } from "@/domain/system-design/defaults";
import { resolveSystemDesign } from "@/domain/system-design/resolve";
import { parseTokenRef, resolveTokenRef, tokenRef } from "@/domain/system-design/resolveTokenRef";
import type { SystemDesignRow } from "@/domain/system-design/types";

function design(over: Partial<SystemDesignRow>): SystemDesignRow {
  return {
    id: "d",
    name: "d",
    ownerScope: "workspace",
    ownerId: "ws",
    inheritsFromId: null,
    tokens: emptySystemDesignTokens(),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("token refs", () => {
  it("round-trips tokenRef <-> parseTokenRef", () => {
    expect(tokenRef("colors", "c1")).toBe("colors:c1");
    expect(parseTokenRef("colors:c1")).toEqual({ category: "colors", tokenId: "c1" });
    expect(parseTokenRef("c1")).toBeNull(); // no category
    expect(parseTokenRef("bogus:c1")).toBeNull(); // unknown category
    expect(parseTokenRef("colors:")).toBeNull(); // no id
  });

  it("resolves a color ref to the token's live value", () => {
    const resolved = resolveSystemDesign(
      design({
        tokens: { ...emptySystemDesignTokens(), colors: [{ id: "c1", name: "Brand", value: "#abc" }] },
      }),
      null,
    );
    expect(resolveTokenRef("colors:c1", resolved)).toBe("#abc");
    expect(resolveTokenRef("colors:missing", resolved)).toBeNull();
    expect(resolveTokenRef("garbage", resolved)).toBeNull();
  });

  it("a linked color ref resolves to the workspace master's current value", () => {
    const parent = design({
      id: "ws-design",
      tokens: {
        ...emptySystemDesignTokens(),
        colors: [{ id: "c1", name: "Brand", value: "#111", linkable: true }],
      },
    });
    const project = design({
      ownerScope: "project",
      ownerId: "p",
      inheritsFromId: "ws-design",
      tokens: {
        ...emptySystemDesignTokens(),
        colors: [{ id: "c1", name: "Brand", value: "#111", instanceOf: { systemDesignId: "ws-design", tokenId: "c1" } }],
      },
    });
    parent.tokens.colors[0]!.value = "#222"; // master edited after the link
    const resolved = resolveSystemDesign(project, parent);
    expect(resolveTokenRef("colors:c1", resolved)).toBe("#222");
  });

  it("spacing/radius resolve to px; typography has no single value", () => {
    const resolved = resolveSystemDesign(
      design({
        tokens: {
          ...emptySystemDesignTokens(),
          spacing: [{ id: "s1", name: "md", value: 12 }],
          radius: [{ id: "r1", name: "lg", value: 8 }],
          typography: [{ id: "t1", name: "Body", family: "Inter", weight: "400", size: "14px", sample: "x" }],
        },
      }),
      null,
    );
    expect(resolveTokenRef("spacing:s1", resolved)).toBe("12px");
    expect(resolveTokenRef("radius:r1", resolved)).toBe("8px");
    expect(resolveTokenRef("typography:t1", resolved)).toBeNull();
  });
});
