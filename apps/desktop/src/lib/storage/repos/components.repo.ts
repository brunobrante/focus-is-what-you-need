import type { ComponentKind, ProjectType } from "@/lib/data/types";
import {
  componentScope,
  normalizeComponentRow,
  normalizeReferenceRow,
} from "@/lib/storage/defaults";
import { newId, now } from "@/lib/storage/ids";
import {
  countInstanceUsages,
  detachInstancesOfComponents,
  removeComponentSubtreeFromParentScene,
  removeInstancesOfComponents,
  upsertScene,
} from "@/lib/storage/repos/scenes.repo";
import {
  createBlankHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";

export type InstanceDeleteStrategy = "detach" | "cascade";
import type {
  ComponentRow,
  ReferenceRow,
  SceneRow,
  ThumbnailRow,
  VariantRow,
} from "@/lib/storage/schema";
import { TABLES, listTable, notify, removeRecords, replaceTable } from "@/lib/storage/store";

const KEY = TABLES.components;
const VARIANTS_KEY = TABLES.variants;

export type ComponentParent =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "project"; projectId: string }
  | { kind: "screen"; screenId: string }
  | { kind: "variant"; variantId: string }
  // A loose, project-less draft: every scope owner is null. Born from Home.
  | { kind: "draft" };

/**
 * Loose drafts — components that belong to no workspace, project, screen, or
 * parent variant (every scope owner null). They are the Home "Drafts" feature:
 * a Screen (top-level component) or a free Component created outside the
 * containment hierarchy.
 */
export async function listDrafts(): Promise<ComponentRow[]> {
  const rows = await listComponents();
  return rows
    .filter(
      (r) =>
        !r.workspaceId &&
        !r.projectId &&
        !r.screenId &&
        !r.parentVariantId,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listComponents(): Promise<ComponentRow[]> {
  const rows = await listTable<ComponentRow>(KEY);
  return rows.map(normalizeComponentRow);
}

export async function listTopLevelByScreen(
  projectId: string,
  screenId: string,
): Promise<ComponentRow[]> {
  const rows = await listComponents();
  return rows
    .filter(
      (r) =>
        r.projectId === projectId &&
        r.screenId === screenId &&
        r.parentVariantId === null,
    )
    .sort((a, b) => a.order - b.order);
}

/** Top-level components of a screen, by screen id alone (project is implied). */
export async function listTopLevelByScreenId(
  screenId: string,
): Promise<ComponentRow[]> {
  const rows = await listComponents();
  return rows
    .filter((r) => r.screenId === screenId && r.parentVariantId === null)
    .sort((a, b) => a.order - b.order);
}

export async function listChildrenOfVariant(
  variantId: string,
): Promise<ComponentRow[]> {
  const rows = await listComponents();
  return rows
    .filter((r) => r.parentVariantId === variantId)
    .sort((a, b) => a.order - b.order);
}

export async function listComponentsByProject(
  projectId: string,
): Promise<ComponentRow[]> {
  const rows = await listComponents();
  return rows.filter((r) => r.projectId === projectId);
}

/** Workspace-global components (owned by a workspace, not any project). */
export async function listWorkspaceComponents(
  workspaceId: string,
): Promise<ComponentRow[]> {
  const rows = await listComponents();
  return rows
    .filter(
      (r) => componentScope(r) === "workspace" && r.workspaceId === workspaceId,
    )
    .sort((a, b) => a.order - b.order);
}

/** Project-global components (root-level inside a project, not on a screen). */
export async function listProjectGlobalComponents(
  projectId: string,
): Promise<ComponentRow[]> {
  const rows = await listComponents();
  return rows
    .filter((r) => componentScope(r) === "project" && r.projectId === projectId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Linkable components reachable from a project: any component flagged `linkable`
 * that belongs to the project or to its workspace — regardless of scope. This
 * includes project/workspace-global components AND the screen-level or nested
 * children that a linked version captured as linked instances (those get flagged
 * via `markComponentsLinkable`). These are the components offered by the canvas
 * "Add components" picker.
 */
export async function listLinkableComponents(input: {
  projectId: string | null;
  workspaceId: string | null;
}): Promise<ComponentRow[]> {
  const rows = await listComponents();
  return rows
    .filter((r) => {
      if (r.linkable !== true) return false;
      if (input.projectId != null && r.projectId === input.projectId) return true;
      if (input.workspaceId != null && r.workspaceId === input.workspaceId) return true;
      return false;
    })
    .sort((a, b) => a.order - b.order);
}

/**
 * Flip `linkable` to true on the given components (idempotent). Used when a
 * linked version captures child components as linked instances — those masters
 * become available to the picker.
 */
export async function markComponentsLinkable(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const components = await listTable<ComponentRow>(KEY);
  let changed = false;
  const next = components.map((c) => {
    if (!idSet.has(c.id) || c.linkable === true) return c;
    changed = true;
    return { ...c, linkable: true, updatedAt: now() };
  });
  if (!changed) return;
  await replaceTable<ComponentRow>(KEY, next);
  notify(KEY);
}

export async function getComponent(id: string): Promise<ComponentRow | null> {
  const rows = await listComponents();
  return rows.find((r) => r.id === id) ?? null;
}

export async function findComponentByName(
  parent: ComponentParent,
  name: string,
): Promise<ComponentRow | null> {
  const rows = await listComponents();
  const lower = name.toLowerCase();
  return (
    rows.find((r) => {
      if (r.name.toLowerCase() !== lower) return false;
      if (parent.kind === "workspace") {
        return (
          r.workspaceId === parent.workspaceId &&
          r.projectId === null &&
          r.screenId === null &&
          r.parentVariantId === null
        );
      }
      if (parent.kind === "project") {
        return (
          r.projectId === parent.projectId &&
          r.screenId === null &&
          r.parentVariantId === null
        );
      }
      if (parent.kind === "screen") {
        return r.screenId === parent.screenId && r.parentVariantId === null;
      }
      if (parent.kind === "draft") {
        return (
          !r.workspaceId && !r.projectId && !r.screenId && !r.parentVariantId
        );
      }
      return r.parentVariantId === parent.variantId;
    }) ?? null
  );
}

export async function findComponentBySourceNode(
  parent: ComponentParent,
  sourceNodeId: string | null | undefined,
): Promise<ComponentRow | null> {
  if (!sourceNodeId) return null;
  const rows = await listComponents();
  return (
    rows.find((r) => {
      if (r.sourceNodeId !== sourceNodeId) return false;
      if (parent.kind === "workspace") {
        return (
          r.workspaceId === parent.workspaceId &&
          r.projectId === null &&
          r.screenId === null &&
          r.parentVariantId === null
        );
      }
      if (parent.kind === "project") {
        return (
          r.projectId === parent.projectId &&
          r.screenId === null &&
          r.parentVariantId === null
        );
      }
      if (parent.kind === "screen") {
        return r.screenId === parent.screenId && r.parentVariantId === null;
      }
      if (parent.kind === "draft") {
        return (
          !r.workspaceId && !r.projectId && !r.screenId && !r.parentVariantId
        );
      }
      return r.parentVariantId === parent.variantId;
    }) ?? null
  );
}

/**
 * Atomically creates a Component plus its Default Variant.
 * Both rows are computed in memory and committed in two writes (components,
 * variants). The component carries `activeVariantId` pointing at the variant.
 */
export async function createComponent(input: {
  // The owning project, when the component lives inside one. Omitted/null for
  // workspace-global components (parent.kind === "workspace").
  projectId?: string | null;
  parent: ComponentParent;
  name: string;
  kind?: ComponentKind | null;
  category?: string | null;
  assignedScreenIds?: string[];
  sourceNodeId?: string | null;
  // Optional initial frame size (W×H). When both are provided, the component's
  // Default variant is seeded with a blank scene at exactly that size, so it
  // opens at the chosen dimensions instead of a project-type default.
  width?: number | null;
  height?: number | null;
  // Draft markers, set only when parent.kind === "draft".
  draftKind?: "screen" | "component" | null;
  draftType?: ProjectType | null;
}): Promise<{ component: ComponentRow; defaultVariant: VariantRow }> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error("Component name is required");
  }

  const t = now();

  const components = await listTable<ComponentRow>(KEY);
  const variants = await listTable<VariantRow>(VARIANTS_KEY);

  const siblings = components.filter((c) => {
    if (input.parent.kind === "workspace") {
      const workspaceId = input.parent.workspaceId;
      return (
        c.workspaceId === workspaceId &&
        c.projectId === null &&
        c.screenId === null &&
        c.parentVariantId === null
      );
    }
    if (input.parent.kind === "project") {
      return (
        c.projectId === input.projectId &&
        c.screenId === null &&
        c.parentVariantId === null
      );
    }
    if (input.parent.kind === "screen") {
      return (
        c.screenId === input.parent.screenId && c.parentVariantId === null
      );
    }
    if (input.parent.kind === "draft") {
      return (
        !c.workspaceId && !c.projectId && !c.screenId && !c.parentVariantId
      );
    }
    return c.parentVariantId === input.parent.variantId;
  });
  const duplicate = siblings.find(
    (c) => c.name.toLowerCase() === trimmedName.toLowerCase(),
  );
  if (duplicate && !input.sourceNodeId) {
    throw new Error("A component with this name already exists in this parent");
  }

  const order =
    siblings.reduce((max, r) => (r.order > max ? r.order : max), -1) + 1;

  const componentId = newId();
  const variantId = newId();

  const defaultVariant: VariantRow = {
    id: variantId,
    ownerKind: "component",
    ownerId: componentId,
    name: "Default",
    order: 0,
    seedKey: null,
    createdAt: t,
    updatedAt: t,
  };

  const component = normalizeComponentRow({
    id: componentId,
    workspaceId:
      input.parent.kind === "workspace" ? input.parent.workspaceId : null,
    projectId: input.parent.kind === "workspace" ? null : input.projectId ?? null,
    screenId: input.parent.kind === "screen" ? input.parent.screenId : null,
    parentVariantId:
      input.parent.kind === "variant" ? input.parent.variantId : null,
    name: trimmedName,
    kind: input.kind ?? null,
    category: input.category?.trim() || null,
    description: null,
    assignedScreenIds: Array.from(new Set(input.assignedScreenIds ?? [])),
    sourceNodeId: input.sourceNodeId ?? null,
    // Global components (project or workspace scope) are linkable on creation.
    linkable:
      input.parent.kind === "project" || input.parent.kind === "workspace",
    draftKind: input.parent.kind === "draft" ? input.draftKind ?? null : null,
    draftType: input.parent.kind === "draft" ? input.draftType ?? null : null,
    activeVariantId: variantId,
    order,
    createdAt: t,
    updatedAt: t,
  });

  await replaceTable<VariantRow>(VARIANTS_KEY, [defaultVariant, ...variants]);
  await replaceTable<ComponentRow>(KEY, [component, ...components]);
  notify(VARIANTS_KEY);
  notify(KEY);

  // Seed a blank scene at the chosen size so the component opens at exactly W×H.
  const width = input.width ?? null;
  const height = input.height ?? null;
  if (width && height && width > 0 && height > 0) {
    const doc = createBlankHtmlCanvasDocument({ name: trimmedName, width, height });
    await upsertScene(
      { ownerType: "variant", ownerId: variantId, graphJSON: serializeHtmlCanvasDocument(doc) },
      { propagate: false },
    );
  }

  return { component, defaultVariant };
}

export async function updateComponent(
  componentId: string,
  patch: Partial<Pick<ComponentRow, "assignedScreenIds" | "category" | "description" | "kind" | "linkable" | "name" | "screenId" | "sourceNodeId">>,
): Promise<ComponentRow | null> {
  const components = await listTable<ComponentRow>(KEY);
  const idx = components.findIndex((component) => component.id === componentId);
  if (idx < 0) return null;

  const next = normalizeComponentRow({
    ...components[idx]!,
    ...patch,
    screenId: patch.screenId === undefined ? components[idx]!.screenId : patch.screenId,
    assignedScreenIds: patch.assignedScreenIds
      ? Array.from(new Set(patch.assignedScreenIds))
      : components[idx]!.assignedScreenIds,
    updatedAt: now(),
  });
  const nextComponents = [...components];
  nextComponents[idx] = next;
  await replaceTable<ComponentRow>(KEY, nextComponents);
  notify(KEY);
  return next;
}

/**
 * Point a component at a different variant. Separate from `updateComponent`
 * because `activeVariantId` is structural (it owns the editable scene), not a
 * user-editable field.
 */
export async function setActiveVariant(
  componentId: string,
  variantId: string,
): Promise<ComponentRow | null> {
  const components = await listTable<ComponentRow>(KEY);
  const idx = components.findIndex((component) => component.id === componentId);
  if (idx < 0) return null;
  if (components[idx]!.activeVariantId === variantId) return components[idx]!;
  const next = normalizeComponentRow({
    ...components[idx]!,
    activeVariantId: variantId,
    updatedAt: now(),
  });
  const nextComponents = [...components];
  nextComponents[idx] = next;
  await replaceTable<ComponentRow>(KEY, nextComponents);
  notify(KEY);
  return next;
}

/** Number of linked instances elsewhere that reference this component or its subtree. */
export async function countComponentInstanceUsages(componentId: string): Promise<number> {
  const components = await listTable<ComponentRow>(KEY);
  const variants = await listTable<VariantRow>(VARIANTS_KEY);
  return countInstanceUsages(collectComponentTreeIds(componentId, components, variants));
}

export async function deleteComponentTree(
  componentId: string,
  opts?: { instanceStrategy?: InstanceDeleteStrategy },
): Promise<void> {
  const components = await listTable<ComponentRow>(KEY);
  const variants = await listTable<VariantRow>(VARIANTS_KEY);
  const componentIds = collectComponentTreeIds(componentId, components, variants);
  if (componentIds.size === 0) return;

  // Resolve linked instances before the masters disappear: "detach" materializes
  // them into own content; "cascade" removes them everywhere.
  if (opts?.instanceStrategy === "detach") {
    await detachInstancesOfComponents(componentIds);
  } else if (opts?.instanceStrategy === "cascade") {
    await removeInstancesOfComponents(componentIds);
  }

  await removeComponentSubtreeFromParentScene(componentId);

  const variantIds = new Set(
    variants
      .filter((v) => v.ownerKind === "component" && componentIds.has(v.ownerId))
      .map((v) => v.id),
  );

  await replaceTable<ComponentRow>(
    KEY,
    components.filter((c) => !componentIds.has(c.id)),
  );
  await replaceTable<VariantRow>(
    VARIANTS_KEY,
    variants.filter((v) => !variantIds.has(v.id)),
  );

  const references = await listTable<ReferenceRow>(TABLES.references);
  await replaceTable<ReferenceRow>(
    TABLES.references,
    references
      .map((reference) => normalizeReferenceRow(reference))
      .map((reference) => {
        const attachments = reference.attachments.filter(
          (attachment) => !componentIds.has(attachment.componentId ?? ""),
        );
        return {
          ...reference,
          attachments,
          projectIds: Array.from(
            new Set(
              attachments
                .map((attachment) => attachment.projectId)
                .filter((id): id is string => Boolean(id)),
            ),
          ),
        };
      })
      // Keep references that still have any attachment (a workspace-level link has
      // no project but must survive a component delete).
      .filter((reference) => reference.attachments.length > 0),
  );

  // Delete only the affected scene/thumbnail rows. replaceTable would re-stringify
  // every surviving large blob to diff; removeRecords enqueues O(deleted) deletes.
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  removeRecords(
    TABLES.scenes,
    scenes.filter((s) => s.ownerType === "variant" && variantIds.has(s.ownerId)).map((s) => s.id),
  );

  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  removeRecords(
    TABLES.thumbnails,
    thumbnails.filter((t) => t.ownerType === "variant" && variantIds.has(t.ownerId)).map((t) => t.id),
  );

  notify(KEY);
  notify(VARIANTS_KEY);
  notify(TABLES.references);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
}

export function collectComponentTreeIds(
  rootComponentId: string,
  components: ComponentRow[],
  variants: VariantRow[],
): Set<string> {
  const result = new Set<string>();
  const queue = [rootComponentId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (result.has(currentId)) continue;
    const current = components.find((c) => c.id === currentId);
    if (!current) continue;
    result.add(currentId);

    const ownedVariantIds = variants
      .filter((v) => v.ownerKind === "component" && v.ownerId === currentId)
      .map((v) => v.id);
    for (const child of components) {
      if (child.parentVariantId && ownedVariantIds.includes(child.parentVariantId)) {
        queue.push(child.id);
      }
    }
  }

  return result;
}

export async function bulkInsertComponents(rows: ComponentRow[]): Promise<void> {
  await replaceTable<ComponentRow>(KEY, rows.map(normalizeComponentRow));
  notify(KEY);
}
