import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Dispatch, ReactNode } from "react";
import { useEditor } from "./store";
import type { EditorState } from "./types";

export type EditorBridgeValue = {
  sourceId: string;
  state: EditorState;
  dispatch: Dispatch<Parameters<ReturnType<typeof useEditor>["dispatch"]>[0]>;
};

type Listener = () => void;

type BridgeStore = {
  getSnapshot: () => EditorBridgeValue | null;
  subscribe: (listener: Listener) => () => void;
  set: (sourceId: string, value: Omit<EditorBridgeValue, "sourceId">) => void;
  clear: (sourceId: string) => void;
};

function createBridgeStore(): BridgeStore {
  let current: EditorBridgeValue | null = null;
  const listeners = new Set<Listener>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(sourceId, value) {
      // The store always swaps the snapshot when the publisher fires, even if
      // the new EditorBridgeValue references the same `state` and `dispatch`.
      // Subscribers re-derive their selector value from the snapshot and only
      // re-render when *that* value changes (see `useEditorBridge`).
      current = { sourceId, ...value };
      notify();
    },
    clear(sourceId) {
      if (current?.sourceId !== sourceId) return;
      current = null;
      notify();
    },
  };
}

const StoreCtx = createContext<BridgeStore | null>(null);

export function EditorBridgeProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<BridgeStore | null>(null);
  if (storeRef.current === null) storeRef.current = createBridgeStore();
  return <StoreCtx.Provider value={storeRef.current}>{children}</StoreCtx.Provider>;
}

function useBridgeStore(): BridgeStore {
  const store = useContext(StoreCtx);
  if (!store) {
    throw new Error("EditorBridge must be used inside EditorBridgeProvider");
  }
  return store;
}

function identitySelector(value: EditorBridgeValue | null): EditorBridgeValue | null {
  return value;
}

/**
 * Subscribes to the editor bridge with a selector. Re-renders the calling
 * component only when the selector return value changes (compared by
 * `isEqual`, defaulting to `Object.is`). Without a selector, returns the full
 * bridge value — but then re-renders on every publisher update, including the
 * 60 Hz transient document updates during drag/resize. **Prefer a narrow
 * selector whenever possible.**
 */
export function useEditorBridge<T = EditorBridgeValue | null>(
  selector: (value: EditorBridgeValue | null) => T = identitySelector as (
    value: EditorBridgeValue | null,
  ) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useBridgeStore();
  const cacheRef = useRef<{
    source: EditorBridgeValue | null;
    selector: (value: EditorBridgeValue | null) => T;
    value: T;
  } | null>(null);

  const getSnapshot = (): T => {
    const source = store.getSnapshot();
    const cache = cacheRef.current;
    if (cache && cache.source === source && cache.selector === selector) {
      return cache.value;
    }
    const value = selector(source);
    if (cache && isEqual(cache.value, value)) {
      // Keep the previous identity so React skips the update.
      cacheRef.current = { source, selector, value: cache.value };
      return cache.value;
    }
    cacheRef.current = { source, selector, value };
    return value;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/**
 * Returns a function that reads the *current* bridge snapshot without
 * subscribing — handy for event handlers that need the latest editor state at
 * the moment the handler runs, without re-rendering the component on every
 * editor update.
 */
export function useEditorBridgeReader(): () => EditorBridgeValue | null {
  const store = useBridgeStore();
  return store.getSnapshot;
}

export function EditorBridgePublisher({
  sourceId = "default",
  active = true,
}: {
  sourceId?: string;
  active?: boolean;
}) {
  const editor = useEditor();
  const store = useBridgeStore();

  useEffect(() => {
    if (active) {
      store.set(sourceId, editor);
    } else {
      store.clear(sourceId);
    }
  }, [active, editor, sourceId, store]);

  useEffect(() => () => store.clear(sourceId), [sourceId, store]);

  return null;
}
