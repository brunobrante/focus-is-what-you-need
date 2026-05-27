import type { CanvasDocument, CanvasProperties, ElementNode, ElementStyles, ElementType, Rect, ShellPattern, Tool } from "./types";
import {
  clamp,
  clampBorderRadiusForSize,
  clampRotatedRectToBounds,
  filterTopLevelIds,
  getAbsoluteCenter,
  getAbsoluteRect,
  getCommonParentId,
  getDescendantIds,
  getEffectiveRotation,
  getParentBounds,
  getParentSize,
  getSelectionBox,
  MIN_ELEMENT_SIZE,
  normalizeAngle,
  rotatePoint,
  roundAngle,
  roundPixel
} from "./geometry";

let fallbackId = 0;

export function createId(prefix = "el"): string {
  const randomId = globalThis.crypto?.randomUUID?.().slice(0, 8);
  if (randomId) {
    return `${prefix}-${randomId}`;
  }
  fallbackId += 1;
  return `${prefix}-${fallbackId}`;
}

export function cloneDocument(document: CanvasDocument): CanvasDocument {
  if (typeof structuredClone === "function") {
    return structuredClone(document);
  }
  return JSON.parse(JSON.stringify(document)) as CanvasDocument;
}

/**
 * Shallow-clones a document so individual element mutations don't bleed into the
 * source. Callers must replace entries in `next.elements` (and clone nested
 * arrays/objects like `children` or `styles`) before mutating them, but can
 * leave untouched elements as shared references with the source.
 *
 * Used by hot interaction paths (drag, resize, rotate) to avoid the cost of
 * `structuredClone` on every pointer move.
 */
export function shallowCloneDocument(document: CanvasDocument): CanvasDocument {
  return {
    ...document,
    canvas: { ...document.canvas },
    rootIds: [...document.rootIds],
    elements: { ...document.elements },
  };
}

/**
 * Replaces `doc.elements[id]` with a shallow copy of the source node so the
 * caller can mutate scalar fields (x, y, width, height, rotation) safely. Does
 * not clone `styles` or `children` — use `mutateElementStyles` for style edits.
 */
export function mutateElementShallow(doc: CanvasDocument, id: string): ElementNode | null {
  const source = doc.elements[id];
  if (!source) return null;
  const clone: ElementNode = { ...source };
  doc.elements[id] = clone;
  return clone;
}

/**
 * Same as `mutateElementShallow` but also clones `styles` so the caller can
 * mutate style fields (borderRadius, color, etc.) safely.
 */
export function mutateElementWithStyles(doc: CanvasDocument, id: string): ElementNode | null {
  const source = doc.elements[id];
  if (!source) return null;
  const clone: ElementNode = { ...source, styles: { ...source.styles } };
  doc.elements[id] = clone;
  return clone;
}

export const DEFAULT_SHELL_BACKGROUND = "#000000";
export const DEFAULT_SHELL_PATTERN: ShellPattern = "dots";

export function createBlankDocument(width: number, height: number): CanvasDocument {
  return {
    canvas: { width, height, background: "#f8fafc" },
    shellBackground: DEFAULT_SHELL_BACKGROUND,
    shellPattern: DEFAULT_SHELL_PATTERN,
    rootIds: [],
    elements: {}
  };
}

// Draft canvas uses a large virtual size so root-level elements
// are never clamped by constrainElement — the real bounds are DRAFT_BOUNDS.
const DRAFT_CANVAS_SIZE = 100_000;

export function createDraftDocument(_width?: number, _height?: number): CanvasDocument {
  return {
    canvas: { width: DRAFT_CANVAS_SIZE, height: DRAFT_CANVAS_SIZE, background: "" },
    shellBackground: DEFAULT_SHELL_BACKGROUND,
    shellPattern: DEFAULT_SHELL_PATTERN,
    rootIds: [],
    elements: {}
  };
}

export function updateShellBackground(document: CanvasDocument, background: string): CanvasDocument {
  const next = cloneDocument(document);
  next.shellBackground = background;
  return next;
}

export function updateShellPattern(document: CanvasDocument, pattern: ShellPattern): CanvasDocument {
  const next = cloneDocument(document);
  next.shellPattern = pattern;
  return next;
}

export function updateCanvasProperties(
  document: CanvasDocument,
  props: Partial<CanvasProperties>
): CanvasDocument {
  const next = cloneDocument(document);
  next.canvas = { ...next.canvas, ...props };
  return next;
}

export function createDefaultDocument(): CanvasDocument {
  return {
    canvas: {
      width: 960,
      height: 640,
      background: "#f8fafc"
    },
    shellBackground: DEFAULT_SHELL_BACKGROUND,
    shellPattern: DEFAULT_SHELL_PATTERN,
    rootIds: ["hero-card", "side-panel", "label-pill"],
    elements: {
      "hero-card": {
        id: "hero-card",
        type: "rect",
        parentId: null,
        children: ["hero-image", "hero-title", "hero-body", "primary-action", "action-text"],
        name: "Feature Card",
        x: 110,
        y: 96,
        width: 520,
        height: 360,
        rotation: 0,
        styles: {
          background: "#ffffff",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "#d7dee8",
          opacity: 1
        },
        visible: true
      },
      "hero-image": {
        id: "hero-image",
        type: "image",
        parentId: "hero-card",
        children: [],
        name: "Image Placeholder",
        x: 28,
        y: 28,
        width: 220,
        height: 150,
        rotation: 0,
        styles: {
          background: "#e6eef8",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#c6d3e2",
          opacity: 1
        },
        visible: true
      },
      "hero-title": {
        id: "hero-title",
        type: "text",
        parentId: "hero-card",
        children: [],
        name: "Title",
        x: 278,
        y: 42,
        width: 194,
        height: 70,
        rotation: 0,
        styles: {
          color: "#172033",
          fontSize: 30,
          fontWeight: "700",
          opacity: 1
        },
        content: "Build in real HTML",
        visible: true
      },
      "hero-body": {
        id: "hero-body",
        type: "text",
        parentId: "hero-card",
        children: [],
        name: "Body Copy",
        x: 280,
        y: 128,
        width: 190,
        height: 92,
        rotation: 0,
        styles: {
          color: "#526070",
          fontSize: 15,
          fontWeight: "500",
          opacity: 1
        },
        content: "Drag, resize, snap, edit text, and export clean HTML/CSS.",
        visible: true
      },
      "primary-action": {
        id: "primary-action",
        type: "rect",
        parentId: "hero-card",
        children: [],
        name: "Action Surface",
        x: 280,
        y: 252,
        width: 150,
        height: 44,
        rotation: 0,
        styles: {
          background: "#1f7ae0",
          borderRadius: 9,
          borderWidth: 0,
          borderColor: "#1f7ae0",
          opacity: 1
        },
        visible: true
      },
      "action-text": {
        id: "action-text",
        type: "text",
        parentId: "hero-card",
        children: [],
        name: "Action Text",
        x: 304,
        y: 264,
        width: 103,
        height: 22,
        rotation: 0,
        styles: {
          color: "#ffffff",
          fontSize: 14,
          fontWeight: "700",
          opacity: 1
        },
        content: "Start editing",
        visible: true
      },
      "side-panel": {
        id: "side-panel",
        type: "rect",
        parentId: null,
        children: [],
        name: "Accent Panel",
        x: 690,
        y: 140,
        width: 150,
        height: 260,
        rotation: 0,
        styles: {
          background: "#e7f2ec",
          borderRadius: 26,
          borderWidth: 1,
          borderColor: "#c6dfd1",
          opacity: 1
        },
        visible: true
      },
      "label-pill": {
        id: "label-pill",
        type: "text",
        parentId: null,
        children: [],
        name: "Canvas Label",
        x: 694,
        y: 422,
        width: 142,
        height: 28,
        rotation: 0,
        styles: {
          color: "#216249",
          fontSize: 14,
          fontWeight: "700",
          opacity: 1
        },
        content: "Finite canvas",
        visible: true
      }
    }
  };
}

// Reference canvas dimension the base defaults were designed for (mobile screen width).
const ELEMENT_DEFAULT_REFERENCE = 390;
const ELEMENT_DEFAULT_MIN_SCALE = 0.1;
const ELEMENT_DEFAULT_MAX_SCALE = 2.5;

function scaleDefault(
  canvasSize: { width: number; height: number } | undefined,
  base: number,
  min: number,
  max: number
): number {
  if (!canvasSize) return base;
  const dim = Math.min(canvasSize.width, canvasSize.height);
  const scale = clamp(dim / ELEMENT_DEFAULT_REFERENCE, ELEMENT_DEFAULT_MIN_SCALE, ELEMENT_DEFAULT_MAX_SCALE);
  return roundPixel(clamp(base * scale, min, max));
}

export function createElementForTool(
  tool: Exclude<Tool, "select">,
  x: number,
  y: number,
  canvasSize?: { width: number; height: number }
): ElementNode {
  const id = createId(tool);
  const base = {
    id,
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    rotation: 0,
    visible: true,
    locked: false
  };

  const sd = (b: number, min: number, max: number) => scaleDefault(canvasSize, b, min, max);

  const defaults: Record<Exclude<Tool, "select">, Omit<ElementNode, keyof typeof base>> = {
    wrapper: {
      type: "rect",
      name: "Wrapper",
      width:  sd(200, 40, 700),
      height: sd(200, 40, 600),
      styles: {
        opacity: 1
      }
    },
    ellipse: {
      type: "ellipse",
      name: "Ellipse",
      width:  sd(120, 16, 400),
      height: sd(120, 16, 400),
      styles: {
        background: "#dbeafe",
        opacity: 1
      }
    },
    rect: {
      type: "rect",
      name: "Rectangle",
      width:  sd(168, 20, 500),
      height: sd(104, 12, 350),
      styles: {
        background: "#dbeafe",
        opacity: 1
      }
    },
    text: {
      type: "text",
      name: "Text",
      width:  sd(190, 60, 500),
      height: sd(48,  18, 120),
      styles: {
        color: "#182033",
        fontSize: sd(24, 8, 72),
        fontWeight: "700",
        opacity: 1
      },
      content: "Text layer"
    },
    image: {
      type: "image",
      name: "Image Placeholder",
      width:  sd(220, 30, 500),
      height: sd(140, 20, 350),
      styles: {
        background: "#eef2f7",
        opacity: 1
      }
    }
  };

  const node = {
    ...base,
    ...defaults[tool]
  } as ElementNode;

  node.x = roundPixel(x - node.width / 2);
  node.y = roundPixel(y - node.height / 2);
  return node;
}

export function insertElement(document: CanvasDocument, node: ElementNode): CanvasDocument {
  const next = cloneDocument(document);
  const parentId = node.parentId;
  next.elements[node.id] = node;
  if (parentId) {
    next.elements[parentId].children.push(node.id);
  } else {
    next.rootIds.push(node.id);
  }
  return constrainElement(next, node.id);
}

export function wrapElements(document: CanvasDocument, ids: string[]): { document: CanvasDocument; wrapperId: string | null } {
  if (ids.length === 0) return { document, wrapperId: null };

  const box = getSelectionBox(document, ids);
  if (!box) return { document, wrapperId: null };

  const commonParentId = getCommonParentId(document, ids);

  // Convert the wrapper's absolute position to the common parent's local space
  let localX = box.x;
  let localY = box.y;
  if (commonParentId) {
    const parentAbsRect = getAbsoluteRect(document, commonParentId);
    const bw = document.elements[commonParentId]?.styles.borderWidth ?? 0;
    if (parentAbsRect) {
      localX = box.x - parentAbsRect.x - bw;
      localY = box.y - parentAbsRect.y - bw;
    }
  }

  const wrapperId = createId("wrapper");
  const wrapperNode: ElementNode = {
    id: wrapperId,
    type: "rect",
    parentId: commonParentId ?? null,
    children: [],
    name: "Wrapper",
    x: roundPixel(localX),
    y: roundPixel(localY),
    width: roundPixel(box.width),
    height: roundPixel(box.height),
    rotation: 0,
    visible: true,
    locked: false,
    styles: { opacity: 1 }
  };

  let next = cloneDocument(document);
  next.elements[wrapperId] = wrapperNode;

  // Insert wrapper at the position of the first selected element in the parent list
  const parentList = commonParentId ? next.elements[commonParentId].children : next.rootIds;
  const selectedIndices = ids.map((id) => parentList.indexOf(id)).filter((i) => i >= 0);
  const insertIdx = selectedIndices.length > 0 ? Math.min(...selectedIndices) : parentList.length;
  parentList.splice(insertIdx, 0, wrapperId);

  // Reparent selected elements into the wrapper (handles coordinate conversion)
  next = reparentElements(next, ids, wrapperId);

  return { document: next, wrapperId };
}

function clampNodeToParentBounds(document: CanvasDocument, id: string): void {
  const node = document.elements[id];
  if (!node) {
    return;
  }

  const parentBounds = getParentBounds(document, id);
  const clamped = clampRotatedRectToBounds(
    {
      x: parentBounds.x + node.x,
      y: parentBounds.y + node.y,
      width: node.width,
      height: node.height
    },
    node.rotation,
    parentBounds
  );

  node.x = roundPixel(clamped.x - parentBounds.x);
  node.y = roundPixel(clamped.y - parentBounds.y);
}

export function updateElementGeometry(document: CanvasDocument, id: string, patch: Partial<Rect>): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) {
    return document;
  }

  const parentSize = getParentSize(next, id);
  const width = Math.min(Math.max(patch.width ?? node.width, MIN_ELEMENT_SIZE), parentSize.width);
  const height = Math.min(Math.max(patch.height ?? node.height, MIN_ELEMENT_SIZE), parentSize.height);

  node.width = roundPixel(width);
  node.height = roundPixel(height);
  node.x = roundPixel(clamp(patch.x ?? node.x, 0, parentSize.width - node.width));
  node.y = roundPixel(clamp(patch.y ?? node.y, 0, parentSize.height - node.height));
  clampNodeToParentBounds(next, id);

  return next;
}

export function updateElementRotation(document: CanvasDocument, id: string, rotation: number): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) {
    return document;
  }
  node.rotation = roundAngle(normalizeAngle(rotation));
  clampNodeToParentBounds(next, id);
  return next;
}

export function updateElementStyles(
  document: CanvasDocument,
  id: string,
  styles: Partial<ElementStyles>
): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) {
    return document;
  }
  node.styles = {
    ...node.styles,
    ...styles
  };
  if (styles.borderRadius !== undefined) {
    node.styles.borderRadius = roundPixel(clampBorderRadiusForSize(styles.borderRadius, node.width, node.height));
  }
  return next;
}

export function updateElementText(document: CanvasDocument, id: string, content: string): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) {
    return document;
  }
  node.content = content;
  return next;
}

export function updateElementImageSource(document: CanvasDocument, id: string, src: string): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node || node.type !== "image") {
    return document;
  }
  node.src = src.trim() || undefined;
  return next;
}

export function renameElement(document: CanvasDocument, id: string, name: string): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) {
    return document;
  }
  node.name = name.trim() || node.name;
  return next;
}

export function setElementLocked(document: CanvasDocument, id: string, locked: boolean): CanvasDocument {
  const next = cloneDocument(document);
  if (next.elements[id]) {
    next.elements[id].locked = locked;
  }
  return next;
}

export function setElementVisible(document: CanvasDocument, id: string, visible: boolean): CanvasDocument {
  const next = cloneDocument(document);
  if (next.elements[id]) {
    next.elements[id].visible = visible;
  }
  return next;
}

export function reorderElement(
  document: CanvasDocument,
  id: string,
  direction: "forward" | "backward"
): CanvasDocument {
  const node = document.elements[id];
  if (!node) {
    return document;
  }

  const next = cloneDocument(document);
  const list = node.parentId ? next.elements[node.parentId].children : next.rootIds;
  const index = list.indexOf(id);
  if (index === -1) {
    return document;
  }

  const targetIndex = direction === "forward" ? index + 1 : index - 1;
  if (targetIndex < 0 || targetIndex >= list.length) {
    return document;
  }

  list.splice(index, 1);
  list.splice(targetIndex, 0, id);
  return next;
}

export function moveElementBefore(
  document: CanvasDocument,
  activeId: string,
  overId: string
): CanvasDocument {
  const active = document.elements[activeId];
  const over = document.elements[overId];
  if (!active || !over || active.parentId !== over.parentId || activeId === overId) {
    return document;
  }

  const next = cloneDocument(document);
  const list = active.parentId ? next.elements[active.parentId].children : next.rootIds;
  const from = list.indexOf(activeId);
  const to = list.indexOf(overId);
  if (from === -1 || to === -1) {
    return document;
  }

  list.splice(from, 1);
  list.splice(from < to ? to - 1 : to, 0, activeId);
  return next;
}

export function bringToFront(document: CanvasDocument, id: string): CanvasDocument {
  const node = document.elements[id];
  if (!node) {
    return document;
  }
  const next = cloneDocument(document);
  const list = node.parentId ? next.elements[node.parentId].children : next.rootIds;
  const index = list.indexOf(id);
  if (index === -1 || index === list.length - 1) {
    return document;
  }
  list.splice(index, 1);
  list.push(id);
  return next;
}

export function sendToBack(document: CanvasDocument, id: string): CanvasDocument {
  const node = document.elements[id];
  if (!node) {
    return document;
  }
  const next = cloneDocument(document);
  const list = node.parentId ? next.elements[node.parentId].children : next.rootIds;
  const index = list.indexOf(id);
  if (index <= 0) {
    return document;
  }
  list.splice(index, 1);
  list.unshift(id);
  return next;
}

export function deleteElements(document: CanvasDocument, ids: string[]): CanvasDocument {
  const next = cloneDocument(document);
  const topLevelIds = filterTopLevelIds(document, ids);
  const idsToDelete = new Set<string>();

  for (const id of topLevelIds) {
    if (document.elements[id]?.locked) {
      continue;
    }
    idsToDelete.add(id);
    for (const descendantId of getDescendantIds(document, id)) {
      idsToDelete.add(descendantId);
    }
  }

  for (const id of idsToDelete) {
    const node = next.elements[id];
    if (!node) {
      continue;
    }
    const list = node.parentId ? next.elements[node.parentId]?.children : next.rootIds;
    if (list) {
      const index = list.indexOf(id);
      if (index >= 0) {
        list.splice(index, 1);
      }
    }
  }

  for (const id of idsToDelete) {
    delete next.elements[id];
  }

  return next;
}

export function duplicateElements(document: CanvasDocument, ids: string[]): { document: CanvasDocument; selectedIds: string[] } {
  const next = cloneDocument(document);
  const topLevelIds = filterTopLevelIds(document, ids).filter((id) => !document.elements[id]?.locked);
  const selectedIds: string[] = [];

  const cloneTree = (sourceId: string, parentId: string | null, isTopLevel: boolean): string => {
    const source = document.elements[sourceId];
    const newId = createId(source.type);
    const clone: ElementNode = {
      ...cloneDocument({ canvas: document.canvas, rootIds: [], elements: { [sourceId]: source } }).elements[sourceId],
      id: newId,
      parentId,
      children: [],
      name: isTopLevel ? `${source.name} copy` : source.name,
      x: source.x + (isTopLevel ? 24 : 0),
      y: source.y + (isTopLevel ? 24 : 0)
    };

    next.elements[newId] = clone;
    for (const childId of source.children) {
      const clonedChildId = cloneTree(childId, newId, false);
      clone.children.push(clonedChildId);
    }

    return newId;
  };

  for (const sourceId of topLevelIds) {
    const source = document.elements[sourceId];
    const newId = cloneTree(sourceId, source.parentId, true);
    selectedIds.push(newId);

    const list = source.parentId ? next.elements[source.parentId].children : next.rootIds;
    const sourceIndex = list.indexOf(sourceId);
    const insertIndex = sourceIndex >= 0 ? sourceIndex + 1 : list.length;
    list.splice(insertIndex, 0, newId);
    constrainElement(next, newId);
  }

  return {
    document: next,
    selectedIds
  };
}

export function constrainElement(document: CanvasDocument, id: string): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) {
    return document;
  }
  const parentSize = getParentSize(next, id);
  node.rotation = roundAngle(normalizeAngle(node.rotation ?? 0));
  node.width = Math.min(Math.max(node.width, MIN_ELEMENT_SIZE), parentSize.width);
  node.height = Math.min(Math.max(node.height, MIN_ELEMENT_SIZE), parentSize.height);
  node.x = roundPixel(clamp(node.x, 0, parentSize.width - node.width));
  node.y = roundPixel(clamp(node.y, 0, parentSize.height - node.height));
  clampNodeToParentBounds(next, id);
  return next;
}

export function constrainAll(document: CanvasDocument): CanvasDocument {
  let next = cloneDocument(document);
  if (!next.shellBackground || (next.shellBackground === "#e9edf3" && !next.shellPattern)) {
    next.shellBackground = DEFAULT_SHELL_BACKGROUND;
  }
  next.shellPattern = next.shellPattern ?? DEFAULT_SHELL_PATTERN;
  // Migrate legacy "container" type to "rect"
  for (const node of Object.values(next.elements)) {
    if ((node.type as string) === "container") {
      node.type = "rect";
    }
  }
  for (const id of Object.keys(next.elements)) {
    next = constrainElement(next, id);
  }
  return next;
}

export function reparentElements(
  document: CanvasDocument,
  ids: string[],
  newParentId: string | null
): CanvasDocument {
  const next = cloneDocument(document);

  for (const id of ids) {
    const node = next.elements[id];
    if (!node) continue;
    if (node.parentId === newParentId) continue;

    // Get the element's visual center in canvas space (accounts for ancestor rotations)
    const visualCenter = getAbsoluteCenter(document, id);
    if (!visualCenter) continue;

    // Remove from old parent / rootIds
    const oldParentId = node.parentId;
    if (oldParentId) {
      const oldParent = next.elements[oldParentId];
      if (oldParent) {
        oldParent.children = oldParent.children.filter((cid) => cid !== id);
      }
    } else {
      next.rootIds = next.rootIds.filter((rid) => rid !== id);
    }

    // Preserve visual rotation: absorb old parent's rotation, subtract new parent's
    const oldParentRotation = oldParentId
      ? getEffectiveRotation(document, oldParentId)
      : 0;
    const newParentRotation = newParentId
      ? getEffectiveRotation(document, newParentId)
      : 0;
    node.rotation = roundAngle(normalizeAngle(
      (node.rotation ?? 0) + oldParentRotation - newParentRotation
    ));

    // Convert visual center into the new parent's local coordinate space
    let localCx = visualCenter.x;
    let localCy = visualCenter.y;

    if (newParentId) {
      const newParent = document.elements[newParentId];
      if (newParent) {
        // Get the new parent's visual center and absolute position
        const parentVisualCenter = getAbsoluteCenter(document, newParentId);
        if (parentVisualCenter) {
          // Offset from parent's visual center
          const dx = visualCenter.x - parentVisualCenter.x;
          const dy = visualCenter.y - parentVisualCenter.y;

          // Inverse-rotate by parent's effective rotation to get local-space offset from center
          const localOffset = rotatePoint(
            { x: dx, y: dy },
            { x: 0, y: 0 },
            -newParentRotation
          );

          // Convert from center-relative to top-left-relative local coords
          const bw = newParent.styles.borderWidth ?? 0;
          localCx = newParent.width / 2 + localOffset.x - bw;
          localCy = newParent.height / 2 + localOffset.y - bw;
        }
      }
    }

    node.parentId = newParentId;
    node.x = roundPixel(localCx - node.width / 2);
    node.y = roundPixel(localCy - node.height / 2);

    // Add to new parent / rootIds
    if (newParentId) {
      const newParent = next.elements[newParentId];
      if (newParent && !newParent.children.includes(id)) {
        newParent.children.push(id);
      }
    } else if (!next.rootIds.includes(id)) {
      next.rootIds.push(id);
    }
  }

  return next;
}

export function elementTypeLabel(type: ElementType): string {
  if (type === "rect") return "Rectangle";
  if (type === "ellipse") return "Ellipse";
  if (type === "image") return "Image";
  return "Text";
}
