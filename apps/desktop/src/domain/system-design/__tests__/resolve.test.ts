import { describe, expect, it } from "bun:test";
import {
  createDefaultSystemDesignTokens,
  emptyExcludedShared,
  emptySystemDesignTokens,
  excludeAllShared,
} from "@/domain/system-design/defaults";
import { resolveSystemDesign } from "@/domain/system-design/resolve";
import type { SystemDesignRow } from "@/domain/system-design/types";

function makeDesign(over: Partial<SystemDesignRow>): SystemDesignRow {
  return {
    id: "d",
    name: "d",
    ownerScope: "project",
    ownerId: "p",
    inheritsFromId: null,
    excludedShared: emptyExcludedShared(),
    tokens: emptySystemDesignTokens(),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("resolveSystemDesign", () => {
  it("a workspace design (no parent) resolves to its own tokens, no workspace source", () => {
    const tokens = createDefaultSystemDesignTokens();
    const design = makeDesign({ ownerScope: "workspace", tokens });
    const resolved = resolveSystemDesign(design, null);
    expect(resolved.colors.hasWorkspace).toBe(false);
    expect(resolved.colors.tokens.map((s) => s.token)).toEqual(tokens.colors);
    expect(resolved.colors.tokens.every((s) => s.source === "project")).toBe(true);
    expect(resolved.colors.availableShared).toEqual([]);
  });

  it("merges workspace + project tokens, tagging each source", () => {
    const parent = makeDesign({
      ownerScope: "workspace",
      ownerId: "ws",
      tokens: { ...emptySystemDesignTokens(), colors: [{ id: "p1", name: "Shared", value: "#fff" }] },
    });
    const project = makeDesign({
      inheritsFromId: "ws",
      tokens: { ...emptySystemDesignTokens(), colors: [{ id: "o1", name: "Local", value: "#000" }] },
    });

    const resolved = resolveSystemDesign(project, parent);
    expect(resolved.colors.tokens).toEqual([
      { token: { id: "p1", name: "Shared", value: "#fff" }, source: "workspace" },
      { token: { id: "o1", name: "Local", value: "#000" }, source: "project" },
    ]);
    expect(resolved.colors.availableShared).toEqual([]);
  });

  it("excluded workspace tokens drop out and become re-addable", () => {
    const shared = [
      { id: "p1", name: "A", value: "#111" },
      { id: "p2", name: "B", value: "#222" },
    ];
    const parent = makeDesign({
      ownerScope: "workspace",
      ownerId: "ws",
      tokens: { ...emptySystemDesignTokens(), colors: shared },
    });
    const project = makeDesign({
      inheritsFromId: "ws",
      excludedShared: { ...emptyExcludedShared(), colors: ["p2"] },
    });

    const resolved = resolveSystemDesign(project, parent);
    // p2 is hidden from the merged list…
    expect(resolved.colors.tokens.map((s) => s.token.id)).toEqual(["p1"]);
    // …and offered for re-adding.
    expect(resolved.colors.availableShared).toEqual([{ id: "p2", name: "B", value: "#222" }]);
  });

  it("excludeAllShared hides every workspace token", () => {
    const parent = makeDesign({
      ownerScope: "workspace",
      ownerId: "ws",
      tokens: { ...emptySystemDesignTokens(), colors: [{ id: "p1", name: "A", value: "#111" }] },
    });
    const project = makeDesign({
      inheritsFromId: "ws",
      excludedShared: excludeAllShared(parent.tokens),
    });
    const resolved = resolveSystemDesign(project, parent);
    expect(resolved.colors.tokens).toEqual([]);
    expect(resolved.colors.availableShared.map((t) => t.id)).toEqual(["p1"]);
  });
});
