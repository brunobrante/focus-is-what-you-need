import { createContext, useContext } from "react";

import type { ElementFontTokens } from "@/canvas/engine/types";

/**
 * Design-system typography inputs for element creation (font-size snapping and a
 * default family). Provided once at the canvas root from the project's resolved
 * design system, consumed by every canvas surface's pointer handler. Using a
 * context avoids drilling these through every surface alongside `settings`.
 */
const ElementFontTokensContext = createContext<ElementFontTokens | null>(null);

export const ElementFontTokensProvider = ElementFontTokensContext.Provider;

export function useElementFontTokens(): ElementFontTokens | undefined {
  return useContext(ElementFontTokensContext) ?? undefined;
}
