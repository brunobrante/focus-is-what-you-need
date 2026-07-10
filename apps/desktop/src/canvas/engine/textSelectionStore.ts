// The caret/selection range of the active text-editing session (G10).
//
// It lives outside the reducer for the same reason hover does: the range changes
// on every keystroke and arrow key, and routing it through the editor state would
// republish the bridge snapshot at typing speed. The one consumer that needs it —
// the Inspector, which applies a typography change to the selected characters
// rather than the whole element — subscribes here instead.
//
// One instance per editor, so a split canvas never crosses the two panes' carets.

export type TextSelection = {
  nodeId: string;
  /** Character offsets into the element's `content`; `start === end` is a caret. */
  start: number;
  end: number;
};

export type TextSelectionStore = {
  get: () => TextSelection | null;
  set: (next: TextSelection | null) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createTextSelectionStore(): TextSelectionStore {
  let value: TextSelection | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (
        value === next ||
        (value != null &&
          next != null &&
          value.nodeId === next.nodeId &&
          value.start === next.start &&
          value.end === next.end)
      ) {
        return;
      }
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
