import { canvasDocumentFromHtmlGraphJSON, getNodeAbsoluteBoundsInGraph } from "@/canvas/engine/htmlSceneAdapter";
import { createBlankDocument } from "@/canvas/engine/actions";
import { getSceneByOwner } from "@/lib/storage/repos/scenes.repo";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ComponentRow, SceneOwnerType, ScreenRow } from "@/lib/storage/schema";
import type { MockComponentSeed } from "@/components/mocks/data/canvasMocks";
import type { ProjectTreeNode } from "@/canvas/shell/Tree";
import type { ProjectType } from "@/lib/data/types";

export type SplitMode = "none" | "vertical" | "horizontal" | "grid";
export type CanvasWindowType = "current" | "drafts" | "references" | "versions" | "preview";
export type CanvasFeatureWindowType = Exclude<CanvasWindowType, "current">;
export type CanvasFeatureFlags = Record<CanvasFeatureWindowType, boolean>;
export type CanvasSplitWindows = CanvasWindowType[];

export const MAX_CANVAS_SPLIT_PANES = 4;

export const CANVAS_WINDOW_ORDER: readonly CanvasWindowType[] = [
  "current",
  "versions",
  "drafts",
  "references",
  "preview",
];

export const CANVAS_FEATURE_WINDOW_ORDER: readonly CanvasFeatureWindowType[] = [
  "versions",
  "drafts",
  "references",
  "preview",
];

export const CANVAS_WINDOW_LABELS: Record<CanvasWindowType, string> = {
  current: "Current",
  drafts: "Drafts",
  references: "References",
  versions: "Versions",
  preview: "Preview",
};

export const DEFAULT_CANVAS_FEATURES: CanvasFeatureFlags = {
  drafts: true,
  references: false,
  versions: false,
  preview: false,
};

export const LAYOUT_LABELS: Record<SplitMode, string> = {
  none: "Single canvas",
  vertical: "Split vertical",
  horizontal: "Split horizontal",
  grid: "Split quadrants",
};

export function enabledCanvasWindowTypes(features: CanvasFeatureFlags): CanvasWindowType[] {
  return CANVAS_WINDOW_ORDER.filter((windowType) => (
    windowType === "current" || features[windowType]
  ));
}

export function firstEnabledSecondaryWindow(
  enabledWindowTypes: readonly CanvasWindowType[],
): CanvasFeatureWindowType | null {
  return CANVAS_FEATURE_WINDOW_ORDER.find((windowType) => enabledWindowTypes.includes(windowType)) ?? null;
}

export function normalizeCanvasSplitWindows(
  windows: readonly CanvasWindowType[],
  enabledWindowTypes: readonly CanvasWindowType[],
): CanvasSplitWindows {
  const normalized: CanvasSplitWindows = [];

  for (const windowType of windows) {
    if (
      enabledWindowTypes.includes(windowType) &&
      !normalized.includes(windowType)
    ) {
      normalized.push(windowType);
    }
  }

  if (enabledWindowTypes.includes("current") && !normalized.includes("current")) {
    normalized.unshift("current");
  }

  if (normalized.length < 2) {
    const fallback = firstEnabledSecondaryWindow(enabledWindowTypes);
    if (fallback && !normalized.includes(fallback)) normalized.push(fallback);
  }

  return normalized.slice(0, MAX_CANVAS_SPLIT_PANES);
}

export function addCanvasWindowToSplit(
  windows: readonly CanvasWindowType[],
  enabledWindowTypes: readonly CanvasWindowType[],
  windowType: CanvasWindowType,
): CanvasSplitWindows {
  const normalized = normalizeCanvasSplitWindows(windows, enabledWindowTypes);
  if (!enabledWindowTypes.includes(windowType) || normalized.includes(windowType)) return normalized;
  if (normalized.length < MAX_CANVAS_SPLIT_PANES) return [...normalized, windowType];
  return [...normalized.slice(0, MAX_CANVAS_SPLIT_PANES - 1), windowType];
}

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

/**
 * Returns a component's ABSOLUTE position on its root device (screen), walking
 * the full component ancestry. Reading a single parent scene only yields the
 * position relative to the immediate parent's frame; for a component nested
 * several levels deep that is wrong. This sums each ancestor's position within
 * its own parent scene until it reaches the screen, which is the device origin.
 *
 * Returns null if the chain cannot be fully resolved (missing scene, missing
 * sourceNodeId, missing parent component, or a cycle), so callers can fall back.
 */
export async function computeComponentDeviceOrigin(
  component: ComponentRow,
  components: ComponentRow[],
): Promise<{ x: number; y: number } | null> {
  const byActiveVariantId = new Map<string, ComponentRow>();
  for (const row of components) {
    byActiveVariantId.set(row.activeVariantId, row);
  }

  let x = 0;
  let y = 0;
  let current: ComponentRow | undefined = component;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    if (!current.sourceNodeId) return null;

    const owner: { ownerType: SceneOwnerType; ownerId: string } | null =
      current.parentVariantId
        ? { ownerType: "variant", ownerId: current.parentVariantId }
        : current.screenId
          ? { ownerType: "screen", ownerId: current.screenId }
          : null;
    if (!owner) return null;

    const parentScene = await getSceneByOwner(owner.ownerType, owner.ownerId);
    const bounds = getNodeAbsoluteBoundsInGraph(parentScene?.graphJSON, current.sourceNodeId);
    if (!bounds) return null;
    x += bounds.x;
    y += bounds.y;

    // Reached a screen: that's the device, so the accumulated offset is absolute.
    if (owner.ownerType === "screen") return { x, y };

    // Otherwise climb to the component that owns the parent variant and repeat.
    current = byActiveVariantId.get(current.parentVariantId as string);
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
    // A linked instance is a reference, not a materializable component — its inlined
    // master content (the resolved children) must not be turned into components, and
    // it must not be re-saved (that would trigger propagation stripping instanceOf).
    if (node.instanceOf) return;
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
