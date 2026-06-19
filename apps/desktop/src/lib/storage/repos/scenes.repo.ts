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
import { TABLES, listTable, notify, putRecord } from "@/lib/storage/store";

const KEY = TABLES.scenes;

/**
 * Intrinsic size of a variant's frame (its root bounds) read from the stored
 * scene. Used to size a linked instance placed onto another scene. Returns null
 * when no scene exists yet (e.g. a just-created copy) so the caller can fall
 * back to a default.
 */
export async function getVariantFrameSize(
  variantId: string,
): Promise<{ width: number; height: number } | null> {
  const scene = await getSceneByOwner("variant", variantId);
  const doc = htmlCanvasDocumentFromJSON(scene?.graphJSON ?? null);
  if (!doc) return null;
  const root = doc.nodes.find((node) => node.id === doc.rootId);
  if (!root) return null;
  return { width: root.bounds.width, height: root.bounds.height };
}

/** The lowest-order ("main") variant id owned by a screen — the embedding scene. */
export function mainVariantIdForScreen(
  variants: VariantRow[],
  screenId: string,
): string | null {
  let main: VariantRow | null = null;
  for (const v of variants) {
    if (v.ownerKind !== "screen" || v.ownerId !== screenId) continue;
    if (!main || v.order < main.order) main = v;
  }
  return main?.id ?? null;
}

export async function listScenes(): Promise<SceneRow[]> {
  return listTable<SceneRow>(KEY);
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
  const existing = await getSceneByOwner(input.ownerType, input.ownerId);
  const t = now();
  // One record per scene: writing it persists a single row (per-row delta on the
  // save queue), never the whole scenes table.
  const row: SceneRow = existing
    ? { ...existing, graphJSON: input.graphJSON, sceneVersion: existing.sceneVersion + 1, updatedAt: t }
    : {
        id: newId(),
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        graphJSON: input.graphJSON,
        sceneVersion: 1,
        updatedAt: t,
      };
  putRecord<SceneRow>(KEY, row);
  // Snapshot propagation (CLAUDE.md): regenerate this node's thumbnail from the
  // scene graph; propagation below regenerates ancestor thumbnails too.
  scheduleThumbnailRefresh({
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    graphJSON: input.graphJSON,
  });
  if (options.propagate !== false) {
    await propagateVariantSceneToParents(input, t);
  }
  notifyInvalidation(ownerInvalidationKey("scene", input.ownerType, input.ownerId));
  notify(KEY);
  return row;
}

export async function syncConnectedSceneSnapshots(): Promise<void> {
  const variants = await listTable<VariantRow>(TABLES.variants);
  const components = await listTable<ComponentRow>(TABLES.components);
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
  const components = await listTable<ComponentRow>(TABLES.components);
  const component = components.find((row) => row.id === componentId);
  if (!component) return;

  let parentOwner: { ownerType: "variant"; ownerId: string } | null = null;
  if (component.parentVariantId) {
    parentOwner = { ownerType: "variant", ownerId: component.parentVariantId };
  } else if (component.screenId) {
    // Top-level screen component → its embedding scene is the screen's main variant.
    const variants = await listTable<VariantRow>(TABLES.variants);
    const mainVariantId = mainVariantIdForScreen(variants, component.screenId);
    if (mainVariantId) parentOwner = { ownerType: "variant", ownerId: mainVariantId };
  }
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

/**
 * Lazy ancestor propagation, off the save critical path. The queue calls this
 * at idle after a scene row is written with `{ propagate: false }`, so a deep
 * edit no longer multiplies the save cost by tree depth synchronously.
 */
export async function propagateSceneToParents(input: {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
}): Promise<void> {
  await propagateVariantSceneToParents(input, now());
  notify(KEY);
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
    variants: await listTable<VariantRow>(TABLES.variants),
    components: await listTable<ComponentRow>(TABLES.components),
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
  const existing = await getSceneByOwner(input.ownerType, input.ownerId);
  const row: SceneRow = existing
    ? { ...existing, graphJSON: input.graphJSON, sceneVersion: existing.sceneVersion + 1, updatedAt: input.t }
    : {
        id: newId(),
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        graphJSON: input.graphJSON,
        sceneVersion: 1,
        updatedAt: input.t,
      };
  putRecord<SceneRow>(KEY, row);
  scheduleThumbnailRefresh({
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    graphJSON: input.graphJSON,
  });
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
  // If this parent uses the component as a linked instance, there is no embedded
  // subtree to sync — leave the bare instance node so its instanceOf is preserved
  // (it resolves the master at render time).
  if (target.instanceOf) return null;

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

/**
 * Collapses each given child component's node subtree into a bare linked instance
 * node — `instanceOf` set, all descendants removed. Used by the "Linked" version
 * mode so a new variant references the original child masters instead of deep-copying
 * their content. Returns the original JSON unchanged when no child node is matched.
 */
export function linkifyChildComponentsInGraph(
  graphJSON: string,
  children: ReadonlyArray<{
    id: string;
    activeVariantId: string;
    sourceNodeId: string | null;
    name: string;
  }>,
): string | null {
  const doc = htmlCanvasDocumentFromJSON(graphJSON);
  if (!doc) return null;

  const removed = new Set<string>();
  const instanceByNodeId = new Map<string, { componentId: string; variantId: string }>();

  for (const child of children) {
    const target =
      (child.sourceNodeId ? doc.nodes.find((n) => n.id === child.sourceNodeId) : null) ??
      doc.nodes.find(
        (n) => n.id !== doc.rootId && normalizeName(n.name) === normalizeName(child.name),
      );
    if (!target || target.id === doc.rootId) continue;
    for (const id of collectDescendantIds(doc.nodes, target.id)) removed.add(id);
    instanceByNodeId.set(target.id, { componentId: child.id, variantId: child.activeVariantId });
  }

  if (instanceByNodeId.size === 0) return graphJSON;

  const nextNodes = doc.nodes
    .filter((n) => !removed.has(n.id))
    .map((n) => {
      const ref = instanceByNodeId.get(n.id);
      return ref ? { ...n, instanceOf: ref } : n;
    });

  return serializeHtmlCanvasDocument({ ...doc, nodes: nextNodes, updatedAt: Date.now() });
}

/**
 * Permanently materializes linked instances of the given master components into
 * their parent scene: each matching instance node is replaced by a deep copy of the
 * master subject subtree (fresh ids, unlocked, link cleared). Nested instances inside
 * the master are preserved as bare instance nodes so their links survive. This is the
 * storage-level "detach" used when a master is about to be deleted.
 */
export function materializeInstancesInGraph(
  graphJSON: string,
  shouldMaterialize: (componentId: string) => boolean,
  getMasterGraph: (variantId: string) => string | null,
): string | null {
  const doc = htmlCanvasDocumentFromJSON(graphJSON);
  if (!doc) return null;
  const targets = doc.nodes.filter(
    (n) => n.instanceOf && shouldMaterialize(n.instanceOf.componentId),
  );
  if (targets.length === 0) return null;

  let nodes = doc.nodes;
  const usedIds = new Set(nodes.map((n) => n.id));

  for (const target of targets) {
    const ref = target.instanceOf!;
    const masterGraph = getMasterGraph(ref.variantId);
    const master = masterGraph ? htmlCanvasDocumentFromJSON(masterGraph) : null;
    const subject = master ? subjectNodeForDocument(master) : null;
    if (!master || !subject) {
      // No master to inline — just drop the link so it becomes plain content.
      nodes = nodes.map((n) => (n.id === target.id ? { ...n, instanceOf: null } : n));
      continue;
    }

    const childByParent = groupNodesByParent(master.nodes);
    const idMap = new Map<string, string>([[subject.id, target.id]]);
    const merged: HtmlCanvasNode = {
      ...subject,
      id: target.id,
      parentId: target.parentId,
      order: target.order,
      name: target.name,
      cssId: target.cssId,
      className: target.className,
      tag: target.tag,
      bounds: { ...target.bounds },
      visible: target.visible,
      locked: false,
      instanceOf: null,
    };

    const appended: HtmlCanvasNode[] = [];
    const appendChildren = (sourceParentId: string, fallbackParentId: string): void => {
      for (const childNode of childByParent.get(sourceParentId) ?? []) {
        const nextId = uniqueNodeId(`${target.id}~${childNode.id}`, usedIds);
        usedIds.add(nextId);
        idMap.set(childNode.id, nextId);
        const nextParentId = idMap.get(childNode.parentId ?? "") ?? fallbackParentId;
        appended.push({ ...childNode, id: nextId, parentId: nextParentId, locked: false });
        // Preserve nested links: a nested instance stays a bare instance node.
        if (!childNode.instanceOf) appendChildren(childNode.id, nextId);
      }
    };
    appendChildren(subject.id, target.id);

    nodes = nodes.map((n) => (n.id === target.id ? merged : n)).concat(appended);
  }

  return serializeHtmlCanvasDocument({ ...doc, nodes, updatedAt: Date.now() });
}

/**
 * Removes instance nodes of the given master components from a scene (cascade delete).
 */
export function removeInstancesInGraph(
  graphJSON: string,
  shouldRemove: (componentId: string) => boolean,
): string | null {
  const doc = htmlCanvasDocumentFromJSON(graphJSON);
  if (!doc) return null;
  const removed = new Set(
    doc.nodes
      .filter((n) => n.instanceOf && shouldRemove(n.instanceOf.componentId))
      .map((n) => n.id),
  );
  if (removed.size === 0) return null;
  for (const id of [...removed]) {
    for (const d of collectDescendantIds(doc.nodes, id)) removed.add(d);
  }
  return serializeHtmlCanvasDocument({
    ...doc,
    nodes: doc.nodes.filter((n) => !removed.has(n.id)),
    updatedAt: Date.now(),
  });
}

export type InstanceUsage = {
  ownerType: SceneOwnerType;
  ownerId: string;
  count: number;
};

/** Reverse index: scenes that contain instances of the given master components. */
export async function listInstanceUsages(
  componentIds: Set<string>,
): Promise<InstanceUsage[]> {
  if (componentIds.size === 0) return [];
  const scenes = await listScenes();
  const usages: InstanceUsage[] = [];
  for (const scene of scenes) {
    const doc = htmlCanvasDocumentFromJSON(scene.graphJSON);
    if (!doc) continue;
    const count = doc.nodes.filter(
      (n) => n.instanceOf && componentIds.has(n.instanceOf.componentId),
    ).length;
    if (count > 0) usages.push({ ownerType: scene.ownerType, ownerId: scene.ownerId, count });
  }
  return usages;
}

export async function countInstanceUsages(componentIds: Set<string>): Promise<number> {
  const usages = await listInstanceUsages(componentIds);
  return usages.reduce((sum, u) => sum + u.count, 0);
}

/** Detach-all: materialize every instance of the given masters into own content. */
export async function detachInstancesOfComponents(componentIds: Set<string>): Promise<void> {
  if (componentIds.size === 0) return;
  const scenes = await listScenes();
  const masterGraphByVariant = new Map<string, string>();
  for (const s of scenes) {
    if (s.ownerType === "variant") masterGraphByVariant.set(s.ownerId, s.graphJSON);
  }
  for (const scene of scenes) {
    const next = materializeInstancesInGraph(
      scene.graphJSON,
      (cid) => componentIds.has(cid),
      (vid) => masterGraphByVariant.get(vid) ?? null,
    );
    if (next) {
      await upsertScene(
        { ownerType: scene.ownerType, ownerId: scene.ownerId, graphJSON: next },
        { propagate: false },
      );
    }
  }
}

/** Cascade: remove every instance of the given masters from all scenes. */
export async function removeInstancesOfComponents(componentIds: Set<string>): Promise<void> {
  if (componentIds.size === 0) return;
  const scenes = await listScenes();
  for (const scene of scenes) {
    const next = removeInstancesInGraph(scene.graphJSON, (cid) => componentIds.has(cid));
    if (next) {
      await upsertScene(
        { ownerType: scene.ownerType, ownerId: scene.ownerId, graphJSON: next },
        { propagate: false },
      );
    }
  }
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
