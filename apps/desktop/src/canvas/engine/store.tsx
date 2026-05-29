import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Dispatch, ReactNode } from "react";
import { store as persistenceStore } from "@/lib/storage/store";
import type { CanvasDocument, EditorState, SnapGuide, Tool } from "./types";
import { constrainAll, createDefaultDocument } from "./actions";
import { documentsEqual, limitHistory } from "./history";
import { createHoverStore, type HoverStore } from "./hoverStore";
import { CANVAS_DOCUMENT_SAVED_EVENT, CURRENT_CANVAS_STORAGE_KEY } from "./storageKeys";
import { getInitialZoomForSubjectSize, MAX_ZOOM, MIN_ZOOM } from "./viewport";

const STORAGE_KEY = CURRENT_CANVAS_STORAGE_KEY;

export type EditorAction =
  | { type: "setTool"; tool: Tool }
  | { type: "setZoom"; zoom: number }
  | { type: "setViewport"; zoom?: number; offsetX?: number; offsetY?: number }
  | { type: "setSelected"; selectedIds: string[] }
  | { type: "setIsolatedParent"; isolatedParentId: string | null }
  | { type: "setEditingText"; editingTextId: string | null }
  | { type: "setCanvasStageActive"; active: boolean }
  | { type: "setGuides"; guides: SnapGuide[] }
  | { type: "setExportOpen"; exportOpen: boolean }
  | { type: "hydrateDocument"; document: CanvasDocument }
  | { type: "setDocumentTransient"; document: CanvasDocument; guides?: SnapGuide[]; changedIds?: readonly string[] }
  | {
      type: "commitDocument";
      document: CanvasDocument;
      beforeDocument?: CanvasDocument;
      selectedIds?: string[];
    }
  | { type: "cancelTextEditing"; document: CanvasDocument }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" };

type EditorContextValue = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  hoverStore: HoverStore;
};

const EditorContext = createContext<EditorContextValue | null>(null);

function isCanvasDocument(value: unknown): value is CanvasDocument {
  const maybeDocument = value as CanvasDocument;
  return Boolean(
    maybeDocument &&
      maybeDocument.canvas &&
      typeof maybeDocument.canvas.width === "number" &&
      typeof maybeDocument.canvas.height === "number" &&
      maybeDocument.elements &&
      Array.isArray(maybeDocument.rootIds)
  );
}

function readStoredDocument(
  storageKey: string,
  fallbackDocument?: CanvasDocument,
  persistStorage = true,
): CanvasDocument {
  const makeDefault = () => fallbackDocument ?? createDefaultDocument();
  if (!persistStorage) return makeDefault();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return makeDefault();
    const parsed = JSON.parse(raw) as unknown;
    if (isCanvasDocument(parsed)) return constrainAll(parsed);
  } catch {
    return makeDefault();
  }
  return makeDefault();
}

function sanitizeSelection(document: CanvasDocument, ids: string[]): string[] {
  return ids.filter((id) => Boolean(document.elements[id]));
}

function idsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function guidesEqual(a: readonly SnapGuide[], b: readonly SnapGuide[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id ||
      left.orientation !== right.orientation ||
      left.position !== right.position ||
      left.from !== right.from ||
      left.to !== right.to
    ) {
      return false;
    }
  }
  return true;
}

function sanitizeIsolatedParent(
  document: CanvasDocument,
  isolatedParentId: string | null,
  selectedIds: string[],
): string | null {
  if (!isolatedParentId || !selectedIds.includes(isolatedParentId)) {
    return null;
  }
  const node = document.elements[isolatedParentId];
  return node && node.children.length > 0 ? isolatedParentId : null;
}

function createInitialState(
  storageKey: string,
  fallbackDocument?: CanvasDocument,
  persistStorage = true,
): EditorState {
  const document = readStoredDocument(storageKey, fallbackDocument, persistStorage);
  return {
    document,
    selectedIds: [],
    isolatedParentId: null,
    editingTextId: null,
    canvasStageActive: false,
    tool: "select",
    zoom: getInitialZoomForSubjectSize(document.canvas),
    offsetX: 0,
    offsetY: 0,
    guides: [],
    exportOpen: false,
    past: [],
    future: [],
    transientChangedIds: null,
  };
}

type Handler<A extends EditorAction> = (state: EditorState, action: A) => EditorState;

const handlers: { [K in EditorAction["type"]]: Handler<Extract<EditorAction, { type: K }>> } = {
  setTool(state, action) {
    const isolatedParentId = action.tool === "select" ? state.isolatedParentId : null;
    if (
      state.tool === action.tool &&
      state.isolatedParentId === isolatedParentId &&
      state.editingTextId === null
    ) {
      return state;
    }
    return { ...state, tool: action.tool, isolatedParentId, editingTextId: null };
  },
  setZoom(state, action) {
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, action.zoom));
    if (state.zoom === zoom) return state;
    return { ...state, zoom };
  },
  setViewport(state, action) {
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, action.zoom ?? state.zoom));
    const offsetX = action.offsetX ?? state.offsetX;
    const offsetY = action.offsetY ?? state.offsetY;
    if (state.zoom === zoom && state.offsetX === offsetX && state.offsetY === offsetY) return state;
    return { ...state, zoom, offsetX, offsetY };
  },
  setSelected(state, action) {
    const selectedIds = sanitizeSelection(state.document, action.selectedIds);
    const isolatedParentId = sanitizeIsolatedParent(state.document, state.isolatedParentId, selectedIds);
    const canvasStageActive = selectedIds.length > 0 ? false : state.canvasStageActive;
    if (
      idsEqual(state.selectedIds, selectedIds) &&
      state.isolatedParentId === isolatedParentId &&
      state.canvasStageActive === canvasStageActive &&
      state.editingTextId === null
    ) {
      return state;
    }
    return {
      ...state,
      selectedIds,
      isolatedParentId,
      canvasStageActive,
      editingTextId: selectedIds.includes(state.editingTextId ?? "") ? state.editingTextId : null,
    };
  },
  setIsolatedParent(state, action) {
    const isolatedParentId =
      action.isolatedParentId && state.document.elements[action.isolatedParentId]?.children.length
        ? action.isolatedParentId
        : null;
    const selectedIds = isolatedParentId ? [isolatedParentId] : state.selectedIds;
    if (
      idsEqual(state.selectedIds, selectedIds) &&
      state.isolatedParentId === isolatedParentId &&
      !state.canvasStageActive &&
      state.editingTextId === null
    ) {
      return state;
    }
    return { ...state, selectedIds, isolatedParentId, canvasStageActive: false, editingTextId: null };
  },
  setEditingText(state, action) {
    if (state.editingTextId === action.editingTextId) return state;
    return { ...state, editingTextId: action.editingTextId };
  },
  setCanvasStageActive(state, action) {
    const selectedIds = action.active ? [] : state.selectedIds;
    const isolatedParentId = action.active ? null : state.isolatedParentId;
    if (
      state.canvasStageActive === action.active &&
      idsEqual(state.selectedIds, selectedIds) &&
      state.isolatedParentId === isolatedParentId &&
      state.editingTextId === null
    ) {
      return state;
    }
    return { ...state, canvasStageActive: action.active, selectedIds, isolatedParentId, editingTextId: null };
  },
  setGuides(state, action) {
    if (guidesEqual(state.guides, action.guides)) return state;
    return { ...state, guides: action.guides };
  },
  setExportOpen(state, action) {
    if (state.exportOpen === action.exportOpen) return state;
    return { ...state, exportOpen: action.exportOpen };
  },
  hydrateDocument(state, action) {
    return {
      ...state,
      document: constrainAll(action.document),
      selectedIds: [],
      isolatedParentId: null,
      editingTextId: null,
      canvasStageActive: false,
      zoom: getInitialZoomForSubjectSize(action.document.canvas),
      offsetX: 0,
      offsetY: 0,
      guides: [],
      past: [],
      future: [],
    };
  },
  setDocumentTransient(state, action) {
    if (
      state.document === action.document &&
      (action.guides === undefined || guidesEqual(state.guides, action.guides))
    ) {
      return state;
    }
    const selectedIds = sanitizeSelection(action.document, state.selectedIds);
    return {
      ...state,
      document: action.document,
      selectedIds,
      isolatedParentId: sanitizeIsolatedParent(action.document, state.isolatedParentId, selectedIds),
      guides: action.guides ?? state.guides,
      transientChangedIds: action.changedIds ?? null,
    };
  },
  commitDocument(state, action) {
    const beforeDocument = action.beforeDocument ?? state.document;
    const selectedIds = sanitizeSelection(action.document, action.selectedIds ?? state.selectedIds);
    const isolatedParentId = sanitizeIsolatedParent(action.document, state.isolatedParentId, selectedIds);
    if (documentsEqual(beforeDocument, action.document)) {
      return { ...state, document: action.document, selectedIds, isolatedParentId, guides: [] };
    }
    return {
      ...state,
      document: action.document,
      selectedIds,
      isolatedParentId,
      editingTextId: null,
      guides: [],
      past: limitHistory([...state.past, beforeDocument]),
      future: [],
    };
  },
  undo(state) {
    const previous = state.past[state.past.length - 1];
    if (!previous) return state;
    const selectedIds = sanitizeSelection(previous, state.selectedIds);
    return {
      ...state,
      document: previous,
      selectedIds,
      isolatedParentId: sanitizeIsolatedParent(previous, state.isolatedParentId, selectedIds),
      editingTextId: null,
      guides: [],
      past: state.past.slice(0, -1),
      future: [state.document, ...state.future],
    };
  },
  redo(state) {
    const next = state.future[0];
    if (!next) return state;
    const selectedIds = sanitizeSelection(next, state.selectedIds);
    return {
      ...state,
      document: next,
      selectedIds,
      isolatedParentId: sanitizeIsolatedParent(next, state.isolatedParentId, selectedIds),
      editingTextId: null,
      guides: [],
      past: limitHistory([...state.past, state.document]),
      future: state.future.slice(1),
    };
  },
  cancelTextEditing(state, action) {
    const selectedIds = sanitizeSelection(action.document, state.selectedIds);
    if (state.document === action.document && state.editingTextId === null) return state;
    return {
      ...state,
      document: action.document,
      selectedIds,
      isolatedParentId: sanitizeIsolatedParent(action.document, state.isolatedParentId, selectedIds),
      editingTextId: null,
    };
  },
  reset(_state) {
    return { ...createInitialState(STORAGE_KEY), document: createDefaultDocument() };
  },
};

function reducer(state: EditorState, action: EditorAction): EditorState {
  const handler = handlers[action.type] as Handler<EditorAction> | undefined;
  const next = handler ? handler(state, action) : state;
  // `transientChangedIds` is valid only for the `setDocumentTransient` that set it.
  // Any other action (including a discrete commit/undo) must drop it so the stage
  // falls back to the full diff and can never miss a re-render.
  if (action.type !== "setDocumentTransient" && next !== state && next.transientChangedIds != null) {
    return { ...next, transientChangedIds: null };
  }
  return next;
}

export function EditorProvider({
  children,
  storageKey = STORAGE_KEY,
  fallbackDocument,
  persistStorage = true,
  onDocumentChange,
}: {
  children: ReactNode;
  storageKey?: string;
  fallbackDocument?: CanvasDocument;
  persistStorage?: boolean;
  onDocumentChange?: (document: CanvasDocument) => void;
}) {
  const hydratedRef = useRef(!persistStorage);
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => createInitialState(storageKey, fallbackDocument, persistStorage),
  );

  const hoverStoreRef = useRef<HoverStore | null>(null);
  if (hoverStoreRef.current === null) hoverStoreRef.current = createHoverStore();
  const hoverStore = hoverStoreRef.current;

  useEffect(() => {
    hydratedRef.current = !persistStorage;
    if (!persistStorage) return;

    let cancelled = false;
    void persistenceStore.get<CanvasDocument>(storageKey).then((stored) => {
      if (cancelled) return;
      hydratedRef.current = true;
      if (stored && isCanvasDocument(stored)) {
        hoverStore.set(null);
        dispatch({ type: "hydrateDocument", document: stored });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hoverStore, persistStorage, storageKey]);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    if (persistStorage && hydratedRef.current) {
      timeout = setTimeout(() => {
        void persistenceStore.set(storageKey, state.document).then(() => {
          if (cancelled) return;
          window.dispatchEvent(
            new CustomEvent(CANVAS_DOCUMENT_SAVED_EVENT, {
              detail: { storageKey, document: state.document },
            }),
          );
        });
      }, 250);
    }
    onDocumentChange?.(state.document);
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [onDocumentChange, persistStorage, state.document, storageKey]);

  const value = useMemo(() => ({ state, dispatch, hoverStore }), [hoverStore, state]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used inside EditorProvider");
  }
  return context;
}

export function useHoverStore(): HoverStore {
  return useEditor().hoverStore;
}

export function useHoveredId(): string | null {
  const store = useHoverStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
