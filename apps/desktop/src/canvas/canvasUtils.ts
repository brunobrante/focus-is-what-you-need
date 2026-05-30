import { canvasDocumentFromHtmlGraphJSON } from "@/canvas/engine/htmlSceneAdapter";
import { createBlankDocument } from "@/canvas/engine/actions";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ComponentRow, SceneOwnerType, ScreenRow } from "@/lib/storage/schema";
import type { MockComponentSeed } from "@/components/mocks/data/canvasMocks";
import type { ProjectTreeNode } from "@/canvas/shell/Tree";
import type { ProjectType } from "@/lib/data/types";

export type SplitMode = "none" | "vertical" | "horizontal";

export const LAYOUT_LABELS: Record<SplitMode, string> = {
  none: "Single canvas",
  vertical: "Split vertical",
  horizontal: "Split horizontal",
};

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeProjectType(value: string | null): ProjectType {
  if (value === "desktop" || value === "tablet" || value === "mobile") return value;
  return "mobile";
}

export function canvasSizeForProjectType(projectType: ProjectType): { width: number; height: number } {
  if (projectType === "desktop") return { width: 1440, height: 900 };
  if (projectType === "tablet") return { width: 820, height: 1180 };
  return { width: 390, height: 844 };
}

export function sameCanvasSize(
  a: { width: number; height: number },
  b: { width: number; height: number },
): boolean {
  return Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height);
}

export function isFactoryMockGraphJSON(graphJSON: string | null): boolean {
  if (!graphJSON) return false;
  const doc = canvasDocumentFromHtmlGraphJSON(graphJSON);
  if (!doc) return false;
  const rootNames = doc.rootIds
    .map((id) => doc.elements[id]?.name ?? "")
    .map(normalizeName);
  const mockRootNames = new Set([
    "header", "hero banner", "category strip", "featured list",
    "mobile app cart", "search bar", "filter chips", "product results",
    "product gallery", "product summary", "options list",
    "shipping form", "payment methods", "red alignment box",
  ]);
  return rootNames.some((name) => mockRootNames.has(name));
}

export function shouldUseMockGraph(input: {
  persistedGraphJSON: string | null;
  mockGraphJSON: string;
  projectType: ProjectType;
  targetKind: SceneOwnerType;
}): boolean {
  const mockDoc = canvasDocumentFromHtmlGraphJSON(input.mockGraphJSON);
  if (!mockDoc) return false;

  const persistedDoc = canvasDocumentFromHtmlGraphJSON(input.persistedGraphJSON);
  if (!persistedDoc) return true;
  if (persistedDoc.rootIds.length === 0) return true;
  if (input.targetKind !== "variant") return false;

  const deviceSize = canvasSizeForProjectType(input.projectType);
  const persistedIsDeviceSized = sameCanvasSize(persistedDoc.canvas, deviceSize);
  const mockIsDeviceSized = sameCanvasSize(mockDoc.canvas, deviceSize);
  if (persistedIsDeviceSized && !mockIsDeviceSized) return true;

  const persistedRoot = persistedDoc.rootIds[0] ? persistedDoc.elements[persistedDoc.rootIds[0]] : null;
  const mockRoot = mockDoc.rootIds[0] ? mockDoc.elements[mockDoc.rootIds[0]] : null;
  return Boolean(
    persistedRoot &&
      mockRoot &&
      persistedIsDeviceSized &&
      normalizeName(persistedRoot.name) !== normalizeName(mockRoot.name),
  );
}

export function createBlankDocumentForProjectType(projectType: ProjectType): CanvasDocument {
  const size = canvasSizeForProjectType(projectType);
  const doc = createBlankDocument(size.width, size.height);
  return {
    ...doc,
    canvas: {
      ...doc.canvas,
      background: "#F7F7F2",
      borderRadius: projectType === "desktop" ? 0 : 32,
    },
  };
}

export function componentPathFromRoot(
  component: ComponentRow,
  components: ComponentRow[],
): { screenId: string | null; names: string[] } | null {
  const byParentVariantId = new Map<string, ComponentRow>();
  for (const row of components) {
    byParentVariantId.set(row.activeVariantId, row);
  }

  const names: string[] = [];
  let current: ComponentRow | undefined = component;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    names.unshift(current.name);
    if (current.screenId) return { screenId: current.screenId, names };
    if (!current.parentVariantId) return { screenId: null, names };
    current = byParentVariantId.get(current.parentVariantId);
  }

  return null;
}

export function componentNamePathFromDocument(document: CanvasDocument, nodeId: string): string[] {
  const path: string[] = [];
  let current = document.elements[nodeId];
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) return [];
    visited.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? document.elements[current.parentId] : undefined;
  }

  return path;
}

export function findComponentByPath(
  components: ComponentRow[],
  screenId: string,
  names: string[],
): ComponentRow | null {
  let siblings = components
    .filter((c) => c.screenId === screenId && c.parentVariantId === null)
    .sort((a, b) => a.order - b.order);
  let current: ComponentRow | null = null;

  for (const name of names) {
    current = siblings.find((c) => normalizeName(c.name) === normalizeName(name)) ?? null;
    if (!current) return null;
    siblings = components
      .filter((c) => c.parentVariantId === current!.activeVariantId)
      .sort((a, b) => a.order - b.order);
  }

  return current;
}

export function findComponentBySourceNodeInList(
  components: ComponentRow[],
  parent: { kind: "screen"; screenId: string } | { kind: "variant"; variantId: string },
  sourceNodeId: string | null | undefined,
): ComponentRow | null {
  if (!sourceNodeId) return null;
  return (
    components.find((c) => {
      if (c.sourceNodeId !== sourceNodeId) return false;
      if (parent.kind === "screen") return c.screenId === parent.screenId && c.parentVariantId === null;
      return c.parentVariantId === parent.variantId;
    }) ?? null
  );
}

export function findComponentByCanvasNode(input: {
  currentComponent: ComponentRow | null;
  document: CanvasDocument;
  nodeId: string;
  projectComponents: ComponentRow[];
  screen: ScreenRow | null;
}): ComponentRow | null {
  const node = input.document.elements[input.nodeId];
  if (!node?.children.length) return null;

  const parentNode = node.parentId ? input.document.elements[node.parentId] : null;
  const parentComponent = parentNode?.children.length
    ? findComponentByCanvasNode({ ...input, nodeId: parentNode.id })
    : input.currentComponent;
  const parent =
    parentComponent
      ? { kind: "variant" as const, variantId: parentComponent.activeVariantId }
      : input.screen?.id
        ? { kind: "screen" as const, screenId: input.screen.id }
        : null;
  if (!parent) return null;

  return findComponentBySourceNodeInList(input.projectComponents, parent, node.id);
}

export function fullComponentPathForCanvasNode(input: {
  currentComponent: ComponentRow | null;
  document: CanvasDocument;
  nodeId: string;
  projectComponents: ComponentRow[];
  screen: ScreenRow | null;
}): { screenId: string | null; names: string[] } | null {
  const nodePath = componentNamePathFromDocument(input.document, input.nodeId);
  if (nodePath.length === 0) return null;

  if (!input.currentComponent) {
    return { screenId: input.screen?.id ?? null, names: nodePath };
  }

  const currentPath = componentPathFromRoot(input.currentComponent, input.projectComponents);
  if (!currentPath) return null;
  return { screenId: currentPath.screenId, names: [...currentPath.names, ...nodePath] };
}

export function componentNodeIdsFromDocument(document: CanvasDocument): string[] {
  const ids: string[] = [];
  const walk = (nodeId: string) => {
    const node = document.elements[nodeId];
    if (!node) return;
    if (node.children.length > 0) ids.push(nodeId);
    for (const childId of node.children) walk(childId);
  };
  for (const rootId of document.rootIds) walk(rootId);
  return ids;
}

export function componentStructureKey(document: CanvasDocument): string {
  const parts: string[] = [];
  const walk = (nodeId: string) => {
    const node = document.elements[nodeId];
    if (!node) return;
    if (node.children.length > 0) {
      parts.push([node.id, node.name, node.children.join(",")].join(":"));
    }
    for (const childId of node.children) walk(childId);
  };
  for (const rootId of document.rootIds) walk(rootId);
  return parts.join("|");
}

export function canvasDocumentForNode(document: CanvasDocument, nodeId: string): CanvasDocument {
  const source = document.elements[nodeId];
  const elements: CanvasDocument["elements"] = {};

  const copyElement = (id: string, parentId: string | null) => {
    const node = document.elements[id];
    if (!node) return;
    elements[id] = { ...node, parentId, children: [...node.children], styles: { ...node.styles } };
    for (const childId of node.children) copyElement(childId, id);
  };

  for (const childId of source.children) copyElement(childId, null);

  return {
    canvas: {
      width: source.width,
      height: source.height,
      background: source.styles.background ?? "",
      rotation: source.rotation,
      borderRadius: source.styles.borderRadius,
      borderWidth: source.styles.borderWidth,
      borderColor: source.styles.borderColor,
      opacity: source.styles.opacity,
      padding: source.styles.padding,
    },
    shellBackground: document.shellBackground,
    shellPattern: document.shellPattern,
    rootIds: [...source.children],
    elements,
  };
}

export function findMockComponentByPath(nodes: MockComponentSeed[], names: string[]): MockComponentSeed | null {
  let candidates = nodes;
  let current: MockComponentSeed | null = null;
  for (const name of names) {
    current = candidates.find((n) => normalizeName(n.name) === normalizeName(name)) ?? null;
    if (!current) return null;
    candidates = current.children;
  }
  return current;
}

export function mockTargetKey(input: {
  canUseFactoryMocks: boolean;
  component: ComponentRow | null;
  projectType: ProjectType;
  screen: ScreenRow | null;
  projectComponents: ComponentRow[];
  projectScreens: ScreenRow[];
}): string {
  if (!input.canUseFactoryMocks) {
    if (input.component) return ["local-component", input.projectType, input.component.id].join(":");
    if (input.screen) return ["local-screen", input.projectType, input.screen.id].join(":");
    return "none";
  }
  if (input.component) {
    const path = componentPathFromRoot(input.component, input.projectComponents);
    return [
      "component", input.projectType, input.component.id,
      path?.screenId ?? "orphan",
      path?.names.join("/") ?? input.component.name,
      input.projectScreens.length,
      input.projectComponents.length,
    ].join(":");
  }
  if (input.screen) {
    return ["screen", input.projectType, input.screen.id, input.screen.title].join(":");
  }
  return "none";
}

export function findTreeNodeById(nodes: ProjectTreeNode[], id: string): ProjectTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findTreeNodeById(node.children ?? [], id);
    if (found) return found;
  }
  return null;
}

export function buildProjectTree(screens: ScreenRow[], components: ComponentRow[]): ProjectTreeNode[] {
  const childrenByScreenId = new Map<string, ComponentRow[]>();
  const childrenByParentVariantId = new Map<string, ComponentRow[]>();

  for (const component of components) {
    if (component.parentVariantId) {
      const siblings = childrenByParentVariantId.get(component.parentVariantId) ?? [];
      siblings.push(component);
      childrenByParentVariantId.set(component.parentVariantId, siblings);
    } else if (component.screenId) {
      const siblings = childrenByScreenId.get(component.screenId) ?? [];
      siblings.push(component);
      childrenByScreenId.set(component.screenId, siblings);
    }
  }

  const buildComponentNode = (component: ComponentRow): ProjectTreeNode => {
    const children = (childrenByParentVariantId.get(component.activeVariantId) ?? [])
      .sort((a, b) => a.order - b.order)
      .map(buildComponentNode);
    return { id: component.id, name: component.name, kind: "component", children };
  };

  return [...screens]
    .sort((a, b) => a.order - b.order)
    .map((screen) => ({
      id: screen.id,
      name: screen.title,
      kind: "screen" as const,
      children: (childrenByScreenId.get(screen.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map(buildComponentNode),
    }));
}
