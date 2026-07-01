import { useEffect, useRef, useState } from "react";

import {
  ownerInvalidationKey,
  subscribeInvalidation,
} from "@/application/persistence/invalidationBus";
import {
  getComponent,
  listChildrenOfVariant,
  listComponents,
  listComponentsByProject,
  listDrafts,
  listTopLevelByScreen,
  listWorkspaceComponents,
} from "@/lib/storage/repos/components.repo";
import { findProjectByName, getProject, listProjects } from "@/lib/storage/repos/projects.repo";
import { getWorkspace, listWorkspaces } from "@/lib/storage/repos/workspace.repo";
import {
  listReferencesByOwner,
  listReferencesByProject,
} from "@/lib/storage/repos/references.repo";
import { findScreenByTitle, getScreen, listScreens, listScreensByProject } from "@/lib/storage/repos/screens.repo";
import { getSceneByOwner } from "@/lib/storage/repos/scenes.repo";
import { getThumbnailByOwner } from "@/lib/storage/repos/thumbnails.repo";
import {
  loadAssetDataUrl,
  peekAssetDataUrl,
} from "@/application/persistence/assetDataUrlLoader";
import {
  getVariant,
  listVariants,
  listVariantsByComponent,
  listVariantsByIds,
  listVariantsByScreen,
} from "@/lib/storage/repos/variants.repo";
import type {
  ComponentRow,
  IconRow,
  OwnerType,
  ProjectRow,
  ReferenceRow,
  SceneOwnerType,
  SceneRow,
  ScreenRow,
  ThumbnailRow,
  VariantRow,
  WorkspaceRow,
} from "@/lib/storage/schema";
import { getIcon, listDraftIcons } from "@/lib/storage/repos/icons.repo";
import { ensureLocalProjectsLoaded } from "@/lib/storage/localProjects";
import { TABLES, type TableKey, subscribe } from "@/lib/storage/store";

let seededPromise: Promise<void> | null = null;
function ensureSeededOnce(): Promise<void> {
  if (!seededPromise) seededPromise = ensureLocalProjectsLoaded();
  return seededPromise;
}

type State<T> = { loading: boolean; data: T };

function useTableQuery<T>(
  tables: TableKey[],
  load: () => Promise<T>,
  initial: T,
  deps: ReadonlyArray<unknown>,
): State<T> {
  const [state, setState] = useState<State<T>>({ loading: true, data: initial });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await ensureSeededOnce();
        const data = await load();
        if (!cancelled) setState({ loading: false, data });
      } catch (error) {
        console.error("Failed to load storage data", error);
        if (!cancelled) setState({ loading: false, data: initial });
      }
    };
    void run();

    const unsubs = tables.map((t) =>
      subscribe(t, () => {
        void (async () => {
          try {
            const data = await load();
            if (!cancelled) setState({ loading: false, data });
          } catch (error) {
            console.error("Failed to refresh storage data", error);
            if (!cancelled) setState({ loading: false, data: initial });
          }
        })();
      }),
    );

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

function useInvalidationQuery<T>(
  keys: string[],
  load: () => Promise<T>,
  initial: T,
  deps: ReadonlyArray<unknown>,
  // When true, the cached value is dropped synchronously the moment the query key
  // changes, so consumers never read the previous key's data during the reload. This
  // matters for owner-scoped reads like a scene: without it, switching owners briefly
  // yields the prior owner's value with `loading: false`, which a canvas editor can
  // seed and then persist over the real scene.
  resetOnKeyChange = false,
): State<T> {
  const [state, setState] = useState<State<T>>({ loading: true, data: initial });

  const keyId = keys.join("|");
  const prevKeyRef = useRef(keyId);
  if (resetOnKeyChange && prevKeyRef.current !== keyId) {
    prevKeyRef.current = keyId;
    setState({ loading: true, data: initial });
  }

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await ensureSeededOnce();
        const data = await load();
        if (!cancelled) setState({ loading: false, data });
      } catch (error) {
        console.error("Failed to load storage data", error);
        if (!cancelled) setState({ loading: false, data: initial });
      }
    };
    void run();

    const unsubscribe = subscribeInvalidation(keys, () => {
      void run();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function useProjects(): State<ProjectRow[]> {
  return useTableQuery<ProjectRow[]>([TABLES.projects], listProjects, [], []);
}

export function useWorkspaces(): State<WorkspaceRow[]> {
  return useTableQuery<WorkspaceRow[]>([TABLES.workspaces], listWorkspaces, [], []);
}

export function useWorkspace(
  id: string | null | undefined,
): State<WorkspaceRow | null> {
  return useTableQuery<WorkspaceRow | null>(
    [TABLES.workspaces],
    async () => (id ? getWorkspace(id) : null),
    null,
    [id ?? ""],
  );
}

/** Workspace-global components for the Global Components page. */
export function useWorkspaceComponents(
  workspaceId: string | null | undefined,
): State<ComponentRow[]> {
  return useTableQuery<ComponentRow[]>(
    [TABLES.components],
    async () => (workspaceId ? listWorkspaceComponents(workspaceId) : []),
    [],
    [workspaceId ?? ""],
  );
}

export function useProject(id: string | null | undefined): State<ProjectRow | null> {
  return useTableQuery<ProjectRow | null>(
    [TABLES.projects],
    async () => (id ? getProject(id) : null),
    null,
    [id ?? ""],
  );
}

export function useProjectByName(
  name: string | null | undefined,
): State<ProjectRow | null> {
  return useTableQuery<ProjectRow | null>(
    [TABLES.projects],
    async () => (name ? findProjectByName(name) : null),
    null,
    [name ?? ""],
  );
}

export function useAllScreens(): State<ScreenRow[]> {
  return useTableQuery<ScreenRow[]>([TABLES.screens], listScreens, [], []);
}

export function useScreens(projectId: string | null | undefined): State<ScreenRow[]> {
  return useTableQuery<ScreenRow[]>(
    [TABLES.screens],
    async () => (projectId ? listScreensByProject(projectId) : []),
    [],
    [projectId ?? ""],
  );
}

export function useScreen(id: string | null | undefined): State<ScreenRow | null> {
  return useTableQuery<ScreenRow | null>(
    [TABLES.screens],
    async () => (id ? getScreen(id) : null),
    null,
    [id ?? ""],
  );
}

export function useScreenByTitle(
  projectId: string | null | undefined,
  title: string | null | undefined,
): State<ScreenRow | null> {
  return useTableQuery<ScreenRow | null>(
    [TABLES.screens],
    async () => (projectId && title ? findScreenByTitle(projectId, title) : null),
    null,
    [projectId ?? "", title ?? ""],
  );
}

/** Top-level components on a screen (parentVariantId IS NULL). */
export function useScreenChildren(
  projectId: string | null | undefined,
  screenId: string | null | undefined,
): State<ComponentRow[]> {
  return useTableQuery<ComponentRow[]>(
    [TABLES.components],
    async () =>
      projectId && screenId
        ? listTopLevelByScreen(projectId, screenId)
        : [],
    [],
    [projectId ?? "", screenId ?? ""],
  );
}

/** Children components of a variant. */
export function useVariantChildren(
  variantId: string | null | undefined,
): State<ComponentRow[]> {
  return useTableQuery<ComponentRow[]>(
    [TABLES.components],
    async () => (variantId ? listChildrenOfVariant(variantId) : []),
    [],
    [variantId ?? ""],
  );
}

export function useComponent(
  id: string | null | undefined,
): State<ComponentRow | null> {
  return useTableQuery<ComponentRow | null>(
    [TABLES.components],
    async () => (id ? getComponent(id) : null),
    null,
    [id ?? ""],
  );
}

export function useAllComponents(): State<ComponentRow[]> {
  return useTableQuery<ComponentRow[]>(
    [TABLES.components],
    listComponents,
    [],
    [],
  );
}

export function useComponentsByProject(
  projectId: string | null | undefined,
): State<ComponentRow[]> {
  return useTableQuery<ComponentRow[]>(
    [TABLES.components],
    async () => (projectId ? listComponentsByProject(projectId) : []),
    [],
    [projectId ?? ""],
  );
}

/** Loose, project-less drafts (Home "Drafts"), newest first. */
export function useDrafts(): State<ComponentRow[]> {
  return useTableQuery<ComponentRow[]>(
    [TABLES.components],
    async () => listDrafts(),
    [],
    [],
  );
}

/** A single icon master by id (e.g. to label the canvas when authoring its art). */
export function useIcon(id: string | null | undefined): State<IconRow | null> {
  return useTableQuery<IconRow | null>(
    [TABLES.icons],
    async () => (id ? getIcon(id) : null),
    null,
    [id ?? ""],
  );
}

/** Loose icon masters (no owner edge) — the Draft icons shown on the Drafts page. */
export function useDraftIcons(): State<IconRow[]> {
  return useTableQuery<IconRow[]>(
    [TABLES.icons],
    async () => listDraftIcons(),
    [],
    [],
  );
}

export function useVariants(
  componentId: string | null | undefined,
): State<VariantRow[]> {
  return useTableQuery<VariantRow[]>(
    [TABLES.variants],
    async () => (componentId ? listVariantsByComponent(componentId) : []),
    [],
    [componentId ?? ""],
  );
}

/** The variants (versions) of a screen master, ordered: main first, then V1, V2… */
export function useScreenVariants(
  screenId: string | null | undefined,
): State<VariantRow[]> {
  return useTableQuery<VariantRow[]>(
    [TABLES.variants],
    async () => (screenId ? listVariantsByScreen(screenId) : []),
    [],
    [screenId ?? ""],
  );
}

export function useVariant(
  id: string | null | undefined,
): State<VariantRow | null> {
  return useTableQuery<VariantRow | null>(
    [TABLES.variants],
    async () => (id ? getVariant(id) : null),
    null,
    [id ?? ""],
  );
}

export function useActiveVariant(
  componentId: string | null | undefined,
): State<VariantRow | null> {
  return useTableQuery<VariantRow | null>(
    [TABLES.variants, TABLES.components],
    async () => {
      if (!componentId) return null;
      const c = await getComponent(componentId);
      if (!c) return null;
      return getVariant(c.activeVariantId);
    },
    null,
    [componentId ?? ""],
  );
}

/**
 * Resolve active variants for a list of components in one pass.
 * Avoids N hooks when rendering grids of component cards.
 */
export function useActiveVariants(
  components: ComponentRow[] | null | undefined,
): State<Map<string, VariantRow>> {
  const ids = (components ?? [])
    .map((c) => c.activeVariantId)
    .filter((id): id is string => Boolean(id));
  const idsKey = ids.join("|");

  return useTableQuery<Map<string, VariantRow>>(
    [TABLES.variants],
    async () => {
      if (ids.length === 0) return new Map();
      const variants = await listVariantsByIds(ids);
      const byVariantId = new Map<string, VariantRow>();
      for (const v of variants) byVariantId.set(v.id, v);
      const byComponentId = new Map<string, VariantRow>();
      for (const c of components ?? []) {
        const v = byVariantId.get(c.activeVariantId);
        if (v) byComponentId.set(c.id, v);
      }
      return byComponentId;
    },
    new Map(),
    [idsKey],
  );
}

export function useAllVariants(): State<VariantRow[]> {
  return useTableQuery<VariantRow[]>([TABLES.variants], listVariants, [], []);
}

export function useReferences(
  ownerType: OwnerType | null | undefined,
  ownerId: string | null | undefined,
): State<ReferenceRow[]> {
  return useTableQuery<ReferenceRow[]>(
    [TABLES.references],
    async () =>
      ownerType && ownerId ? listReferencesByOwner(ownerType, ownerId) : [],
    [],
    [ownerType ?? "", ownerId ?? ""],
  );
}

export function useReferencesByProject(
  projectId: string | null | undefined,
): State<ReferenceRow[]> {
  return useTableQuery<ReferenceRow[]>(
    [TABLES.references],
    async () => (projectId ? listReferencesByProject(projectId) : []),
    [],
    [projectId ?? ""],
  );
}

export function useScene(
  ownerType: SceneOwnerType | null | undefined,
  ownerId: string | null | undefined,
): State<SceneRow | null> {
  const key = ownerType && ownerId ? ownerInvalidationKey("scene", ownerType, ownerId) : "scene:none";
  return useInvalidationQuery<SceneRow | null>(
    [key],
    async () =>
      ownerType && ownerId ? getSceneByOwner(ownerType, ownerId) : null,
    null,
    [ownerType ?? "", ownerId ?? ""],
    // Drop the prior owner's scene immediately on owner change — a stale scene seeded
    // into the versions/current editor would be persisted over the real one.
    true,
  );
}

/**
 * Resolve a blob-keyed asset to its `data:` URL through the batching loader (flip
 * 3): many keys requested in one tick collapse into a single round-trip. Pass a
 * `cacheToken` (e.g. the owner row's `updatedAt`/`capturedAt`) so a rewrite under
 * a reused stable key re-resolves. Returns null until loaded / when there's no key.
 */
export function useAssetDataUrl(
  blobKey: string | null | undefined,
  cacheToken?: number,
): string | null {
  const key = blobKey ?? null;
  const [dataUrl, setDataUrl] = useState<string | null>(() =>
    key ? peekAssetDataUrl(key) ?? null : null,
  );
  useEffect(() => {
    if (!key) {
      setDataUrl(null);
      return;
    }
    const cached = peekAssetDataUrl(key);
    if (cached !== undefined) setDataUrl(cached);
    let active = true;
    void loadAssetDataUrl(key).then((url) => {
      if (active) setDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [key, cacheToken]);
  return dataUrl;
}

/** A thumbnail row with its snapshot `data:` URL resolved from the asset store. */
export type ResolvedThumbnail = ThumbnailRow & { dataUrl: string };

export function useThumbnail(
  ownerType: SceneOwnerType | null | undefined,
  ownerId: string | null | undefined,
): State<ResolvedThumbnail | null> {
  const key = ownerType && ownerId ? ownerInvalidationKey("thumbnail", ownerType, ownerId) : "thumbnail:none";
  const rowState = useInvalidationQuery<ThumbnailRow | null>(
    [key],
    async () =>
      ownerType && ownerId ? getThumbnailByOwner(ownerType, ownerId) : null,
    null,
    [ownerType ?? "", ownerId ?? ""],
  );

  const row = rowState.data;
  const dataUrl = useAssetDataUrl(row?.dataBlobKey, row?.capturedAt);

  // Only surface a row once its image is resolved, so consumers reading
  // `data.dataUrl` keep a guaranteed string and show a placeholder until ready.
  const data: ResolvedThumbnail | null =
    row && dataUrl ? { ...row, dataUrl } : null;
  return { loading: rowState.loading, data };
}
