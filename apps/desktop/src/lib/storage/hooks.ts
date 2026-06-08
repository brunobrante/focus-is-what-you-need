import { useEffect, useState } from "react";

import {
  ownerInvalidationKey,
  subscribeInvalidation,
} from "@/application/persistence/invalidationBus";
import {
  getComponent,
  listChildrenOfVariant,
  listComponents,
  listComponentsByProject,
  listTopLevelByScreen,
  listWorkspaceComponents,
} from "@/lib/storage/repos/components.repo";
import { findProjectByName, getProject, listProjects } from "@/lib/storage/repos/projects.repo";
import { getWorkspace, listWorkspaces } from "@/lib/storage/repos/workspace.repo";
import { listSystemDesignsByOwner } from "@/lib/storage/repos/systemDesigns.repo";
import {
  listReferencesByOwner,
  listReferencesByProject,
} from "@/lib/storage/repos/references.repo";
import { findScreenByTitle, getScreen, listScreens, listScreensByProject } from "@/lib/storage/repos/screens.repo";
import { getSceneByOwner } from "@/lib/storage/repos/scenes.repo";
import { getThumbnailByOwner } from "@/lib/storage/repos/thumbnails.repo";
import {
  getVariant,
  listVariants,
  listVariantsByComponent,
  listVariantsByIds,
} from "@/lib/storage/repos/variants.repo";
import type {
  ComponentRow,
  OwnerType,
  ProjectRow,
  ReferenceRow,
  SceneOwnerType,
  SceneRow,
  ScreenRow,
  SystemDesignOwnerScope,
  SystemDesignRow,
  ThumbnailRow,
  VariantRow,
  WorkspaceRow,
} from "@/lib/storage/schema";
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

export function useSystemDesigns(
  ownerScope: SystemDesignOwnerScope | null | undefined,
  ownerId: string | null | undefined,
): State<SystemDesignRow[]> {
  return useTableQuery<SystemDesignRow[]>(
    [TABLES.systemDesigns],
    async () =>
      ownerScope && ownerId ? listSystemDesignsByOwner(ownerScope, ownerId) : [],
    [],
    [ownerScope ?? "", ownerId ?? ""],
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
  );
}

export function useThumbnail(
  ownerType: SceneOwnerType | null | undefined,
  ownerId: string | null | undefined,
): State<ThumbnailRow | null> {
  const key = ownerType && ownerId ? ownerInvalidationKey("thumbnail", ownerType, ownerId) : "thumbnail:none";
  return useInvalidationQuery<ThumbnailRow | null>(
    [key],
    async () =>
      ownerType && ownerId ? getThumbnailByOwner(ownerType, ownerId) : null,
    null,
    [ownerType ?? "", ownerId ?? ""],
  );
}
