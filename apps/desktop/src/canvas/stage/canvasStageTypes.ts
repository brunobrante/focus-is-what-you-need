export type { TextDragState, TextEditSession, TextEditState, ViewportClientRect } from "@/canvas/engine/types";

import type { Size, ViewportClientRect } from "@/canvas/engine/types";

export type CanvasDropIntent = "insert" | "detach";

export type CanvasDropTarget = {
  targetId: string | null;
  intent: CanvasDropIntent;
};

export const ZERO_VIEWPORT_SIZE: Size = { width: 0, height: 0 };
export const ZERO_VIEWPORT_RECT: ViewportClientRect = { left: 0, top: 0, width: 0, height: 0 };
