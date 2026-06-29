import { createContext, useContext } from "react";
import type { CanvasWindowKey } from "@/canvas/canvasUtils";

/**
 * Per-pane window identity, provided around each rendered canvas surface so the
 * deeply-nested context menu knows which split window it belongs to (and can hide
 * just that pane). `splitActive` is true only while more than one window is shown.
 */
export type CanvasWindowInfo = {
  windowKey: CanvasWindowKey;
  splitActive: boolean;
  /** Remove this pane from the split. No-op for the primary "current" pane. */
  onHideWindow: (key: CanvasWindowKey) => void;
};

const CanvasWindowContext = createContext<CanvasWindowInfo | null>(null);

export const CanvasWindowProvider = CanvasWindowContext.Provider;

export function useCanvasWindow(): CanvasWindowInfo | null {
  return useContext(CanvasWindowContext);
}
