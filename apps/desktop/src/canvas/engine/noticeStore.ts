// Transient canvas notices live outside the editor reducer, exactly like the
// hover store: they are pure UI feedback that should not republish the editor
// state or wake every `useEditor()` consumer. A notice is a short confirmation
// message shown near the toolbar (e.g. "Wrapper added") so the user gets visible
// feedback for actions whose canvas result is otherwise invisible.
//
// One instance per editor (a split canvas has two `EditorProvider`s), so the two
// canvases never show each other's notices.

export type CanvasNotice = {
  message: string;
  // Strictly increasing per `show()` call. Lets the UI replay its show/auto-hide
  // animation even when the same message is fired twice in a row.
  token: number;
};

export type NoticeStore = {
  get: () => CanvasNotice | null;
  show: (message: string) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createNoticeStore(): NoticeStore {
  let value: CanvasNotice | null = null;
  let token = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    show: (message) => {
      token += 1;
      value = { message, token };
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
