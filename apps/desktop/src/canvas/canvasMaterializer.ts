import { readSceneByOwner, saveScene } from "@/application/scenes/saveScene";
import {
  createComponent,
  findComponentByName,
  findComponentBySourceNode,
  updateComponent,
} from "@/lib/storage/repos/components.repo";
import { htmlGraphJSONFromCanvasDocument } from "@/canvas/engine/htmlSceneAdapter";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ComponentRow, ScreenRow } from "@/lib/storage/schema";
import {
  canvasDocumentForNode,
  componentNodeIdsFromDocument,
  findComponentByPath,
  findComponentBySourceNodeInList,
  fullComponentPathForCanvasNode,
} from "./canvasUtils";

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

    const fullPath = fullComponentPathForCanvasNode({
      currentComponent: input.currentComponent,
      document: input.document,
      nodeId,
      projectComponents: components,
      screen: input.screen,
    });
    if (!fullPath?.screenId) return null;

    const parentComponent = node.parentId
      ? await ensureNodeComponent(node.parentId)
      : input.currentComponent;

    const parent: { kind: "screen"; screenId: string } | { kind: "variant"; variantId: string } =
      parentComponent
        ? { kind: "variant", variantId: parentComponent.activeVariantId }
        : { kind: "screen", screenId: fullPath.screenId };

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

    const existingByPath = findComponentByPath(components, fullPath.screenId, fullPath.names);
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

export async function materializeComponentsFromCanvasDocument(input: {
  currentComponent: ComponentRow | null;
  document: CanvasDocument;
  projectComponents: ComponentRow[];
  projectId: string | null;
  screen: ScreenRow | null;
}): Promise<void> {
  const nodeIds = componentNodeIdsFromDocument(input.document);
  for (const nodeId of nodeIds) {
    await materializeComponentFromCanvasNode({ ...input, nodeId });
  }
}
