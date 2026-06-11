import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { useWorkspaces } from "@/lib/storage/hooks";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { ensureLocalProjectsLoaded } from "@/lib/storage/localProjects";
import {
  emptyExcludedShared,
  excludeAllShared,
} from "@/domain/system-design/defaults";
import {
  getOrCreateSystemDesignByOwner,
  saveSystemDesign,
} from "@/lib/storage/repos/systemDesigns.repo";
import { getWorkspaceForProject } from "@/lib/storage/repos/workspace.repo";
import { TABLES, subscribe } from "@/lib/storage/store";
import type {
  SystemDesignCategory,
  SystemDesignExclusions,
  SystemDesignOwnerScope,
  SystemDesignRow,
  SystemDesignTokens,
} from "@/lib/storage/schema";
import {
  resolveSystemDesign,
  type ResolvedSystemDesign,
  type TokenSource,
} from "@/domain/system-design/resolve";

// A token is anything with a stable id; the editor passes concrete token types.
type AnyToken = { id: string };

export const newTokenId = () =>
  `tok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function upsertById<T extends AnyToken>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx < 0) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}

// ─── Controller ─────────────────────────────────────────────────────────────

export interface SystemDesignController {
  scope: SystemDesignOwnerScope;
  loading: boolean;
  /** The owner's editable design (own tokens + exclusions). */
  design: SystemDesignRow | null;
  /** The parent workspace design for project scope, else null. */
  parent: SystemDesignRow | null;
  /** Merged tokens per category (workspace + project) with their source. */
  resolved: ResolvedSystemDesign | null;
  /** True when there is a workspace to inherit shared tokens from. */
  hasParent: boolean;
  /** Create or edit one of the owner's own tokens. */
  upsertToken: (category: SystemDesignCategory, token: AnyToken) => void;
  /**
   * Remove a token from this design. A project token is deleted outright; a
   * workspace (shared) token is excluded from the project and can be re-added.
   */
  deleteToken: (
    category: SystemDesignCategory,
    tokenId: string,
    source: TokenSource,
  ) => void;
  /** Bring a previously-removed workspace token back into the project. */
  reAddShared: (category: SystemDesignCategory, tokenId: string) => void;
  rename: (name: string) => void;
}

type LoadState = {
  loading: boolean;
  design: SystemDesignRow | null;
  parent: SystemDesignRow | null;
};

const IDLE: LoadState = { loading: true, design: null, parent: null };

type BuildInitialExcluded =
  | ((parent: SystemDesignRow | null) => SystemDesignExclusions | undefined)
  | null;

/**
 * Core loader shared by the workspace and project hooks. Lazily creates the
 * owner's design (and its parent for project scope), keeps it in sync with the
 * store, and exposes optimistic mutators that persist through the save queue.
 */
function useOwnedSystemDesign(
  scope: SystemDesignOwnerScope,
  ownerId: string | null,
  loadParent: (() => Promise<SystemDesignRow | null>) | null,
  buildInitialExcluded: BuildInitialExcluded,
  depsKey: string,
): SystemDesignController {
  const [state, setState] = useState<LoadState>(IDLE);

  const designRef = useRef<SystemDesignRow | null>(null);
  const loadParentRef = useRef(loadParent);
  loadParentRef.current = loadParent;
  const buildInitialRef = useRef(buildInitialExcluded);
  buildInitialRef.current = buildInitialExcluded;

  useEffect(() => {
    designRef.current = state.design;
  }, [state.design]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await ensureLocalProjectsLoaded();
      if (cancelled) return;
      if (!ownerId) {
        setState({ loading: false, design: null, parent: null });
        return;
      }
      const parent = loadParentRef.current ? await loadParentRef.current() : null;
      const design = await getOrCreateSystemDesignByOwner({
        ownerScope: scope,
        ownerId,
        inheritsFromId: parent?.id ?? null,
        initialExcludedShared: buildInitialRef.current?.(parent),
      });
      if (!cancelled) setState({ loading: false, design, parent });
    };

    void run();
    const unsubDesigns = subscribe(TABLES.systemDesigns, () => void run());
    const unsubWorkspaces = subscribe(TABLES.workspaces, () => void run());
    return () => {
      cancelled = true;
      unsubDesigns();
      unsubWorkspaces();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, ownerId, depsKey]);

  const mutate = useCallback((fn: (d: SystemDesignRow) => SystemDesignRow) => {
    const current = designRef.current;
    if (!current) return;
    const computed = fn(current);
    if (computed === current) return;
    const next = saveSystemDesign(computed);
    designRef.current = next;
    setState((s) => ({ ...s, design: next }));
  }, []);

  const upsertToken = useCallback(
    (category: SystemDesignCategory, token: AnyToken) => {
      mutate((d) => {
        const list = d.tokens[category] as AnyToken[];
        const nextTokens = {
          ...d.tokens,
          [category]: upsertById(list, token),
        } as SystemDesignTokens;
        return { ...d, tokens: nextTokens };
      });
    },
    [mutate],
  );

  const deleteToken = useCallback(
    (category: SystemDesignCategory, tokenId: string, source: TokenSource) => {
      mutate((d) => {
        if (source === "workspace") {
          const current = d.excludedShared[category] ?? [];
          if (current.includes(tokenId)) return d;
          return {
            ...d,
            excludedShared: {
              ...d.excludedShared,
              [category]: [...current, tokenId],
            },
          };
        }
        const list = d.tokens[category] as AnyToken[];
        const nextTokens = {
          ...d.tokens,
          [category]: list.filter((t) => t.id !== tokenId),
        } as SystemDesignTokens;
        return { ...d, tokens: nextTokens };
      });
    },
    [mutate],
  );

  const reAddShared = useCallback(
    (category: SystemDesignCategory, tokenId: string) => {
      mutate((d) => {
        const current = d.excludedShared[category] ?? [];
        if (!current.includes(tokenId)) return d;
        return {
          ...d,
          excludedShared: {
            ...d.excludedShared,
            [category]: current.filter((id) => id !== tokenId),
          },
        };
      });
    },
    [mutate],
  );

  const rename = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      mutate((d) => (d.name === trimmed ? d : { ...d, name: trimmed }));
    },
    [mutate],
  );

  const resolved = useMemo<ResolvedSystemDesign | null>(
    () => (state.design ? resolveSystemDesign(state.design, state.parent) : null),
    [state.design, state.parent],
  );

  return {
    scope,
    loading: state.loading,
    design: state.design,
    parent: state.parent,
    resolved,
    hasParent: Boolean(state.parent),
    upsertToken,
    deleteToken,
    reAddShared,
    rename,
  };
}

// ─── Public hooks ─────────────────────────────────────────────────────────────

/** The active workspace's system design (edited from the System Design page). */
export function useWorkspaceSystemDesign(): SystemDesignController & {
  workspaceId: string | null;
} {
  const [activeId] = useActiveWorkspaceId();
  const { data: workspaces } = useWorkspaces();
  // Fall back to the first workspace when none is explicitly selected yet, so
  // the page edits a real design instead of showing an empty state.
  const workspaceId = activeId ?? workspaces[0]?.id ?? null;
  const controller = useOwnedSystemDesign(
    "workspace",
    workspaceId,
    null,
    null,
    workspaceId ?? "",
  );
  return { ...controller, workspaceId };
}

/**
 * A project's system design, merged with its workspace design. New project
 * designs honor the global "share with projects by default" setting.
 */
export function useProjectSystemDesign(
  projectId: string | null,
): SystemDesignController {
  const { settings } = useGlobalSettings();
  const shareByDefault = settings.systemDesign.shareWithProjectsByDefault;

  const loadParent = useCallback(async () => {
    if (!projectId) return null;
    const workspace = await getWorkspaceForProject(projectId);
    if (!workspace) return null;
    return getOrCreateSystemDesignByOwner({
      ownerScope: "workspace",
      ownerId: workspace.id,
    });
  }, [projectId]);

  const buildInitialExcluded = useCallback(
    (parent: SystemDesignRow | null) => {
      if (!parent) return undefined;
      return shareByDefault
        ? emptyExcludedShared()
        : excludeAllShared(parent.tokens);
    },
    [shareByDefault],
  );

  return useOwnedSystemDesign(
    "project",
    projectId,
    loadParent,
    buildInitialExcluded,
    projectId ?? "",
  );
}
