import type {
  CanvasKeyCommandId,
  CanvasModifierCommandId,
  GlobalSettings,
} from "./types";

export function updateInheritParentBackground(
  settings: GlobalSettings,
  inheritParentBackground: boolean,
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      shell: { ...settings.canvas.shell, inheritParentBackground },
    },
  };
}

export function updateInvisibleDragGhost(
  settings: GlobalSettings,
  invisibleDragGhost: boolean,
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      shell: { ...settings.canvas.shell, invisibleDragGhost },
    },
  };
}

export function updateResizeImageToFrame(
  settings: GlobalSettings,
  resizeImageToFrame: boolean,
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      shell: { ...settings.canvas.shell, resizeImageToFrame },
    },
  };
}

export function updateTreeAutoRevealSelection(
  settings: GlobalSettings,
  autoRevealSelection: boolean,
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      shell: {
        ...settings.canvas.shell,
        tree: {
          ...settings.canvas.shell.tree,
          autoRevealSelection,
        },
      },
    },
  };
}

/**
 * Reassigns a key command to a single binding, replacing any existing array.
 *
 * This deliberately collapses multi-binding commands (e.g. zoom-in shipping both
 * `=` and `+`, or redo shipping `Ctrl+Shift+Z` and `Ctrl+Y`) down to the one combo
 * the user just recorded (DOM-9). The Shortcuts recorder is a single-combo
 * "reassign" affordance with no UI to add or remove individual bindings, so an
 * append would let bindings accumulate with no way to prune them. Resetting to the
 * captured binding keeps the displayed badges and the active shortcut in sync.
 */
export function updateKeyCommand(
  settings: GlobalSettings,
  commandId: CanvasKeyCommandId,
  binding: GlobalSettings["canvas"]["inputBindings"]["keyCommands"][CanvasKeyCommandId][number],
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      inputBindings: {
        ...settings.canvas.inputBindings,
        keyCommands: {
          ...settings.canvas.inputBindings.keyCommands,
          [commandId]: [binding],
        },
      },
    },
  };
}

export function updateModifierCommand(
  settings: GlobalSettings,
  commandId: CanvasModifierCommandId,
  binding: GlobalSettings["canvas"]["inputBindings"]["modifierCommands"][CanvasModifierCommandId],
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      inputBindings: {
        ...settings.canvas.inputBindings,
        modifierCommands: {
          ...settings.canvas.inputBindings.modifierCommands,
          [commandId]: binding,
        },
      },
    },
  };
}
