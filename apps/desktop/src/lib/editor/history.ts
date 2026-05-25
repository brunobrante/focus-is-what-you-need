import type { CanvasDocument } from "./types";

export function documentsEqual(a: CanvasDocument, b: CanvasDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function limitHistory(history: CanvasDocument[], maxLength = 80): CanvasDocument[] {
  if (history.length <= maxLength) {
    return history;
  }
  return history.slice(history.length - maxLength);
}
