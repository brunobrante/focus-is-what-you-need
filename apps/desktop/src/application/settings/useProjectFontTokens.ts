import { useEffect, useState } from "react";

import { resolveSystemDesign } from "@/domain/system-design/resolve";
import type { ElementFontTokens } from "@/canvas/engine/types";
import type { TypeStyleToken } from "@/lib/storage/schema";
import { getSystemDesignByOwner } from "@/lib/storage/repos/systemDesigns.repo";
import { getWorkspaceForProject } from "@/lib/storage/repos/workspace.repo";
import { TABLES, subscribe } from "@/lib/storage/store";

/** Parse a CSS size string like "24px" into a number, or null when unparseable. */
function parseSizePx(size: string): number | null {
  const match = /(-?\d+(?:\.\d+)?)/.exec(size);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function tokensToFontTokens(tokens: TypeStyleToken[]): ElementFontTokens {
  const sizes = Array.from(
    new Set(
      tokens
        .map((t) => parseSizePx(t.size))
        .filter((n): n is number => n !== null),
    ),
  ).sort((a, b) => a - b);
  return {
    allowedFontSizes: sizes,
    defaultFontFamily: tokens[0]?.family,
  };
}

/**
 * Read-only resolved typography tokens for a project, exposed as element-creation
 * font tokens. Unlike `useProjectSystemDesign`, this never creates a design row —
 * merely opening the canvas must not write. When the project has its own design
 * row it is resolved against its workspace; otherwise the workspace design (if
 * any) is used directly, since new projects inherit the workspace by default.
 */
export function useProjectFontTokens(
  projectId: string | null,
): ElementFontTokens | undefined {
  const [fontTokens, setFontTokens] = useState<ElementFontTokens | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!projectId) {
        if (!cancelled) setFontTokens(undefined);
        return;
      }
      try {
        const workspace = await getWorkspaceForProject(projectId);
        const workspaceDesign = workspace
          ? await getSystemDesignByOwner("workspace", workspace.id)
          : null;
        const projectDesign = await getSystemDesignByOwner("project", projectId);

        let typography: TypeStyleToken[] = [];
        if (projectDesign) {
          const resolved = resolveSystemDesign(projectDesign, workspaceDesign);
          typography = resolved.typography.tokens.map((t) => t.token);
        } else if (workspaceDesign) {
          typography = workspaceDesign.tokens.typography;
        }
        if (!cancelled) setFontTokens(tokensToFontTokens(typography));
      } catch (error) {
        console.error("Failed to load project font tokens", error);
        if (!cancelled) setFontTokens(undefined);
      }
    };

    void load();
    const unsubDesigns = subscribe(TABLES.systemDesigns, () => void load());
    const unsubWorkspaces = subscribe(TABLES.workspaces, () => void load());
    return () => {
      cancelled = true;
      unsubDesigns();
      unsubWorkspaces();
    };
  }, [projectId]);

  return fontTokens;
}
