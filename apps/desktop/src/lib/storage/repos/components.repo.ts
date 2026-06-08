import type { ComponentKind } from "@/lib/data/types";
import {
  componentScope,
  normalizeComponentRow,
  normalizeReferenceRow,
} from "@/lib/storage/defaults";
import { newId, now } from "@/lib/storage/ids";
import { removeComponentSubtreeFromParentScene } from "@/lib/storage/repos/scenes.repo";
import type {
  ComponentRow,
  ReferenceRow,
  SceneRow,
  ThumbnailRow,
  VariantRow,
} from "@/lib/storage/schema";
import { TABLES, listTable, notify, replaceTable } from "@/lib/storage/store";

const KEY = TABLES.components;
const VARIANTS_KEY = TABLES.variants;

export type ComponentParent =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "project"; projectId: string }
  | { kind: "screen"; screenId: string }
  | { kind: "variant"; variantId: string };

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
    componentId,
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
    activeVariantId: variantId,
    order,
    createdAt: t,
    updatedAt: t,
  });

  await replaceTable<VariantRow>(VARIANTS_KEY, [defaultVariant, ...variants]);
  await replaceTable<ComponentRow>(KEY, [component, ...components]);
  notify(VARIANTS_KEY);
  notify(KEY);

  return { component, defaultVariant };
}

export async function updateComponent(
  componentId: string,
  patch: Partial<Pick<ComponentRow, "assignedScreenIds" | "category" | "description" | "kind" | "name" | "screenId" | "sourceNodeId">>,
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

export async function deleteComponentTree(componentId: string): Promise<void> {
  const components = await listTable<ComponentRow>(KEY);
  const variants = await listTable<VariantRow>(VARIANTS_KEY);
  const componentIds = collectComponentTreeIds(componentId, components, variants);
  if (componentIds.size === 0) return;

  await removeComponentSubtreeFromParentScene(componentId);

  const variantIds = new Set(
    variants.filter((v) => componentIds.has(v.componentId)).map((v) => v.id),
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
          projectIds: Array.from(new Set(attachments.map((attachment) => attachment.projectId))),
        };
      })
      .filter((reference) => reference.projectIds.length > 0),
  );

  const scenes = await listTable<SceneRow>(TABLES.scenes);
  await replaceTable<SceneRow>(
    TABLES.scenes,
    scenes.filter((s) => !(s.ownerType === "variant" && variantIds.has(s.ownerId))),
  );

  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  await replaceTable<ThumbnailRow>(
    TABLES.thumbnails,
    thumbnails.filter(
      (t) => !(t.ownerType === "variant" && variantIds.has(t.ownerId)),
    ),
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
      .filter((v) => v.componentId === currentId)
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
