import { createContext, useContext } from "react";

import type { ResolvedSystemDesign } from "@/domain/system-design/resolve";

/**
 * The project's resolved System Design, provided once at the canvas root from
 * `useProjectSystemDesign`. The element renderer reads it to resolve token `$$ref`
 * bindings (color/background/border) to live values, and the inspector reads it to
 * offer tokens to bind. Because the hook subscribes to the system_designs table,
 * editing a workspace master token re-renders every bound element.
 */
const ResolvedSystemDesignContext = createContext<ResolvedSystemDesign | null>(null);

export const ResolvedSystemDesignProvider = ResolvedSystemDesignContext.Provider;

export function useResolvedSystemDesign(): ResolvedSystemDesign | null {
  return useContext(ResolvedSystemDesignContext);
}
