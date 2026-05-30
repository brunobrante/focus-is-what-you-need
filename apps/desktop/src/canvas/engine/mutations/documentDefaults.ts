import type { CanvasDocument, CanvasProperties, ShellGridType } from "../types";
import { cloneDocument } from "./coreUtils";

export const DEFAULT_SHELL_BACKGROUND = "#171717";
export const DEFAULT_SHELL_GRID: { enabled: boolean; type: ShellGridType } = { enabled: false, type: "dots" };

export function createBlankDocument(width: number, height: number): CanvasDocument {
  return {
    canvas: { width, height, background: "#f8fafc" },
    shellBackground: DEFAULT_SHELL_BACKGROUND,
    rootIds: [],
    elements: {},
  };
}

const DRAFT_CANVAS_SIZE = 100_000;

export function createDraftDocument(_width?: number, _height?: number): CanvasDocument {
  return {
    canvas: { width: DRAFT_CANVAS_SIZE, height: DRAFT_CANVAS_SIZE, background: "" },
    shellBackground: DEFAULT_SHELL_BACKGROUND,
    rootIds: [],
    elements: {},
  };
}

export function updateShellBackground(document: CanvasDocument, background: string): CanvasDocument {
  const next = cloneDocument(document);
  next.shellBackground = background;
  return next;
}

export function updateShellGrid(
  document: CanvasDocument,
  grid: Partial<{ enabled: boolean; type: ShellGridType }>,
): CanvasDocument {
  const next = cloneDocument(document);
  next.shellGrid = { ...DEFAULT_SHELL_GRID, ...next.shellGrid, ...grid };
  return next;
}

export function updateCanvasProperties(
  document: CanvasDocument,
  props: Partial<CanvasProperties>,
): CanvasDocument {
  const next = cloneDocument(document);
  next.canvas = { ...next.canvas, ...props };
  return next;
}

export function createDefaultDocument(): CanvasDocument {
  return {
    canvas: { width: 960, height: 640, background: "#f8fafc" },
    shellBackground: DEFAULT_SHELL_BACKGROUND,
    rootIds: ["hero-card", "side-panel", "label-pill"],
    elements: {
      "hero-card": {
        id: "hero-card", type: "rect", parentId: null,
        children: ["hero-image", "hero-title", "hero-body", "primary-action", "action-text"],
        name: "Feature Card", x: 110, y: 96, width: 520, height: 360, rotation: 0,
        styles: { background: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#d7dee8", opacity: 1 },
        visible: true,
      },
      "hero-image": {
        id: "hero-image", type: "image", parentId: "hero-card", children: [],
        name: "Image Placeholder", x: 28, y: 28, width: 220, height: 150, rotation: 0,
        styles: { background: "#e6eef8", borderRadius: 12, borderWidth: 1, borderColor: "#c6d3e2", opacity: 1 },
        visible: true,
      },
      "hero-title": {
        id: "hero-title", type: "text", parentId: "hero-card", children: [],
        name: "Title", x: 278, y: 42, width: 194, height: 70, rotation: 0,
        styles: { color: "#172033", fontSize: 30, fontWeight: "700", opacity: 1 },
        content: "Build in real HTML", visible: true,
      },
      "hero-body": {
        id: "hero-body", type: "text", parentId: "hero-card", children: [],
        name: "Body Copy", x: 280, y: 128, width: 190, height: 92, rotation: 0,
        styles: { color: "#526070", fontSize: 15, fontWeight: "500", opacity: 1 },
        content: "Drag, resize, snap, edit text, and export clean HTML/CSS.", visible: true,
      },
      "primary-action": {
        id: "primary-action", type: "rect", parentId: "hero-card", children: [],
        name: "Action Surface", x: 280, y: 252, width: 150, height: 44, rotation: 0,
        styles: { background: "#1f7ae0", borderRadius: 9, borderWidth: 0, borderColor: "#1f7ae0", opacity: 1 },
        visible: true,
      },
      "action-text": {
        id: "action-text", type: "text", parentId: "hero-card", children: [],
        name: "Action Text", x: 304, y: 264, width: 103, height: 22, rotation: 0,
        styles: { color: "#ffffff", fontSize: 14, fontWeight: "700", opacity: 1 },
        content: "Start editing", visible: true,
      },
      "side-panel": {
        id: "side-panel", type: "rect", parentId: null, children: [],
        name: "Accent Panel", x: 690, y: 140, width: 150, height: 260, rotation: 0,
        styles: { background: "#e7f2ec", borderRadius: 26, borderWidth: 1, borderColor: "#c6dfd1", opacity: 1 },
        visible: true,
      },
      "label-pill": {
        id: "label-pill", type: "text", parentId: null, children: [],
        name: "Canvas Label", x: 694, y: 422, width: 142, height: 28, rotation: 0,
        styles: { color: "#216249", fontSize: 14, fontWeight: "700", opacity: 1 },
        content: "Finite canvas", visible: true,
      },
    },
  };
}
