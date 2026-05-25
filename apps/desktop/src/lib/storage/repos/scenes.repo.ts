import {
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { createSceneDependencyIndex, type SceneDependencyIndex } from "@/application/scenes/dependencyIndex";
import { notifyInvalidation, ownerInvalidationKey } from "@/application/persistence/invalidationBus";
import { scheduleThumbnailRefresh } from "@/application/thumbnails/thumbnailQueue";
import { newId, now } from "@/lib/storage/ids";
import type { ComponentRow, SceneOwnerType, SceneRow, VariantRow } from "@/lib/storage/schema";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.scenes;

export async function listScenes(): Promise<SceneRow[]> {
  return getTable<SceneRow>(KEY);
}

export async function getSceneByOwner(
  ownerType: SceneOwnerType,
  ownerId: string,
): Promise<SceneRow | null> {
  const rows = await listScenes();
  return (
    rows.find((r) => r.ownerType === ownerType && r.ownerId === ownerId) ?? null
  );
}

export async function upsertScene(input: {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
}, options: {
  propagate?: boolean;
} = {}): Promise<SceneRow> {
  const rows = await listScenes();
  const existing = rows.find(
    (r) => r.ownerType === input.ownerType && r.ownerId === input.ownerId,
  );
  const t = now();
  if (existing) {
    const updated: SceneRow = {
      ...existing,
      graphJSON: input.graphJSON,
      sceneVersion: existing.sceneVersion + 1,
      updatedAt: t,
    };
    const next = rows.map((r) => (r.id === existing.id ? updated : r));
    await setTable<SceneRow>(KEY, next);
    scheduleDerivedThumbnail(input);
    if (options.propagate !== false) {
      await propagateVariantSceneToParents(input, t);
    }
    notifyInvalidation(ownerInvalidationKey("scene", input.ownerType, input.ownerId));
    notify(KEY);
    return updated;
  }
  const created: SceneRow = {
    id: newId(),
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    graphJSON: input.graphJSON,
    sceneVersion: 1,
    updatedAt: t,
  };
  await setTable<SceneRow>(KEY, [created, ...rows]);
  scheduleDerivedThumbnail(input);
  if (options.propagate !== false) {
    await propagateVariantSceneToParents(input, t);
  }
  notifyInvalidation(ownerInvalidationKey("scene", input.ownerType, input.ownerId));
  notify(KEY);
  return created;
}

export async function syncConnectedSceneSnapshots(): Promise<void> {
  const variants = await getTable<VariantRow>(TABLES.variants);
  const components = await getTable<ComponentRow>(TABLES.components);
  const dependencyIndex = createSceneDependencyIndex({ components, variants });
  const t = now();

  const orderedVariants = variants
    .map((variant) => ({ variant, depth: dependencyIndex.getVariantDepth(variant.id) }))
    .sort((a, b) => b.depth - a.depth);

  for (const { variant } of orderedVariants) {
    const scene = await getSceneByOwner("variant", variant.id);
    if (!scene) continue;
    await propagateVariantSceneToParents(
      {
        ownerType: "variant",
        ownerId: variant.id,
        graphJSON: scene.graphJSON,
      },
      t,
      dependencyIndex,
    );
  }

  notify(KEY);
}

export async function removeComponentSubtreeFromParentScene(
  componentId: string,
): Promise<void> {
  const components = await getTable<ComponentRow>(TABLES.components);
  const component = components.find((row) => row.id === componentId);
  if (!component) return;

  const parentOwner =
    component.parentVariantId
      ? { ownerType: "variant" as const, ownerId: component.parentVariantId }
      : component.screenId
        ? { ownerType: "screen" as const, ownerId: component.screenId }
        : null;
  if (!parentOwner) return;

  const parentScene = await getSceneByOwner(parentOwner.ownerType, parentOwner.ownerId);
  if (!parentScene) return;

  const nextGraphJSON = removeComponentSubtreeInGraph(
    parentScene.graphJSON,
    component,
  );
  if (!nextGraphJSON || nextGraphJSON === parentScene.graphJSON) return;

  await upsertScene({
    ownerType: parentOwner.ownerType,
    ownerId: parentOwner.ownerId,
    graphJSON: nextGraphJSON,
  });
}

function scheduleDerivedThumbnail(input: {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
}): void {
  scheduleThumbnailRefresh({
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    graphJSON: input.graphJSON,
  });
}

async function propagateVariantSceneToParents(
  input: {
    ownerType: SceneOwnerType;
    ownerId: string;
    graphJSON: string;
  },
  t: number,
  preloadedIndex?: SceneDependencyIndex,
): Promise<void> {
  if (input.ownerType !== "variant") return;

  let currentVariantId: string | null = input.ownerId;
  let currentGraphJSON = input.graphJSON;
  const visited = new Set<string>();

  const dependencyIndex = preloadedIndex ?? createSceneDependencyIndex({
    variants: await getTable<VariantRow>(TABLES.variants),
    components: await getTable<ComponentRow>(TABLES.components),
  });

  for (let depth = 0; currentVariantId && depth < 64; depth += 1) {
    if (visited.has(currentVariantId)) return;
    visited.add(currentVariantId);

    const component = dependencyIndex.getComponentForVariant(currentVariantId);
    if (!component) return;

    const parentOwner = dependencyIndex.getParentOwnerForVariant(currentVariantId);
    if (!parentOwner) return;

    const parentScene = await getSceneByOwner(parentOwner.ownerType, parentOwner.ownerId);
    if (!parentScene) return;

    const nextParentGraphJSON = replaceComponentSubtreeInGraph(
      parentScene.graphJSON,
      currentGraphJSON,
      component,
    );
    if (!nextParentGraphJSON || nextParentGraphJSON === parentScene.graphJSON) return;

    await upsertSceneRowWithoutPropagation({
      ownerType: parentOwner.ownerType,
      ownerId: parentOwner.ownerId,
      graphJSON: nextParentGraphJSON,
      t,
    });

    if (parentOwner.ownerType !== "variant") return;
    currentVariantId = parentOwner.ownerId;
    currentGraphJSON = nextParentGraphJSON;
  }
}

async function upsertSceneRowWithoutPropagation(input: {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
  t: number;
}): Promise<void> {
  const rows = await listScenes();
  const existing = rows.find(
    (row) => row.ownerType === input.ownerType && row.ownerId === input.ownerId,
  );
  if (!existing) {
    await setTable<SceneRow>(KEY, [
      {
        id: newId(),
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        graphJSON: input.graphJSON,
        sceneVersion: 1,
        updatedAt: input.t,
      },
      ...rows,
    ]);
  } else {
    await setTable<SceneRow>(
      KEY,
      rows.map((row) =>
        row.id === existing.id
          ? {
              ...existing,
              graphJSON: input.graphJSON,
              sceneVersion: existing.sceneVersion + 1,
              updatedAt: input.t,
            }
          : row,
      ),
    );
  }
  scheduleDerivedThumbnail(input);
  notifyInvalidation(ownerInvalidationKey("scene", input.ownerType, input.ownerId));
}

function replaceComponentSubtreeInGraph(
  parentGraphJSON: string,
  childGraphJSON: string,
  component: ComponentRow,
): string | null {
  const parent = htmlCanvasDocumentFromJSON(parentGraphJSON);
  const child = htmlCanvasDocumentFromJSON(childGraphJSON);
  if (!parent || !child) return null;

  const childSubject = subjectNodeForDocument(child);
  if (!childSubject) return null;

  const target =
    (component.sourceNodeId
      ? parent.nodes.find((node) => node.id === component.sourceNodeId)
      : null) ??
    parent.nodes.find(
      (node) => normalizeName(node.name) === normalizeName(component.name),
    );
  if (!target) return null;

  const childNodesByParent = groupNodesByParent(child.nodes);
  const parentDescendantIds = collectDescendantIds(parent.nodes, target.id);
  const keptNodes = parent.nodes.filter(
    (node) => node.id === target.id || !parentDescendantIds.has(node.id),
  );
  const usedIds = new Set(keptNodes.map((node) => node.id));
  const idMap = new Map<string, string>([[childSubject.id, target.id]]);

  const nextNodes = keptNodes.map((node) =>
    node.id === target.id
      ? mergeSubjectIntoTarget(target, childSubject)
      : node,
  );

  const appendChildren = (sourceParentId: string, nextParentId: string) => {
    const children = childNodesByParent.get(sourceParentId) ?? [];
    for (const childNode of children) {
      const nextId = uniqueNodeId(childNode.id, usedIds);
      usedIds.add(nextId);
      idMap.set(childNode.id, nextId);
      const nextParent = idMap.get(childNode.parentId ?? "") ?? nextParentId;
      nextNodes.push({
        ...childNode,
        id: nextId,
        parentId: nextParent,
      });
      appendChildren(childNode.id, nextId);
    }
  };

  appendChildren(childSubject.id, target.id);

  return serializeHtmlCanvasDocument({
    ...parent,
    nodes: nextNodes,
    updatedAt: Date.now(),
  });
}

function removeComponentSubtreeInGraph(
  parentGraphJSON: string,
  component: ComponentRow,
): string | null {
  const parent = htmlCanvasDocumentFromJSON(parentGraphJSON);
  if (!parent) return null;

  const target =
    (component.sourceNodeId
      ? parent.nodes.find((node) => node.id === component.sourceNodeId)
      : null) ??
    parent.nodes.find(
      (node) =>
        node.id !== parent.rootId &&
        normalizeName(node.name) === normalizeName(component.name),
    );
  if (!target || target.id === parent.rootId) return null;

  const removedIds = collectDescendantIds(parent.nodes, target.id);
  removedIds.add(target.id);

  return serializeHtmlCanvasDocument({
    ...parent,
    nodes: parent.nodes.filter((node) => !removedIds.has(node.id)),
    updatedAt: Date.now(),
  });
}

function subjectNodeForDocument(document: HtmlCanvasDocument): HtmlCanvasNode | null {
  const root = document.nodes.find((node) => node.id === document.rootId);
  if (!root) return null;
  const rootChildren = document.nodes.filter((node) => node.parentId === root.id);
  if (
    root.name.endsWith(" Canvas") &&
    rootChildren.length === 1 &&
    rootChildren[0] &&
    rootChildren[0].bounds.x === 0 &&
    rootChildren[0].bounds.y === 0 &&
    Math.round(rootChildren[0].bounds.width) === Math.round(root.bounds.width) &&
    Math.round(rootChildren[0].bounds.height) === Math.round(root.bounds.height)
  ) {
    return rootChildren[0];
  }
  return root;
}

function mergeSubjectIntoTarget(
  target: HtmlCanvasNode,
  subject: HtmlCanvasNode,
): HtmlCanvasNode {
  return {
    ...subject,
    id: target.id,
    parentId: target.parentId,
    order: target.order,
    bounds: {
      ...subject.bounds,
      x: target.bounds.x,
      y: target.bounds.y,
    },
    locked: target.locked,
    visible: target.visible,
  };
}

function collectDescendantIds(
  nodes: HtmlCanvasNode[],
  nodeId: string,
): Set<string> {
  const childrenByParent = groupNodesByParent(nodes);
  const result = new Set<string>();
  const walk = (parentId: string) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      result.add(child.id);
      walk(child.id);
    }
  };
  walk(nodeId);
  return result;
}

function groupNodesByParent(
  nodes: HtmlCanvasNode[],
): Map<string, HtmlCanvasNode[]> {
  const groups = new Map<string, HtmlCanvasNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const group = groups.get(node.parentId) ?? [];
    group.push(node);
    groups.set(node.parentId, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.order - b.order);
  }
  return groups;
}

function uniqueNodeId(preferred: string, usedIds: Set<string>): string {
  if (!usedIds.has(preferred)) return preferred;
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${preferred}-${index}`;
    if (!usedIds.has(candidate)) return candidate;
  }
  return `${preferred}-${Date.now()}`;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
