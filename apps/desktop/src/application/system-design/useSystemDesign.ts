import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { useWorkspaces } from "@/lib/storage/hooks";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { ensureLocalProjectsLoaded } from "@/lib/storage/localProjects";
import {
  buildLinkedTokens,
  linkableTokenIds,
} from "@/domain/system-design/defaults";
import {
  getOrCreateSystemDesignByOwner,
  saveSystemDesign,
} from "@/lib/storage/repos/systemDesigns.repo";
import { getWorkspaceForProject } from "@/lib/storage/repos/workspace.repo";
import { TABLES, subscribe } from "@/lib/storage/store";
import type {
  SystemDesignCategory,
  SystemDesignOwnerScope,
  SystemDesignRow,
  SystemDesignTokens,
} from "@/lib/storage/schema";
import {
  resolveSystemDesign,
  type ResolvedSystemDesign,
} from "@/domain/system-design/resolve";
import type { IconToken } from "@/lib/storage/schema";
import { deleteIconBacking } from "@/application/system-design/iconCanvas";

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
  /** True when there is a workspace to link shared tokens from. */
  hasParent: boolean;
  /** Create or edit one of the owner's own tokens. */
  upsertToken: (category: SystemDesignCategory, token: AnyToken) => void;
  /** Remove a token (local or linked instance) from this design. */
  deleteToken: (category: SystemDesignCategory, tokenId: string) => void;
  /** Link a workspace token into this project as a live linked instance. */
  linkToken: (category: SystemDesignCategory, masterTokenId: string) => void;
  /**
   * Detach a linked instance: copy the master's current values locally and drop
   * the link, so it becomes an independent, editable project token.
   */
  detachToken: (category: SystemDesignCategory, tokenId: string) => void;
  /** Toggle a (workspace) token's linkable state — its shareability. */
  setTokenLinkable: (
    category: SystemDesignCategory,
    tokenId: string,
    linkable: boolean,
  ) => void;
  rename: (name: string) => void;
}

type LoadState = {
  loading: boolean;
  design: SystemDesignRow | null;
  parent: SystemDesignRow | null;
};

const IDLE: LoadState = { loading: true, design: null, parent: null };

type BuildInitialTokens =
  | ((parent: SystemDesignRow | null) => SystemDesignTokens | undefined)
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
  buildInitialTokens: BuildInitialTokens,
  depsKey: string,
): SystemDesignController {
  const [state, setState] = useState<LoadState>(IDLE);

  const designRef = useRef<SystemDesignRow | null>(null);
  const parentRef = useRef<SystemDesignRow | null>(null);
  // Monotonic load counter: a reload triggered by another design's write (e.g.
  // applyTokenLinkDecisions touching project designs) can be in flight, reading the
  // store BEFORE a local optimistic write lands. Without ordering, that stale load's
  // setState would clobber the fresh optimistic state (re-resurrecting a just-cleared
  // `linkable` flag). Only the latest run is allowed to commit.
  const runSeqRef = useRef(0);
  const loadParentRef = useRef(loadParent);
  loadParentRef.current = loadParent;
  const buildInitialRef = useRef(buildInitialTokens);
  buildInitialRef.current = buildInitialTokens;

  useEffect(() => {
    designRef.current = state.design;
    parentRef.current = state.parent;
  }, [state.design, state.parent]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const seq = ++runSeqRef.current;
      const stale = () => cancelled || seq !== runSeqRef.current;
      await ensureLocalProjectsLoaded();
      if (stale()) return;
      if (!ownerId) {
        setState({ loading: false, design: null, parent: null });
        return;
      }
      const parent = loadParentRef.current ? await loadParentRef.current() : null;
      if (stale()) return;
      const design = await getOrCreateSystemDesignByOwner({
        ownerScope: scope,
        ownerId,
        inheritsFromId: parent?.id ?? null,
        initialTokens: buildInitialRef.current?.(parent),
      });
      if (stale()) return;
      setState({ loading: false, design, parent });
    };

    void run();
    const unsubDesigns = subscribe(TABLES.systemDesigns, () => void run());
    // Tokens are their own rows now — an external token write (e.g. another
    // project's applyTokenLinkDecisions) must reload this design's assembled view.
    const unsubTokens = subscribe(TABLES.tokens, () => void run());
    const unsubWorkspaces = subscribe(TABLES.workspaces, () => void run());
    return () => {
      cancelled = true;
      unsubDesigns();
      unsubTokens();
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
        // Workspace tokens are shareable out of the box, mirroring how a
        // project/workspace-global component is linkable by default.
        const next =
          scope === "workspace" &&
          (token as { linkable?: boolean }).linkable === undefined
            ? { ...token, linkable: true }
            : token;
        const list = d.tokens[category] as AnyToken[];
        const nextTokens = {
          ...d.tokens,
          [category]: upsertById(list, next),
        } as SystemDesignTokens;
        return { ...d, tokens: nextTokens };
      });
    },
    [mutate, scope],
  );

  const deleteToken = useCallback(
    (category: SystemDesignCategory, tokenId: string) => {
      // Cascade: an owned icon token owns a backing component holding its editable
      // art — delete it so removing the token doesn't leak component/variant/scene.
      // A *linked instance* (`instanceOf`) is skipped: it points at the master's
      // backing, which lives with the master's design, not here. Runs before the
      // pure `mutate` updater so no side effect happens inside a setState updater.
      if (category === "icons") {
        const token = designRef.current?.tokens.icons.find((t) => t.id === tokenId) as
          | IconToken
          | undefined;
        if (token && !token.instanceOf && token.backingComponentId) {
          void deleteIconBacking(token.backingComponentId);
        }
      }
      mutate((d) => {
        const list = d.tokens[category] as AnyToken[];
        const next = list.filter((t) => t.id !== tokenId);
        if (next.length === list.length) return d;
        return {
          ...d,
          tokens: { ...d.tokens, [category]: next } as SystemDesignTokens,
        };
      });
    },
    [mutate],
  );

  const linkToken = useCallback(
    (category: SystemDesignCategory, masterTokenId: string) => {
      const parent = parentRef.current;
      if (!parent) return;
      mutate((d) => {
        const list = d.tokens[category] as AnyToken[];
        if (list.some((t) => t.id === masterTokenId)) return d; // already present
        const linked = buildLinkedTokens(
          parent.id,
          parent.tokens,
          new Set([masterTokenId]),
        )[category] as AnyToken[];
        if (linked.length === 0) return d;
        return {
          ...d,
          tokens: {
            ...d.tokens,
            [category]: [...list, ...linked],
          } as SystemDesignTokens,
        };
      });
    },
    [mutate],
  );

  const detachToken = useCallback(
    (category: SystemDesignCategory, tokenId: string) => {
      const parent = parentRef.current;
      mutate((d) => {
        const list = d.tokens[category] as (AnyToken & {
          instanceOf?: { tokenId: string } | null;
          linkable?: boolean;
        })[];
        const idx = list.findIndex((t) => t.id === tokenId);
        if (idx < 0 || !list[idx]!.instanceOf) return d;
        const master =
          (parent?.tokens[category] as AnyToken[] | undefined)?.find(
            (t) => t.id === list[idx]!.instanceOf!.tokenId,
          ) ?? null;
        // Copy the master's live values (fallback to the stored snapshot) and
        // drop the link + linkable so it becomes an independent local token.
        const { instanceOf: _i, linkable: _l, ...snapshot } = list[idx]!;
        const detached = {
          ...(master ?? snapshot),
          id: tokenId,
        } as AnyToken;
        delete (detached as { instanceOf?: unknown }).instanceOf;
        delete (detached as { linkable?: unknown }).linkable;
        const next = [...list];
        next[idx] = detached;
        return {
          ...d,
          tokens: { ...d.tokens, [category]: next } as SystemDesignTokens,
        };
      });
    },
    [mutate],
  );

  const setTokenLinkable = useCallback(
    (category: SystemDesignCategory, tokenId: string, linkable: boolean) => {
      mutate((d) => {
        const list = d.tokens[category] as (AnyToken & { linkable?: boolean })[];
        const idx = list.findIndex((t) => t.id === tokenId);
        if (idx < 0 || list[idx]!.linkable === linkable) return d;
        const next = [...list];
        next[idx] = { ...list[idx]!, linkable };
        return {
          ...d,
          tokens: { ...d.tokens, [category]: next } as SystemDesignTokens,
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
    linkToken,
    detachToken,
    setTokenLinkable,
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

  const buildInitialTokens = useCallback(
    (parent: SystemDesignRow | null) => {
      if (!parent || !shareByDefault) return undefined;
      // "Share by default" → link every linkable workspace token up front.
      return buildLinkedTokens(
        parent.id,
        parent.tokens,
        new Set(linkableTokenIds(parent.tokens)),
      );
    },
    [shareByDefault],
  );

  return useOwnedSystemDesign(
    "project",
    projectId,
    loadParent,
    buildInitialTokens,
    projectId ?? "",
  );
}
