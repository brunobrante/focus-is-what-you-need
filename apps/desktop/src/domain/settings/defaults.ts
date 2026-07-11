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
  "canvas.clipboard.cut": [{ mod: true, key: "x" }],
  "canvas.selection.duplicate": [{ mod: true, key: "d" }],
  "canvas.selection.selectAll": [{ mod: true, key: "a" }],
  "canvas.selection.delete": [
    { key: "Delete" },
    { key: "Backspace" },
  ],
  "canvas.selection.cancel": [{ key: "Escape" }],
  "canvas.selection.ungroup": [{ mod: true, shift: true, key: "g" }],
  // Two bindings each so the plain arrow (nudge ±1) and Shift+arrow (nudge ±10)
  // both match the same command; the amount is chosen from shiftKey at handle time.
  "canvas.nudge.up": [{ key: "ArrowUp" }, { key: "ArrowUp", shift: true }],
  "canvas.nudge.down": [{ key: "ArrowDown" }, { key: "ArrowDown", shift: true }],
  "canvas.nudge.left": [{ key: "ArrowLeft" }, { key: "ArrowLeft", shift: true }],
  "canvas.nudge.right": [{ key: "ArrowRight" }, { key: "ArrowRight", shift: true }],
  "canvas.component.openSelection": [{ key: "1" }],
  "canvas.component.backToParent": [{ key: "2" }],
  "canvas.overlay.toggleScreen": [{ key: "3" }],
  "canvas.viewport.zoomIn": [
    { mod: true, key: "=" },
    // "+" is typed as Shift+"=", so the event carries shiftKey. Without shift:true
    // the matcher's `event.shiftKey === Boolean(binding.shift)` check rejects it and
    // the binding never fires (DOM-2).
    { mod: true, key: "+", shift: true },
  ],
  "canvas.viewport.zoomOut": [{ mod: true, key: "-" }],
  "canvas.viewport.zoomReset": [{ mod: true, key: "0" }],
  // Shift+2 (Figma). Matched by physical code — Shift turns the "2" keycap into
  // "@"/other glyphs depending on layout, so a key match would never fire.
  "canvas.viewport.zoomToSelection": [{ code: "Digit2", shift: true }],
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
  "canvas.path.commit": [{ key: "Enter" }],
  "canvas.text.commit": [{ key: "Enter" }],
};

const modifierCommands: Record<CanvasModifierCommandId, ModifierBinding> = {
  "canvas.drag.reparent": "mod",
  "canvas.selection.contextToolbar": "alt",
  "canvas.overlay.parentDistances": "ctrl",
  "canvas.resize.fromCenter": "alt",
  "canvas.transform.constrainAspect": "shift",
  "canvas.rotate.snap": "shift",
  // Defaults chosen to exactly match the previously hardcoded gestures, so
  // routing these through the configurable layer changes no behavior (L5).
  "canvas.selection.addToClick": "shift",
  "canvas.vector.removeAnchor": "alt",
  "canvas.radius.perCorner": "alt",
  "canvas.drag.duplicate": "alt",
  // Held while wheeling to zoom instead of pan. WebKit also encodes a trackpad
  // pinch as a ctrl-wheel, which is read raw at the call site and is not a
  // policy choice — this binding only covers the deliberate modifier.
  "canvas.viewport.wheelZoom": "mod",
  // Held while wheeling over an expanded screen to scroll its pages (the content
  // inside the fixed frame window) instead of panning the view.
  "canvas.viewport.wheelPageScroll": "alt",
  "canvas.text.extendSelection": "shift",
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
          sizeMode: "auto",
        },
        rect: {
          name: "Rectangle",
          width: 168,
          height: 104,
          styles: { background: "#dbeafe", opacity: 1 },
          sizeMode: "auto",
        },
        ellipse: {
          name: "Ellipse",
          width: 120,
          height: 120,
          styles: { background: "#dbeafe", opacity: 1 },
          sizeMode: "auto",
        },
        text: {
          name: "Text",
          width: 190,
          height: 48,
          styles: {
            color: "#182033",
            fontFamily: "Inter",
            fontSize: 24,
            fontWeight: "700",
            opacity: 1,
          },
          content: "Text layer",
          sizeMode: "auto",
          fontSizeMode: "auto",
          fontSizeSnap: "off",
        },
        image: {
          name: "Image Placeholder",
          width: 220,
          height: 140,
          styles: { background: "#eef2f7", opacity: 1 },
          sizeMode: "auto",
        },
        icon: {
          name: "Icon",
          width: 140,
          height: 140,
          styles: { background: "#eef2f7", opacity: 1 },
          sizeMode: "auto",
        },
        line: {
          name: "Line",
          width: 120,
          height: 2,
          styles: { background: "#182033", opacity: 1 },
          sizeMode: "auto",
        },
        arrow: {
          name: "Arrow",
          width: 120,
          height: 40,
          styles: { background: "#182033", opacity: 1 },
          sizeMode: "auto",
        },
        polygon: {
          name: "Polygon",
          width: 120,
          height: 120,
          styles: { background: "#dbeafe", opacity: 1 },
          sizeMode: "auto",
        },
        star: {
          name: "Star",
          width: 120,
          height: 120,
          styles: { background: "#dbeafe", borderRadius: 22.49, opacity: 1 },
          sizeMode: "auto",
        },
        pen: {
          name: "Path",
          width: 120,
          height: 120,
          styles: { fill: "none", stroke: "#182033", strokeWidth: 2, opacity: 1 },
          sizeMode: "auto",
        },
        pencil: {
          name: "Path",
          width: 120,
          height: 120,
          styles: { fill: "none", stroke: "#182033", strokeWidth: 2, opacity: 1 },
          sizeMode: "auto",
        },
        svg: {
          name: "SVG",
          width: 140,
          height: 140,
          styles: { fill: "#182033", opacity: 1 },
          sizeMode: "auto",
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
    nudge: {
      small: 1,
      large: 10,
    },
    shell: {
      background: "#171717",
      inheritParentBackground: false,
      grid: { enabled: false, type: "dots" },
      tree: {
        autoRevealSelection: true,
        revealSealedComponentChildren: false,
      },
      invisibleDragGhost: true,
      resizeImageToFrame: true,
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
      objectSegmentation: { enabled: false, activeModelId: null },
      textDetection: { enabled: false, activeModelId: null },
      removeElement: { enabled: false, activeModelId: null },
      colorDetector: { enabled: false, activeModelId: null },
      fontDetection: { enabled: false, activeModelId: null },
      iconDetection: { enabled: false, activeModelId: null },
    },
  },
  projectThumbnails: {
    autoGenerate: true,
  },
};
