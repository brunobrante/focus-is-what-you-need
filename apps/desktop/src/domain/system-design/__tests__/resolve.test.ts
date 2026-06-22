import { describe, expect, it } from "bun:test";
import {
  buildLinkedTokens,
  createDefaultSystemDesignTokens,
  emptySystemDesignTokens,
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
    tokens: emptySystemDesignTokens(),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("resolveSystemDesign", () => {
  it("a workspace design (no parent) resolves to its own tokens, all 'project' source", () => {
    const tokens = createDefaultSystemDesignTokens();
    const design = makeDesign({ ownerScope: "workspace", tokens });
    const resolved = resolveSystemDesign(design, null);
    expect(resolved.colors.hasWorkspace).toBe(false);
    expect(resolved.colors.tokens.map((s) => s.token)).toEqual(tokens.colors);
    expect(resolved.colors.tokens.every((s) => s.source === "project")).toBe(true);
    expect(resolved.colors.availableShared).toEqual([]);
  });

  it("offers only linkable workspace tokens that aren't linked yet", () => {
    const parent = makeDesign({
      id: "ws-design",
      ownerScope: "workspace",
      ownerId: "ws",
      tokens: {
        ...emptySystemDesignTokens(),
        colors: [
          { id: "p1", name: "A", value: "#111", linkable: true },
          { id: "p2", name: "B", value: "#222", linkable: true },
          { id: "p3", name: "C", value: "#333" }, // not linkable
        ],
      },
    });
    const project = makeDesign({ inheritsFromId: "ws-design" });

    const resolved = resolveSystemDesign(project, parent);
    // Nothing linked yet → grid empty, only linkable tokens are offered.
    expect(resolved.colors.tokens).toEqual([]);
    expect(resolved.colors.availableShared.map((t) => t.id)).toEqual(["p1", "p2"]);
  });

  it("resolves a linked instance live from the master, tagged 'linked'", () => {
    const parent = makeDesign({
      id: "ws-design",
      ownerScope: "workspace",
      ownerId: "ws",
      tokens: {
        ...emptySystemDesignTokens(),
        colors: [{ id: "p1", name: "Brand", value: "#abc", linkable: true }],
      },
    });
    const linked = buildLinkedTokens("ws-design", parent.tokens, new Set(["p1"]));
    const project = makeDesign({
      inheritsFromId: "ws-design",
      tokens: {
        ...linked,
        colors: [
          ...linked.colors,
          { id: "o1", name: "Local", value: "#000" },
        ],
      },
    });

    const resolved = resolveSystemDesign(project, parent);
    const colors = resolved.colors.tokens;
    // Linked instance carries the master's current values + the linked source.
    expect(colors[0]!.source).toBe("linked");
    expect(colors[0]!.token).toMatchObject({ id: "p1", name: "Brand", value: "#abc" });
    // Local token stays 'project'.
    expect(colors[1]!).toMatchObject({ source: "project", token: { id: "o1" } });
    // A linked token is no longer offered.
    expect(resolved.colors.availableShared).toEqual([]);
  });

  it("a linked instance reflects later edits to the master", () => {
    const parent = makeDesign({
      id: "ws-design",
      ownerScope: "workspace",
      ownerId: "ws",
      tokens: {
        ...emptySystemDesignTokens(),
        colors: [{ id: "p1", name: "Brand", value: "#old", linkable: true }],
      },
    });
    const project = makeDesign({
      inheritsFromId: "ws-design",
      tokens: buildLinkedTokens("ws-design", parent.tokens, new Set(["p1"])),
    });

    // Master changes value after the link was made.
    parent.tokens.colors[0]!.value = "#new";
    const resolved = resolveSystemDesign(project, parent);
    expect((resolved.colors.tokens[0]!.token as unknown as { value: string }).value).toBe("#new");
  });
});
