import { canvasDocumentFromHtmlGraphJSON, getNodeAbsoluteBoundsInGraph } from "@/canvas/engine/htmlSceneAdapter";
import { htmlCanvasDocumentFromJSON } from "@/lib/canvas/htmlScene/document";
import { subjectNodeForDocument } from "@/lib/canvas/htmlScene";
import { createBlankDocument } from "@/canvas/engine/actions";
import { getSceneByOwner, mainVariantIdForScreen } from "@/lib/storage/repos/scenes.repo";
import { listVariants } from "@/lib/storage/repos/variants.repo";
import {
  buildVariantLookup,
  parentVariantIdOf,
  screenIdOfComponent,
} from "@/application/graph/componentOwnership";
import type { AncestorOverlayItem, AncestorOverlayState, CanvasDocument } from "@/canvas/engine/types";
import { DEFAULT_ANCESTOR_OVERLAY_ITEM } from "@/canvas/engine/types";
import type { ComponentRow, ScreenRow } from "@/lib/storage/schema";
import type { MockComponentSeed } from "@/components/mocks/data/canvasMocks";
import type { ProjectTreeNode } from "@/canvas/shell/Tree";
import type { ProjectType } from "@/lib/data/types";
import { DEFAULT_DEVICE_ID } from "@/canvas/devices";

export type SplitMode = "none" | "vertical" | "horizontal" | "grid";
export type CanvasWindowType = "current" | "sketch" | "references" | "versions" | "preview";
// Preview is no longer a togglable feature window — it is a special view-only
// window launched from the button above the Inspector, so it is excluded here.
export type CanvasFeatureWindowType = Exclude<CanvasWindowType, "current" | "preview">;
export type CanvasFeatureFlags = Record<CanvasFeatureWindowType, boolean>;

// A window is identified by a string KEY, not just its type. Feature windows use
// their type as the key ("sketch", "versions", …). The "current" window can have
// multiple instances: the primary is "current"; extras are "current-2", "current-3"…
// Keys stay unique strings, so the dedup logic below (which used to mean "each type
// once") now means "each key once" with no other change.
export type CanvasWindowKey = string;
export type CanvasSplitWindows = CanvasWindowKey[];

/** Settings for the view-only Preview window (transient UI state, not persisted). */
export type PreviewSettings = {
  fit: "fit" | "actual";
  deviceFrame: boolean;
  /** Selected device-mockup preset id (see canvas/devices). */
  deviceId: string;
  background: "dark" | "light" | "scene";
};

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  fit: "fit",
  deviceFrame: false,
  deviceId: DEFAULT_DEVICE_ID,
  background: "dark",
};

export const MAX_CANVAS_SPLIT_PANES = 4;
// A Current can only exist inside a split pane, so the cap equals the pane cap.
export const MAX_CURRENT_WINDOWS = MAX_CANVAS_SPLIT_PANES;

export const CANVAS_WINDOW_ORDER: readonly CanvasWindowType[] = [
  "current",
  "versions",
  "sketch",
  "references",
  "preview",
];

export const CANVAS_FEATURE_WINDOW_ORDER: readonly CanvasFeatureWindowType[] = [
  "versions",
  "sketch",
  "references",
];

export const CANVAS_WINDOW_LABELS: Record<CanvasWindowType, string> = {
  current: "Current",
  sketch: "Sketch",
  references: "References",
  versions: "Versions",
  preview: "Preview",
};

export const DEFAULT_CANVAS_FEATURES: CanvasFeatureFlags = {
  sketch: true,
  references: false,
  versions: false,
};

// ── Window key helpers ──────────────────────────────────────────────────────────
// Extra Current instances are keyed "current-2", "current-3", … The primary is
// the bare "current". These helpers project a key back to its window TYPE (for
// rendering/labels) and generate/identify Current instance keys.

const CURRENT_INSTANCE_KEY_RE = /^current-(\d+)$/;

export function isCurrentKey(key: CanvasWindowKey): boolean {
  return key === "current" || CURRENT_INSTANCE_KEY_RE.test(key);
}

export function windowTypeOfKey(key: CanvasWindowKey): CanvasWindowType {
  return isCurrentKey(key) ? "current" : (key as CanvasWindowType);
}

/** Narrows a window type to the editable feature windows (not current/preview). */
export function isFeatureWindowType(type: CanvasWindowType): type is CanvasFeatureWindowType {
  return type !== "current" && type !== "preview";
}

/** 0 for the primary "current"; N-1 for "current-N" (so "current-2" → index 1). */
export function currentInstanceIndex(key: CanvasWindowKey): number {
  if (key === "current") return 0;
  const match = CURRENT_INSTANCE_KEY_RE.exec(key);
  return match ? Number(match[1]) - 1 : 0;
}

export function currentInstanceLabel(index: number): string {
  return index === 0 ? "Current" : `Current +${index}`;
}

/** The single label entry point for any window key (handles Current instances). */
export function windowKeyLabel(key: CanvasWindowKey): string {
  if (isCurrentKey(key)) return currentInstanceLabel(currentInstanceIndex(key));
  return CANVAS_WINDOW_LABELS[windowTypeOfKey(key)];
}

/** Smallest unused "current-N" (N in 2..MAX), or null when the cap is reached. */
export function nextCurrentKey(existingKeys: readonly CanvasWindowKey[]): CanvasWindowKey | null {
  const taken = new Set(existingKeys);
  for (let n = 2; n <= MAX_CURRENT_WINDOWS; n += 1) {
    const key = `current-${n}`;
    if (!taken.has(key)) return key;
  }
  return null;
}

export const LAYOUT_LABELS: Record<SplitMode, string> = {
  none: "Single canvas",
  vertical: "Split vertical",
  horizontal: "Split horizontal",
  grid: "Split quadrants",
};

export function enabledCanvasWindowTypes(
  features: CanvasFeatureFlags,
  previewEnabled = false,
): CanvasWindowType[] {
  return CANVAS_WINDOW_ORDER.filter((windowType) => {
    if (windowType === "current") return true;
    if (windowType === "preview") return previewEnabled;
    return features[windowType];
  });
}

export function firstEnabledSecondaryWindow(
  enabledWindowTypes: readonly CanvasWindowType[],
): CanvasFeatureWindowType | null {
  return CANVAS_FEATURE_WINDOW_ORDER.find((windowType) => enabledWindowTypes.includes(windowType)) ?? null;
}

export function normalizeCanvasSplitWindows(
  windows: readonly CanvasWindowKey[],
  enabledWindowTypes: readonly CanvasWindowType[],
): CanvasSplitWindows {
  const normalized: CanvasSplitWindows = [];

  for (const windowKey of windows) {
    if (
      enabledWindowTypes.includes(windowTypeOfKey(windowKey)) &&
      !normalized.includes(windowKey)
    ) {
      normalized.push(windowKey);
    }
  }

  if (enabledWindowTypes.includes("current") && !normalized.some(isCurrentKey)) {
    normalized.unshift("current");
  }

  if (normalized.length < 2) {
    const fallback = firstEnabledSecondaryWindow(enabledWindowTypes);
    if (fallback && !normalized.includes(fallback)) normalized.push(fallback);
  }

  return normalized.slice(0, MAX_CANVAS_SPLIT_PANES);
}

export function addCanvasWindowToSplit(
  windows: readonly CanvasWindowKey[],
  enabledWindowTypes: readonly CanvasWindowType[],
  windowKey: CanvasWindowKey,
): CanvasSplitWindows {
  const normalized = normalizeCanvasSplitWindows(windows, enabledWindowTypes);
  if (!enabledWindowTypes.includes(windowTypeOfKey(windowKey)) || normalized.includes(windowKey)) {
    return normalized;
  }
  if (normalized.length < MAX_CANVAS_SPLIT_PANES) return [...normalized, windowKey];
  return [...normalized.slice(0, MAX_CANVAS_SPLIT_PANES - 1), windowKey];
}

/**
 * Appends a NEW Current instance ("current-2"…) to the split, returning the next
 * windows array and the key created (or null when the cap is reached). Unlike
 * addCanvasWindowToSplit, this never refuses just because "current" is present.
 */
export function addCurrentToSplit(
  windows: readonly CanvasWindowKey[],
  enabledWindowTypes: readonly CanvasWindowType[],
): { windows: CanvasSplitWindows; key: CanvasWindowKey | null } {
  const normalized = normalizeCanvasSplitWindows(windows, enabledWindowTypes);
  if (normalized.length >= MAX_CANVAS_SPLIT_PANES) return { windows: normalized, key: null };
  const key = nextCurrentKey(normalized);
  if (!key) return { windows: normalized, key: null };
  return { windows: [...normalized, key], key };
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

const MOCK_ROOT_NAMES = new Set([
  "header", "hero banner", "category strip", "featured list",
  "mobile app cart", "search bar", "filter chips", "product results",
  "product gallery", "product summary", "options list",
  "shipping form", "payment methods", "red alignment box",
]);

/**
 * ENG-6: the document variants below operate on an ALREADY-PARSED `CanvasDocument`,
 * so the render path can parse the persisted graph once and reuse it for both the
 * factory-mock check and the mock-vs-persisted decision (instead of re-parsing the
 * same `graphJSON` string in each). The string overloads are kept for any caller
 * that only holds the JSON.
 */
export function isFactoryMockDocument(doc: CanvasDocument | null): boolean {
  if (!doc) return false;
  const rootNames = doc.rootIds
    .map((id) => doc.elements[id]?.name ?? "")
    .map(normalizeName);
  return rootNames.some((name) => MOCK_ROOT_NAMES.has(name));
}

export function isFactoryMockGraphJSON(graphJSON: string | null): boolean {
  if (!graphJSON) return false;
  return isFactoryMockDocument(canvasDocumentFromHtmlGraphJSON(graphJSON));
}

export function shouldUseMockGraph(input: {
  persistedDoc: CanvasDocument | null;
  mockDoc: CanvasDocument | null;
  projectType: ProjectType;
  // Whether the opened subject is a whole screen or a single component.
  targetKind: "screen" | "component";
}): boolean {
  const { persistedDoc, mockDoc } = input;
  if (!mockDoc) return false;

  if (!persistedDoc) return true;
  if (persistedDoc.rootIds.length === 0) return true;
  if (input.targetKind !== "component") return false;

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

/**
 * Resolves a component up to its owning screen, building the name path on the way.
 *
 * Ownership is one of: `screenId` (created in a screen's main), `parentVariantId` of a
 * parent **component** (nested), or `parentVariantId` of a **screen** variant — its main
 * OR one of its versions (created/detached inside that screen, version included). A
 * version is a normal screen, so a component owned by a screen's version variant
 * resolves to that screen. The optional `variants` list is what lets us recognize a
 * screen-owned variant; without it, only the screen-main and nested-component cases
 * resolve (back-compat for callers that don't have the variant table).
 */
export function componentPathFromRoot(
  component: ComponentRow,
  components: ComponentRow[],
  variants?: ReadonlyArray<{ id: string; ownerKind: string; ownerId: string }>,
): { screenId: string | null; names: string[] } | null {
  const byParentVariantId = new Map<string, ComponentRow>();
  for (const row of components) {
    byParentVariantId.set(row.activeVariantId, row);
  }
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const names: string[] = [];
  let current: ComponentRow | undefined = component;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    names.unshift(current.name);
    // Owner resolved off graph edges (flip 1); `?? field` keeps cold-index safety
    // while the screenId/parentVariantId fields are still written as a mirror.
    const screenId = screenIdOfComponent(current.id);
    if (screenId) return { screenId, names };
    const parentVariantId = parentVariantIdOf(current.id);
    if (!parentVariantId) return { screenId: null, names };
    const parentComponent = byParentVariantId.get(parentVariantId);
    if (parentComponent) {
      current = parentComponent;
      continue;
    }
    // The parent variant is not a component's — it belongs to a screen (its main or a
    // version). A component owned by a screen variant resolves to that screen.
    const ownerVariant = variantById.get(parentVariantId);
    if (ownerVariant?.ownerKind === "screen") {
      return { screenId: ownerVariant.ownerId, names };
    }
    return { screenId: null, names };
  }

  return null;
}

/**
 * One ancestor frame of the component being edited, resolved for the parent-
 * frames overlay. `offsetX/offsetY` are the frame's top-left relative to the
 * edited component's own top-left (negative, since ancestors enclose it), so the
 * frame can be drawn directly in the component's canvas space.
 */
export type AncestorFrame = {
  id: string; // the ancestor scene's owner variant id — stable key for per-frame config
  name: string;
  kind: "component" | "screen";
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  background: string; // "" when the frame is transparent
  borderRadius: number;
};

/**
 * Resolves every ancestor frame of `component` — its parent component, that
 * parent's parent, … up to the screen — each sized to its own frame and offset
 * to where the edited component actually sits inside it. Walks the component
 * ancestry — summing each level's position within its own parent scene — and
 * emits one entry per level up to the screen. Stops (returning what it has) when
 * a scene/sourceNode can't be resolved, since this only drives a visual guide.
 */
export async function computeComponentAncestorFrames(
  component: ComponentRow,
  components: ComponentRow[],
  screens: ScreenRow[],
): Promise<AncestorFrame[]> {
  const byActiveVariantId = new Map<string, ComponentRow>();
  for (const row of components) byActiveVariantId.set(row.activeVariantId, row);
  const screensById = new Map(screens.map((s) => [s.id, s]));

  const variants = await listVariants();
  const frames: AncestorFrame[] = [];
  let accX = 0;
  let accY = 0;
  let current: ComponentRow | undefined = component;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    if (!current.sourceNodeId) break;

    const parentVariantId = parentVariantIdOf(current.id);
    const screenId = screenIdOfComponent(current.id);
    let ownerId: string | null = null;
    let isScreenRoot = false;
    if (parentVariantId) {
      ownerId = parentVariantId;
    } else if (screenId) {
      ownerId = mainVariantIdForScreen(variants, screenId);
      isScreenRoot = true;
    }
    if (!ownerId) break;

    const parentScene = await getSceneByOwner("variant", ownerId);
    const bounds = getNodeAbsoluteBoundsInGraph(parentScene?.graphJSON, current.sourceNodeId);
    const frameDoc = canvasDocumentFromHtmlGraphJSON(parentScene?.graphJSON);
    if (!bounds || !frameDoc) break;
    accX += bounds.x;
    accY += bounds.y;

    const name = isScreenRoot
      ? (screenId ? screensById.get(screenId)?.title ?? "Screen" : "Screen")
      : (byActiveVariantId.get(parentVariantId as string)?.name ?? "Component");

    frames.push({
      id: ownerId,
      name,
      kind: isScreenRoot ? "screen" : "component",
      width: frameDoc.canvas.width,
      height: frameDoc.canvas.height,
      offsetX: -accX,
      offsetY: -accY,
      background: frameDoc.canvas.background ?? "",
      borderRadius: frameDoc.canvas.borderRadius ?? 0,
    });

    if (isScreenRoot) break;
    current = byActiveVariantId.get(parentVariantId as string);
  }

  return frames;
}

// A faint near-white used when a parent frame is transparent, so the guide stays
// visible instead of vanishing on a transparent parent.
export const ANCESTOR_OVERLAY_FALLBACK_COLOR = "#E8E8EC";

/**
 * Strips any alpha channel from a CSS color, returning just the solid color
 * value (or "" when there is none). The parent's own opacity is intentionally
 * ignored — only the color value is inherited; the overlay opacity is user-set.
 */
export function solidColorValue(color: string): string {
  const c = (color ?? "").trim();
  if (!c || c === "transparent" || c === "none") return "";
  const hex = c.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 8) return "#" + h.slice(0, 6);
    if (h.length === 4) return "#" + h.slice(0, 3);
    return c;
  }
  const fn = c.match(/^(rgba?|hsla?)\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[2].split(/[,/]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const base = fn[1].toLowerCase().startsWith("rgb") ? "rgb" : "hsl";
      return `${base}(${parts.slice(0, 3).join(", ")})`;
    }
  }
  return c;
}

/** The per-frame config for `id`, falling back to the shared defaults. */
export function ancestorOverlayItemFor(overlay: AncestorOverlayState, id: string): AncestorOverlayItem {
  return overlay.items[id] ?? DEFAULT_ANCESTOR_OVERLAY_ITEM;
}

/** Resolved CSS for drawing one ancestor frame given its per-frame config. */
export function resolveAncestorOverlayStyle(
  frame: AncestorFrame,
  item: AncestorOverlayItem,
): { background: string; opacity: number; borderRadius: number } {
  const inherited = solidColorValue(frame.background);
  return {
    background: item.inheritColor ? inherited || ANCESTOR_OVERLAY_FALLBACK_COLOR : item.color,
    opacity: item.opacity,
    borderRadius: item.keepRadius ? frame.borderRadius : 0,
  };
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
  const variants = buildVariantLookup();
  const screenOf = (c: ComponentRow) => screenIdOfComponent(c.id, variants);
  const parentOf = (c: ComponentRow) => parentVariantIdOf(c.id, variants);
  let siblings = components
    .filter((c) => screenOf(c) === screenId && parentOf(c) === null)
    .sort((a, b) => a.order - b.order);
  let current: ComponentRow | null = null;

  for (const name of names) {
    current = siblings.find((c) => normalizeName(c.name) === normalizeName(name)) ?? null;
    if (!current) return null;
    siblings = components
      .filter((c) => parentOf(c) === current!.activeVariantId)
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
  const variants = buildVariantLookup();
  return (
    components.find((c) => {
      if (c.sourceNodeId !== sourceNodeId) return false;
      const screenId = screenIdOfComponent(c.id, variants);
      const parentVariantId = parentVariantIdOf(c.id, variants);
      if (parent.kind === "screen") return screenId === parent.screenId && parentVariantId === null;
      return parentVariantId === parent.variantId;
    }) ?? null
  );
}

/**
 * The top-level subcomponents a given variant's scene actually composes — used by the
 * screen detail "Sub Components" list so it follows the selected version. A direct child
 * of the scene frame resolves to a ComponentRow when it is either a linked instance
 * (→ its master) or owned content matching a component by `sourceNodeId` (version-owned,
 * or — for the main variant — a screen-level child). Decoration nodes resolve to nothing
 * and are skipped. Deduped by component id, preserving scene order.
 *
 * `linkedIds` carries the component ids that appear as **linked instances** in this scene
 * (the node had `instanceOf`), so the cards can render the read-only purple/linked
 * treatment for exactly those subcomponents.
 */
export function subcomponentsForVariantScene(input: {
  graphJSON: string | null;
  variantId: string;
  screenId: string | null;
  projectComponents: ComponentRow[];
}): { components: ComponentRow[]; linkedIds: Set<string> } {
  const doc = input.graphJSON ? htmlCanvasDocumentFromJSON(input.graphJSON) : null;
  if (!doc) return { components: [], linkedIds: new Set() };
  // Top-level subcomponents are the direct children of the SUBJECT frame, not the root —
  // scenes wrap the subject in a "<name> Canvas" root, so the components sit one level
  // below it. Filtering on the root id would only ever match the subject itself.
  const subject = subjectNodeForDocument(doc);
  const parentId = subject?.id ?? doc.rootId;
  const byId = new Map(input.projectComponents.map((c) => [c.id, c] as const));
  // Index owned components by sourceNodeId once, so resolving each node is O(1)
  // instead of a full components.find per node — O(nodes × components) → O(nodes)
  // (ENG-7). The candidate list per node is tiny (sourceNodeId is near-unique).
  const bySourceNode = new Map<string, ComponentRow[]>();
  for (const c of input.projectComponents) {
    if (!c.sourceNodeId) continue;
    const arr = bySourceNode.get(c.sourceNodeId);
    if (arr) arr.push(c);
    else bySourceNode.set(c.sourceNodeId, [c]);
  }
  // Resolve an owned (non-linked) node, preserving the original precedence:
  // version-owned (this variant) wins over the main variant's screen-owned child.
  const variants = buildVariantLookup();
  const screenOf = (c: ComponentRow) => screenIdOfComponent(c.id, variants);
  const parentOf = (c: ComponentRow) => parentVariantIdOf(c.id, variants);
  const resolveOwned = (nodeId: string): ComponentRow | null => {
    const candidates = bySourceNode.get(nodeId);
    if (!candidates) return null;
    const variantMatch = candidates.find((c) => parentOf(c) === input.variantId);
    if (variantMatch) return variantMatch;
    if (input.screenId != null) {
      const screenMatch = candidates.find(
        (c) => screenOf(c) === input.screenId && parentOf(c) === null,
      );
      if (screenMatch) return screenMatch;
    }
    return null;
  };
  const components: ComponentRow[] = [];
  const linkedIds = new Set<string>();
  const seen = new Set<string>();
  for (const node of doc.nodes) {
    if (node.parentId !== parentId) continue; // top-level subcomponents only
    const comp = node.instanceOf
      ? byId.get(node.instanceOf.componentId) ?? null
      : resolveOwned(node.id);
    if (comp && !seen.has(comp.id)) {
      seen.add(comp.id);
      components.push(comp);
      if (node.instanceOf) linkedIds.add(comp.id);
    }
  }
  return { components, linkedIds };
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
  variants?: ReadonlyArray<{ id: string; ownerKind: string; ownerId: string }>;
}): { screenId: string | null; names: string[] } | null {
  const nodePath = componentNamePathFromDocument(input.document, input.nodeId);
  if (nodePath.length === 0) return null;

  if (!input.currentComponent) {
    return { screenId: input.screen?.id ?? null, names: nodePath };
  }

  const currentPath = componentPathFromRoot(
    input.currentComponent,
    input.projectComponents,
    input.variants,
  );
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
  variants?: ReadonlyArray<{ id: string; ownerKind: string; ownerId: string }>;
}): string {
  if (!input.canUseFactoryMocks) {
    if (input.component) return ["local-component", input.projectType, input.component.id].join(":");
    if (input.screen) return ["local-screen", input.projectType, input.screen.id].join(":");
    return "none";
  }
  if (input.component) {
    const path = componentPathFromRoot(input.component, input.projectComponents, input.variants);
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
  const variants = buildVariantLookup();

  for (const component of components) {
    const parentVariantId = parentVariantIdOf(component.id, variants);
    const screenId = screenIdOfComponent(component.id, variants);
    if (parentVariantId) {
      const siblings = childrenByParentVariantId.get(parentVariantId) ?? [];
      siblings.push(component);
      childrenByParentVariantId.set(parentVariantId, siblings);
    } else if (screenId) {
      const siblings = childrenByScreenId.get(screenId) ?? [];
      siblings.push(component);
      childrenByScreenId.set(screenId, siblings);
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
