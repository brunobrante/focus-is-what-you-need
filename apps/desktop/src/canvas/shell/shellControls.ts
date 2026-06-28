import { isCurrentKey, windowTypeOfKey, type CanvasWindowKey } from "@/canvas/canvasUtils";
import type { ShellControlVisibility } from "./inspector/ShellTab";

// Shell chrome controls are configured PER WINDOW TYPE, not globally: the device,
// back, zoom, and expand visibility for Current is independent of Sketch, Versions,
// and References. Extra Currents (current:1…) share the "current" config — they are
// the same window type. Preview is view-only and never edits these.
export type ShellWindowType = "current" | "sketch" | "versions" | "references";

export type ShellControls = {
  device: ShellControlVisibility;
  back: ShellControlVisibility;
  zoom: ShellControlVisibility;
  expand: ShellControlVisibility;
};

export type ShellControlKey = keyof ShellControls;

export type ShellControlsByWindow = Record<ShellWindowType, ShellControls>;

const DEFAULT_SHELL_CONTROLS: ShellControls = {
  device: "show",
  back: "show",
  zoom: "show",
  expand: "hover",
};

export const DEFAULT_SHELL_CONTROLS_BY_WINDOW: ShellControlsByWindow = {
  current: { ...DEFAULT_SHELL_CONTROLS },
  sketch: { ...DEFAULT_SHELL_CONTROLS },
  versions: { ...DEFAULT_SHELL_CONTROLS },
  references: { ...DEFAULT_SHELL_CONTROLS },
};

// The shell-config bucket a window key belongs to. Current keys (including extra
// Currents) → "current"; feature keys map to their own type; anything else (e.g.
// preview, which never reaches the shell config) falls back to "current".
export function shellWindowTypeOf(key: CanvasWindowKey): ShellWindowType {
  if (isCurrentKey(key)) return "current";
  const type = windowTypeOfKey(key);
  return type === "sketch" || type === "versions" || type === "references" ? type : "current";
}
