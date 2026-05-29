import type { CanvasDocument } from "@/lib/editor/types";
import type { Size } from "@/lib/editor/viewport";

export type TextEditState = {
  nodeId: string;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  anchorIndex: number;
};

export type TextEditSession = {
  nodeId: string;
  beforeDocument: CanvasDocument;
};

export type TextDragState = {
  pointerId: number;
  nodeId: string;
  anchorIndex: number;
};

export type ViewportClientRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const ZERO_VIEWPORT_SIZE: Size = { width: 0, height: 0 };
export const ZERO_VIEWPORT_RECT: ViewportClientRect = { left: 0, top: 0, width: 0, height: 0 };
