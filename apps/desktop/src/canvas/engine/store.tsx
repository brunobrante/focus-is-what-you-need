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
import type { AncestorOverlayItem, CanvasDocument, EditorState, Rect, Size, SnapGuide, Tool, ViewportMode } from "./types";
import { DEFAULT_ANCESTOR_OVERLAY_ITEM } from "./types";
import { constrainAll, createDefaultDocument } from "./actions";
import { documentsEqual, limitHistory } from "./history";
import { createHoverStore, type HoverStore } from "./hoverStore";
import { createNoticeStore, type CanvasNotice, type NoticeStore } from "./noticeStore";
import { getDraftCachePort } from "./draftCachePort";
import { CURRENT_CANVAS_STORAGE_KEY } from "./storageKeys";
import { getInitialZoomForSubjectSize, getViewportZoomLimits, zoomViewportAroundCenter } from "./viewport";

const STORAGE_KEY = CURRENT_CANVAS_STORAGE_KEY;

export type EditorAction =
  | { type: "setTool"; tool: Tool }
  | { type: "setPanning"; panning: boolean }
  | { type: "setZoom"; zoom: number }
  | { type: "setViewport"; zoom?: number; offsetX?: number; offsetY?: number }
  | { type: "setViewportMetrics"; viewportSize: Size; navigableBounds: Rect | null }
  | { type: "setAncestorOverlayEnabled"; enabled: boolean }
  | { type: "updateAncestorOverlayItem"; id: string; patch: Partial<AncestorOverlayItem> }
  | { type: "setSelected"; selectedIds: string[] }
  | { type: "setIsolatedParent"; isolatedParentId: string | null }
  | { type: "setEditingText"; editingTextId: string | null }
  | { type: "enterPathEdit"; pathEditId: string }
  | { type: "exitPathEdit" }
  | { type: "setCanvasStageActive"; active: boolean }
  | { type: "requestNodeFocus"; nodeId: string | null }
  | { type: "setGuides"; guides: SnapGuide[] }
  | { type: "setExportOpen"; exportOpen: boolean }
  | { type: "hydrateDocument"; document: CanvasDocument }
  | { type: "refreshInstances"; document: CanvasDocument }
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
  noticeStore: NoticeStore;
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
    const raw = getDraftCachePort().readDraft(storageKey);
    if (!raw) return makeDefault();
    const parsed = JSON.parse(raw) as unknown;
    if (isCanvasDocument(parsed)) return constrainAll(parsed);
  } catch {
    return makeDefault();
  }
  return makeDefault();
}

// The draft canvas is a freeform scratch space whose dimensions are a fixed system
// value (like a screen's device size), not user data. An older persisted draft may
// still carry a stale, larger canvas box; force it back to the current draft size
// so the projected DOM stage stays within WebKit's renderable budget when zoomed.
function normalizeDraftCanvas(
  document: CanvasDocument,
  viewportMode: ViewportMode,
  fallbackDocument?: CanvasDocument,
): CanvasDocument {
  if (viewportMode !== "draft" || !fallbackDocument) return document;
  const { width, height } = fallbackDocument.canvas;
  if (document.canvas.width === width && document.canvas.height === height) return document;
  return { ...document, canvas: { ...document.canvas, width, height } };
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

function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
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
  viewportMode: ViewportMode = "frame",
): EditorState {
  const document = normalizeDraftCanvas(
    readStoredDocument(storageKey, fallbackDocument, persistStorage),
    viewportMode,
    fallbackDocument,
  );
  return {
    document,
    viewportMode,
    selectedIds: [],
    isolatedParentId: null,
    editingTextId: null,
    pathEditId: null,
    canvasStageActive: false,
    tool: "select",
    zoom: getInitialZoomForSubjectSize(document.canvas, viewportMode),
    offsetX: 0,
    offsetY: 0,
    guides: [],
    exportOpen: false,
    panning: false,
    past: [],
    future: [],
    transientChangedIds: null,
    focusNodeId: null,
    viewportSize: { width: 0, height: 0 },
    navigableBounds: null,
    ancestorOverlay: { enabled: false, items: {} },
  };
}

type Handler<A extends EditorAction> = (state: EditorState, action: A) => EditorState;

const handlers: { [K in EditorAction["type"]]: Handler<Extract<EditorAction, { type: K }>> } = {
  setTool(state, action) {
    // "scale" is a selection-style tool, so it preserves the isolated-parent
    // context exactly like "select"; insert tools and "hand" clear it.
    const keepsIsolation = action.tool === "select" || action.tool === "scale";
    const isolatedParentId = keepsIsolation ? state.isolatedParentId : null;
    if (
      state.tool === action.tool &&
      state.isolatedParentId === isolatedParentId &&
      state.editingTextId === null
    ) {
      return state;
    }
    return { ...state, tool: action.tool, isolatedParentId, editingTextId: null, pathEditId: null };
  },
  setPanning(state, action) {
    if (state.panning === action.panning) return state;
    return { ...state, panning: action.panning };
  },
  setZoom(state, action) {
    const limits = getViewportZoomLimits(state.viewportMode);
    const zoom = Math.max(limits.min, Math.min(limits.max, action.zoom));
    if (state.zoom === zoom) return state;
    // Anchor the zoom on the viewport center (buttons / keyboard / toolbar have no
    // cursor to pivot on) so it grows from the middle of the view instead of the
    // canvas top-left corner. Falls back to a plain zoom change before the stage
    // has reported its geometry.
    const { viewportSize } = state;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return { ...state, zoom };
    }
    const next = zoomViewportAroundCenter(
      { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY },
      zoom,
      viewportSize,
      { width: state.document.canvas.width, height: state.document.canvas.height },
      state.navigableBounds,
      state.viewportMode,
      state.document.canvas.rotation ?? 0,
    );
    return { ...state, zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY };
  },
  setViewportMetrics(state, action) {
    const sizeChanged =
      state.viewportSize.width !== action.viewportSize.width ||
      state.viewportSize.height !== action.viewportSize.height;
    const boundsChanged = !rectsEqual(state.navigableBounds, action.navigableBounds);
    if (!sizeChanged && !boundsChanged) return state;
    return { ...state, viewportSize: action.viewportSize, navigableBounds: action.navigableBounds };
  },
  setAncestorOverlayEnabled(state, action) {
    if (state.ancestorOverlay.enabled === action.enabled) return state;
    return { ...state, ancestorOverlay: { ...state.ancestorOverlay, enabled: action.enabled } };
  },
  updateAncestorOverlayItem(state, action) {
    const prev = state.ancestorOverlay.items[action.id] ?? DEFAULT_ANCESTOR_OVERLAY_ITEM;
    const next: AncestorOverlayItem = { ...prev, ...action.patch };
    return {
      ...state,
      ancestorOverlay: {
        ...state.ancestorOverlay,
        items: { ...state.ancestorOverlay.items, [action.id]: next },
      },
    };
  },
  setViewport(state, action) {
    const limits = getViewportZoomLimits(state.viewportMode);
    const zoom = Math.max(limits.min, Math.min(limits.max, action.zoom ?? state.zoom));
    const offsetX = action.offsetX ?? state.offsetX;
    const offsetY = action.offsetY ?? state.offsetY;
    if (state.zoom === zoom && state.offsetX === offsetX && state.offsetY === offsetY) return state;
    return { ...state, zoom, offsetX, offsetY };
  },
  requestNodeFocus(state, action) {
    if (state.focusNodeId === action.nodeId) return state;
    return { ...state, focusNodeId: action.nodeId };
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
      pathEditId: selectedIds.includes(state.pathEditId ?? "") ? state.pathEditId : null,
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
  enterPathEdit(state, action) {
    const node = state.document.elements[action.pathEditId];
    if (!node || node.type !== "path") return state;
    if (state.pathEditId === action.pathEditId) return state;
    // Editing a path is its own modal mode — leave text editing.
    return { ...state, pathEditId: action.pathEditId, editingTextId: null };
  },
  exitPathEdit(state) {
    if (state.pathEditId === null) return state;
    return { ...state, pathEditId: null };
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
    return { ...state, canvasStageActive: action.active, selectedIds, isolatedParentId, editingTextId: null, pathEditId: null };
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
      viewportMode: state.viewportMode,
      selectedIds: [],
      isolatedParentId: null,
      editingTextId: null,
      pathEditId: null,
      canvasStageActive: false,
      zoom: getInitialZoomForSubjectSize(action.document.canvas, state.viewportMode),
      offsetX: 0,
      offsetY: 0,
      guides: [],
      past: [],
      future: [],
      focusNodeId: null,
    };
  },
  refreshInstances(state, action) {
    // Live re-inline of linked-instance content after a master changed. Unlike
    // hydrateDocument this is gentle: it swaps only the document and re-sanitizes
    // selection, preserving viewport, undo history and text editing — the inlined
    // master subtrees are locked/read-only, so replacing them never touches edits.
    const document = constrainAll(action.document);
    if (documentsEqual(state.document, document)) return state;
    const selectedIds = sanitizeSelection(document, state.selectedIds);
    const isolatedParentId = sanitizeIsolatedParent(document, state.isolatedParentId, selectedIds);
    return { ...state, document, selectedIds, isolatedParentId };
  },
  setDocumentTransient(state, action) {
    if (
      state.document === action.document &&
      (action.guides === undefined || guidesEqual(state.guides, action.guides))
    ) {
      return state;
    }
    // Preserve the prior array reference when the sanitized selection is
    // unchanged — `sanitizeSelection` always returns a fresh array, and a new
    // reference each ~60Hz transient frame defeats referential-equality memo
    // in every selection-keyed consumer.
    const sanitized = sanitizeSelection(action.document, state.selectedIds);
    const selectedIds = idsEqual(state.selectedIds, sanitized) ? state.selectedIds : sanitized;
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
      return { ...state, document: action.document, selectedIds, isolatedParentId, editingTextId: null, guides: [] };
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
  reset(state) {
    return { ...createInitialState(STORAGE_KEY, undefined, true, state.viewportMode), document: createDefaultDocument() };
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
  viewportMode = "frame",
  onDocumentChange,
}: {
  children: ReactNode;
  storageKey?: string;
  fallbackDocument?: CanvasDocument;
  persistStorage?: boolean;
  viewportMode?: ViewportMode;
  onDocumentChange?: (document: CanvasDocument) => void;
}) {
  const hydratedRef = useRef(!persistStorage);
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => createInitialState(storageKey, fallbackDocument, persistStorage, viewportMode),
  );

  const hoverStoreRef = useRef<HoverStore | null>(null);
  if (hoverStoreRef.current === null) hoverStoreRef.current = createHoverStore();
  const hoverStore = hoverStoreRef.current;

  const noticeStoreRef = useRef<NoticeStore | null>(null);
  if (noticeStoreRef.current === null) noticeStoreRef.current = createNoticeStore();
  const noticeStore = noticeStoreRef.current;

  useEffect(() => {
    hydratedRef.current = !persistStorage;
    if (!persistStorage) return;

    // The current-canvas draft is a UI-session cache, not database state: read
    // it synchronously from localStorage (no IPC), matching createInitialState.
    hydratedRef.current = true;
    try {
      const raw = getDraftCachePort().readDraft(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (isCanvasDocument(parsed)) {
        hoverStore.set(null);
        dispatch({
          type: "hydrateDocument",
          document: normalizeDraftCanvas(parsed, viewportMode, fallbackDocument),
        });
      }
    } catch {
      /* ignore malformed draft */
    }
  }, [hoverStore, persistStorage, storageKey, viewportMode, fallbackDocument]);

  useEffect(() => {
    // Transient (in-flight drag/resize/draw) frames push a new document ref ~60Hz,
    // but the persisted/published result only matters once the interaction settles.
    // Skipping them avoids per-frame timer churn and onDocumentChange calls; the
    // following commit (transientChangedIds === null) delivers the final document.
    if (state.transientChangedIds != null) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    if (persistStorage && hydratedRef.current) {
      timeout = setTimeout(() => {
        if (cancelled) return;
        // Session-draft cache → localStorage (synchronous, no IPC). The
        // database scene is saved separately through the queue, on commit.
        try {
          getDraftCachePort().writeDraft(storageKey, JSON.stringify(state.document));
        } catch {
          /* quota — non-fatal */
        }
        getDraftCachePort().emitSaved(storageKey, state.document);
      }, 250);
    }
    onDocumentChange?.(state.document);
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [onDocumentChange, persistStorage, state.document, state.transientChangedIds, storageKey]);

  const value = useMemo(
    () => ({ state, dispatch, hoverStore, noticeStore }),
    [hoverStore, noticeStore, state],
  );
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

export function useNoticeStore(): NoticeStore {
  return useEditor().noticeStore;
}

export function useCanvasNotice(): CanvasNotice | null {
  const store = useNoticeStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
