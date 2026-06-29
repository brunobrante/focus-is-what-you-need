import { createContext, useContext } from "react";

/**
 * "Hide UI" (Figma-style) toggle, shared from the canvas page down to the
 * deeply-nested canvas context menu. When `uiHidden` is true the page hides its
 * chrome (header chip, Layers sidebar, Preview launcher, Inspector) leaving a
 * bare canvas; the right-click menu stays reachable to bring the UI back.
 */
export type CanvasUiVisibility = {
  uiHidden: boolean;
  toggleUiHidden: () => void;
  /** True while either side panel (Layers / Inspector) is open. */
  panelsOpen: boolean;
  /** Open or close both side panels together (header + Preview collapse with them). */
  togglePanels: () => void;
};

const CanvasUiVisibilityContext = createContext<CanvasUiVisibility>({
  uiHidden: false,
  toggleUiHidden: () => {},
  panelsOpen: true,
  togglePanels: () => {},
});

export const CanvasUiVisibilityProvider = CanvasUiVisibilityContext.Provider;

export function useCanvasUiVisibility(): CanvasUiVisibility {
  return useContext(CanvasUiVisibilityContext);
}
