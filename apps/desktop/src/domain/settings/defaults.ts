import type {
  CanvasKeyCommandId,
  CanvasModifierCommandId,
  GlobalSettings,
  KeyBinding,
  ModifierBinding,
} from "./types";

export const SETTINGS_SCHEMA_VERSION = 1;

const keyCommands: Record<CanvasKeyCommandId, KeyBinding[]> = {
  "canvas.history.undo": [{ mod: true, key: "z" }],
  "canvas.history.redo": [
    { mod: true, shift: true, key: "z" },
    { ctrl: true, key: "y" },
  ],
  "canvas.clipboard.copy": [{ mod: true, key: "c" }],
  "canvas.clipboard.paste": [{ mod: true, key: "v" }],
  "canvas.selection.duplicate": [{ mod: true, key: "d" }],
  "canvas.selection.delete": [
    { key: "Delete" },
    { key: "Backspace" },
  ],
  "canvas.selection.cancel": [{ key: "Escape" }],
  "canvas.component.openSelection": [{ key: "1" }],
  "canvas.component.backToParent": [{ key: "2" }],
  "canvas.overlay.toggleScreen": [{ key: "3" }],
  "canvas.viewport.zoomIn": [
    { mod: true, key: "=" },
    { mod: true, key: "+" },
  ],
  "canvas.viewport.zoomOut": [{ mod: true, key: "-" }],
  "canvas.viewport.zoomReset": [{ mod: true, key: "0" }],
  "canvas.viewport.pan": [{ code: "Space" }],
  "canvas.tool.cursor": [{ key: "v" }],
  "canvas.tool.hand": [{ key: "h" }],
  // "k" (Figma's scale key) is taken by the actions menu, so Scale defaults to "e".
  // Bindings are user-rebindable in settings.
  "canvas.tool.scale": [{ key: "e" }],
  "canvas.tool.wrapper": [{ key: "w" }],
  "canvas.tool.rectangle": [{ key: "r" }],
  "canvas.tool.ellipse": [{ key: "o" }],
  "canvas.tool.line": [{ key: "l" }],
  "canvas.tool.arrow": [{ key: "a" }],
  "canvas.tool.polygon": [{ key: "y" }],
  "canvas.tool.star": [{ key: "s" }],
  "canvas.tool.pen": [{ key: "p" }],
  "canvas.tool.pencil": [{ shift: true, key: "p" }],
  "canvas.tool.text": [{ key: "t" }],
  "canvas.tool.image": [{ key: "i" }],
  "canvas.tool.svg": [{ key: "g" }],
  "canvas.tool.actions": [{ key: "k" }],
};

const modifierCommands: Record<CanvasModifierCommandId, ModifierBinding> = {
  "canvas.drag.reparent": "mod",
  "canvas.selection.contextToolbar": "alt",
  "canvas.overlay.parentDistances": "ctrl",
  "canvas.resize.fromCenter": "alt",
  "canvas.transform.constrainAspect": "shift",
  "canvas.rotate.snap": "shift",
};

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  canvas: {
    tools: {
      defaultTool: "cursor",
      toolbar: {
        groups: [
          [{ kind: "dropdown", tools: ["cursor", "hand", "scale"] }],
          [
            { kind: "button", tool: "wrapper" },
            {
              kind: "dropdown",
              tools: ["rectangle", "ellipse", "line", "arrow", "polygon", "star"],
              badge: "SVG",
            },
            { kind: "dropdown", tools: ["pen", "pencil"] },
            { kind: "button", tool: "text" },
            { kind: "dropdown", tools: ["image", "svg"] },
          ],
          [{ kind: "button", tool: "actions" }],
        ],
      },
    },
    toolDefaults: {
      shapeRenderModes: {
        rectangle: "svg",
        ellipse: "svg",
        line: "svg",
        arrow: "svg",
        polygon: "svg",
        star: "svg",
      },
    },
    elementDefaults: {
      referenceSize: 390,
      minScale: 0.1,
      maxScale: 2.5,
      tools: {
        wrapper: {
          name: "Wrapper",
          width: 200,
          height: 200,
          styles: { opacity: 1 },
        },
        rect: {
          name: "Rectangle",
          width: 168,
          height: 104,
          styles: { background: "#dbeafe", opacity: 1 },
        },
        ellipse: {
          name: "Ellipse",
          width: 120,
          height: 120,
          styles: { background: "#dbeafe", opacity: 1 },
        },
        text: {
          name: "Text",
          width: 190,
          height: 48,
          styles: { color: "#182033", fontSize: 24, fontWeight: "700", opacity: 1 },
          content: "Text layer",
        },
        image: {
          name: "Image Placeholder",
          width: 220,
          height: 140,
          styles: { background: "#eef2f7", opacity: 1 },
        },
        icon: {
          name: "Icon",
          width: 140,
          height: 140,
          styles: { background: "#eef2f7", opacity: 1 },
        },
        line: {
          name: "Line",
          width: 120,
          height: 2,
          styles: { background: "#182033", opacity: 1 },
        },
        arrow: {
          name: "Arrow",
          width: 120,
          height: 40,
          styles: { background: "#182033", opacity: 1 },
        },
        polygon: {
          name: "Polygon",
          width: 120,
          height: 120,
          styles: { background: "#dbeafe", opacity: 1 },
        },
        star: {
          name: "Star",
          width: 120,
          height: 120,
          styles: { background: "#dbeafe", borderRadius: 22.49, opacity: 1 },
        },
      },
    },
    inputBindings: {
      keyCommands,
      modifierCommands,
    },
    viewport: {
      zoomStep: 0.25,
      wheelZoomSensitivity: 0.002,
    },
    shell: {
      background: "#171717",
      inheritParentBackground: false,
      grid: { enabled: false, type: "dots" },
      tree: {
        autoRevealSelection: true,
      },
    },
  },
  systemDesign: {
    shareWithProjectsByDefault: true,
  },
  processing: {
    installedModelIds: [],
    features: {
      removeBackground: { enabled: false, activeModelId: null },
      upscale: { enabled: false, activeModelId: null },
      autoDetect: { enabled: false, activeModelId: null },
      textDetection: { enabled: false, activeModelId: null },
      removeElement: { enabled: false, activeModelId: null },
    },
  },
};
