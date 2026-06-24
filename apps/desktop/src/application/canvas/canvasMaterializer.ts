import { readSceneByOwner, saveScene } from "@/application/scenes/saveScene";
import {
  createComponent,
  findComponentByName,
  findComponentBySourceNode,
  listComponentsByProject,
  markComponentsLinkable,
  updateComponent,
} from "@/lib/storage/repos/components.repo";
import { linkifyChildComponentsInGraph } from "@/domain/canvas/graphTransforms";
import { upsertScene } from "@/lib/storage/repos/scenes.repo";
import { htmlGraphJSONFromCanvasDocument } from "@/canvas/engine/htmlSceneAdapter";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ComponentRow, ScreenRow } from "@/lib/storage/schema";
import {
  canvasDocumentForNode,
  componentNodeIdsFromDocument,
  findComponentByPath,
  findComponentBySourceNodeInList,
  fullComponentPathForCanvasNode,
} from "@/canvas/canvasUtils";

export async function upsertComponentSceneIfChanged(
  component: ComponentRow,
  graphJSON: string,
): Promise<void> {
  const existingScene = await readSceneByOwner("variant", component.activeVariantId);
  if (existingScene?.graphJSON === graphJSON) return;
  // Fire-and-forget into the save queue; ancestor propagation runs lazily at
  // idle inside the persistence adapter (no synchronous depth walk).
  saveScene({ ownerType: "variant", ownerId: component.activeVariantId, graphJSON });
}

export async function createOrFindComponent(input: {
  graphJSON: string;
  name: string;
  parent: { kind: "screen"; screenId: string } | { kind: "variant"; variantId: string };
  projectId: string;
  sourceNodeId: string;
}): Promise<ComponentRow | null> {
  const existingBySourceNode = await findComponentBySourceNode(input.parent, input.sourceNodeId);
  if (existingBySourceNode) {
    await upsertComponentSceneIfChanged(existingBySourceNode, input.graphJSON);
    return existingBySourceNode;
  }

  const existing = await findComponentByName(input.parent, input.name);
  if (existing && !existing.sourceNodeId) {
    await updateComponent(existing.id, { sourceNodeId: input.sourceNodeId });
    await upsertComponentSceneIfChanged(existing, input.graphJSON);
    return { ...existing, sourceNodeId: input.sourceNodeId };
  }

  try {
    const result = await createComponent({
      projectId: input.projectId,
      parent: input.parent,
      name: input.name,
      kind: "Custom",
      sourceNodeId: input.sourceNodeId,
    });
    saveScene({
      ownerType: "variant",
      ownerId: result.component.activeVariantId,
      graphJSON: input.graphJSON,
    });
    return result.component;
  } catch {
    const duplicateByName = await findComponentByName(input.parent, input.name);
    const duplicate =
      (await findComponentBySourceNode(input.parent, input.sourceNodeId)) ??
      (!duplicateByName?.sourceNodeId ? duplicateByName : null);
    if (!duplicate) return null;
    if (!duplicate.sourceNodeId) {
      await updateComponent(duplicate.id, { sourceNodeId: input.sourceNodeId });
    }
    await upsertComponentSceneIfChanged(duplicate, input.graphJSON);
    return { ...duplicate, sourceNodeId: input.sourceNodeId };
  }
}

export async function materializeComponentFromCanvasNode(input: {
  currentComponent: ComponentRow | null;
  document: CanvasDocument;
  nodeId: string;
  projectComponents: ComponentRow[];
  projectId: string | null;
  screen: ScreenRow | null;
  variants?: ReadonlyArray<{ id: string; ownerKind: string; ownerId: string }>;
  // When set, top-level owned nodes are owned by this variant (a version's own
  // components) instead of the screen. Used to materialize a version scene, where the
  // ownership is the variant, not a screen — mirrors the "Current" window so detached or
  // newly drawn content inside a version becomes a real, version-owned component.
  rootOwner?: { kind: "screen"; screenId: string } | { kind: "variant"; variantId: string };
}): Promise<ComponentRow | null> {
  if (!input.projectId) return null;
  const targetNode = input.document.elements[input.nodeId];
  if (!targetNode || targetNode.children.length === 0) return null;

  const components = [...input.projectComponents];
  const createdByNodeId = new Map<string, ComponentRow>();

  const ensureNodeComponent = async (nodeId: string): Promise<ComponentRow | null> => {
    const node = input.document.elements[nodeId];
    if (!node || node.children.length === 0) return null;
    // Never materialize a linked instance — it references a master, it is not one.
    if (node.instanceOf) return null;

    const cached = createdByNodeId.get(nodeId);
    if (cached) return cached;

    // Version-scoped materialization is owned by the variant, not a screen: it needs no
    // screen path, and the cross-screen path dedup below is skipped (it matches by
    // screen+names across ALL components and would let a version adopt a same-named main
    // component). sourceNodeId + name-within-parent (in createOrFindComponent) stay
    // parent-scoped, so they never reach outside the version.
    const versionScoped = input.rootOwner?.kind === "variant";

    // For main materialization the node must resolve to a screen path (used for the
    // cross-screen path dedup below). Version materialization is variant-owned and needs
    // neither — `screenScope` stays null and the path dedup is skipped.
    let screenScope: { screenId: string; names: string[] } | null = null;
    if (!versionScoped) {
      const fullPath = fullComponentPathForCanvasNode({
        currentComponent: input.currentComponent,
        document: input.document,
        nodeId,
        projectComponents: components,
        screen: input.screen,
        variants: input.variants,
      });
      if (!fullPath?.screenId) return null;
      screenScope = { screenId: fullPath.screenId, names: fullPath.names };
    }

    const parentComponent = node.parentId
      ? await ensureNodeComponent(node.parentId)
      : input.currentComponent;

    const parent: { kind: "screen"; screenId: string } | { kind: "variant"; variantId: string } =
      parentComponent
        ? { kind: "variant", variantId: parentComponent.activeVariantId }
        : input.rootOwner ?? { kind: "screen", screenId: screenScope!.screenId };

    const graphJSON = htmlGraphJSONFromCanvasDocument(
      canvasDocumentForNode(input.document, nodeId),
      null,
      node.name,
    );

    const existingBySourceNode = findComponentBySourceNodeInList(components, parent, node.id);
    if (existingBySourceNode) {
      await upsertComponentSceneIfChanged(existingBySourceNode, graphJSON);
      createdByNodeId.set(nodeId, existingBySourceNode);
      return existingBySourceNode;
    }

    const existingByPath = screenScope
      ? findComponentByPath(components, screenScope.screenId, screenScope.names)
      : null;
    if (existingByPath && !existingByPath.sourceNodeId) {
      const updated = await updateComponent(existingByPath.id, { sourceNodeId: node.id });
      const existing = updated ?? { ...existingByPath, sourceNodeId: node.id };
      components.splice(components.findIndex((r) => r.id === existingByPath.id), 1, existing);
      await upsertComponentSceneIfChanged(existing, graphJSON);
      createdByNodeId.set(nodeId, existing);
      return existing;
    }

    const created = await createOrFindComponent({
      graphJSON,
      name: node.name,
      parent,
      projectId: input.projectId!,
      sourceNodeId: node.id,
    });
    if (!created) return null;
    components.push(created);
    createdByNodeId.set(nodeId, created);
    return created;
  };

  return ensureNodeComponent(input.nodeId);
}

/**
 * Opens a nested component from a version's scene as a VERSION-OWNED copy.
 *
 * Per the ownership model, a versioned screen is a normal screen: a component created
 * or detached inside a version is owned by that version (`parent: { kind: "variant",
 * variantId: <versionVariantId> }`), independent of the master and of every other
 * version. This:
 *   1. materializes the node's subtree into a new component owned by the version,
 *      AWAITING the scene write so the new canvas never loads an empty scene;
 *   2. collapses the version node into a linked instance of the copy (derived from the
 *      live document, race-free) so the version reflects edits to the copy.
 *
 * Returns the version-owned component to open, or null when the node is not a
 * materializable component (no children, or already a linked instance).
 */
export async function materializeVersionNodeAsComponent(input: {
  versionVariantId: string;
  document: CanvasDocument;
  versionGraphJSON: string | null;
  canvasName: string;
  nodeId: string;
  projectId: string | null;
}): Promise<ComponentRow | null> {
  if (!input.projectId) return null;
  const node = input.document.elements[input.nodeId];
  // A linked instance already references a master — it is opened via "go to component"
  // (navigate to the master's canonical URL), never materialized here.
  if (!node || node.children.length === 0 || node.instanceOf) return null;

  const componentGraphJSON = htmlGraphJSONFromCanvasDocument(
    canvasDocumentForNode(input.document, input.nodeId),
    null,
    node.name,
  );

  const component = await createOrFindComponent({
    graphJSON: componentGraphJSON,
    name: node.name,
    parent: { kind: "variant", variantId: input.versionVariantId },
    projectId: input.projectId,
    sourceNodeId: node.id,
  });
  if (!component) return null;

  // Ensure the copy's scene is durably written BEFORE the caller navigates to it —
  // createOrFindComponent only fire-and-forgets it, which raced the canvas load and
  // left the opened component blank.
  await upsertScene(
    { ownerType: "variant", ownerId: component.activeVariantId, graphJSON: componentGraphJSON },
    { propagate: false },
  );

  // Collapse the version node into a linked instance of the copy. Derive the version
  // scene from the live document (race-free) and linkify the node by its id.
  const versionGraphJSON = htmlGraphJSONFromCanvasDocument(
    input.document,
    input.versionGraphJSON,
    input.canvasName,
  );
  const linked = linkifyChildComponentsInGraph(versionGraphJSON, [
    {
      id: component.id,
      activeVariantId: component.activeVariantId,
      sourceNodeId: node.id,
      name: component.name,
    },
  ]);
  if (linked && linked !== versionGraphJSON) {
    await upsertScene(
      { ownerType: "variant", ownerId: input.versionVariantId, graphJSON: linked },
      { propagate: false },
    );
    // The copy is now referenced as a linked instance inside the version —
    // expose it to the canvas "Add components" picker.
    await markComponentsLinkable([component.id]);
  }

  return component;
}

export async function materializeComponentsFromCanvasDocument(input: {
  currentComponent: ComponentRow | null;
  document: CanvasDocument;
  projectComponents: ComponentRow[];
  projectId: string | null;
  screen: ScreenRow | null;
  rootOwner?: { kind: "screen"; screenId: string } | { kind: "variant"; variantId: string };
}): Promise<void> {
  const nodeIds = componentNodeIdsFromDocument(input.document);
  for (const nodeId of nodeIds) {
    await materializeComponentFromCanvasNode({ ...input, nodeId });
  }
}

/**
 * Materializes a VERSION scene's owned content into version-owned components — the
 * symmetric counterpart of the "Current" window's `materializeComponentsFromCanvasDocument`.
 *
 * The version save path historically skipped materialization on the (now wrong) assumption
 * that a version's children are always read-only linked instances. The moment you detach
 * (unlink) an instance or draw a new element inside a version, that content is **owned** by
 * the version and — per the "components form automatically" law — must become a real
 * component owned by the version's variant. Without a backing row it is invisible to the
 * subcomponents list and is lost when the version is promoted to main.
 *
 * Linked-instance nodes are skipped (they reference a master, they are not one), so a
 * freshly created, unedited linked version still materializes nothing.
 */
export async function materializeVersionScene(input: {
  versionVariantId: string;
  document: CanvasDocument;
  projectId: string | null;
}): Promise<void> {
  if (!input.projectId) return;
  const projectComponents = await listComponentsByProject(input.projectId);
  await materializeComponentsFromCanvasDocument({
    currentComponent: null,
    document: input.document,
    projectComponents,
    projectId: input.projectId,
    screen: null,
    rootOwner: { kind: "variant", variantId: input.versionVariantId },
  });
}
