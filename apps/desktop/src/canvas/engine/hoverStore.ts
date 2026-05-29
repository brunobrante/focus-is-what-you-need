// Hover lives outside the editor reducer. Pointer-move hover events fire at
// roughly 60 Hz; routing them through the reducer republished the editor
// context and the bridge snapshot, which woke Inspector and any other
// `useEditor()` / `useEditorBridge()` consumer that did not specifically need
// hover. This store keeps hover updates isolated to the few subscribers that
// actually paint a hover affordance (currently `CanvasToolingLayer`).
//
// One instance per editor: a split canvas has two `EditorProvider`s, each gets
// its own hover store via `createHoverStore()` so the two canvases never bleed
// hover state into each other.

export type HoverStore = {
  get: () => string | null;
  set: (next: string | null) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createHoverStore(): HoverStore {
  let value: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (value === next) return;
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
