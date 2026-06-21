import {
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import {
  collectDescendantIds,
  materializeInstancesInGraph,
  normalizeName,
  replaceComponentSubtreeInGraph,
} from "@/domain/canvas/graphTransforms";
import { createSceneDependencyIndex, type SceneDependencyIndex } from "@/application/scenes/dependencyIndex";
import { getCachedSceneDependencyIndex } from "@/application/scenes/sceneDependencyIndexCache";
import { notifyInvalidation, ownerInvalidationKey } from "@/application/persistence/invalidationBus";
import { scheduleThumbnailRefresh } from "@/application/thumbnails/thumbnailQueue";
import { now } from "@/lib/storage/ids";
import type { ComponentRow, SceneOwnerType, SceneRow, VariantRow } from "@/lib/storage/schema";
import { TABLES, getRecordById, listTable, notify, putRecord } from "@/lib/storage/store";

const KEY = TABLES.scenes;

/**
 * Scene rows are keyed deterministically by their owner (`ownerType:ownerId`), so
 * a lookup is an O(1) record-store cache hit (`getRecordById`) instead of a full
 * table scan. There is exactly one scene per owner, so the owner pair is a natural
 * primary key.
 */
export function sceneRecordId(ownerType: SceneOwnerType, ownerId: string): string {
  return `${ownerType}:${ownerId}`;
}

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
  return getRecordById<SceneRow>(KEY, sceneRecordId(ownerType, ownerId));
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
        id: sceneRecordId(input.ownerType, input.ownerId),
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

  const dependencyIndex = preloadedIndex ?? (await getCachedSceneDependencyIndex());

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
        id: sceneRecordId(input.ownerType, input.ownerId),
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
