import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { Dispatch, ReactNode } from "react";
import { store as persistenceStore } from "@/lib/storage/store";
import type { CanvasDocument, EditorState, SnapGuide, Tool } from "./types";
import { constrainAll, createDefaultDocument } from "./actions";
import { documentsEqual, limitHistory } from "./history";
import { CANVAS_DOCUMENT_SAVED_EVENT, CURRENT_CANVAS_STORAGE_KEY } from "./storageKeys";
import { getInitialZoomForSubjectSize, MAX_ZOOM, MIN_ZOOM } from "./viewport";

const STORAGE_KEY = CURRENT_CANVAS_STORAGE_KEY;

type EditorAction =
  | { type: "setTool"; tool: Tool }
  | { type: "setZoom"; zoom: number }
  | { type: "setViewport"; zoom?: number; offsetX?: number; offsetY?: number }
  | { type: "setSelected"; selectedIds: string[] }
  | { type: "setIsolatedParent"; isolatedParentId: string | null }
  | { type: "setHovered"; hoveredId: string | null }
  | { type: "setEditingText"; editingTextId: string | null }
  | { type: "setCanvasStageActive"; active: boolean }
  | { type: "setGuides"; guides: SnapGuide[] }
  | { type: "setExportOpen"; exportOpen: boolean }
  | { type: "hydrateDocument"; document: CanvasDocument }
  | { type: "setDocumentTransient"; document: CanvasDocument; guides?: SnapGuide[] }
  | {
      type: "commitDocument";
      document: CanvasDocument;
      beforeDocument?: CanvasDocument;
      selectedIds?: string[];
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" };

type EditorContextValue = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
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
    hoveredId: null,
    editingTextId: null,
    canvasStageActive: false,
    tool: "select",
    zoom: getInitialZoomForSubjectSize(document.canvas),
    offsetX: 0,
    offsetY: 0,
    guides: [],
    exportOpen: false,
    past: [],
    future: []
  };
}

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "setTool":
      return {
        ...state,
        tool: action.tool,
        isolatedParentId: action.tool === "select" ? state.isolatedParentId : null,
        editingTextId: null
      };
    case "setZoom":
      return {
        ...state,
        zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, action.zoom))
      };
    case "setViewport":
      return {
        ...state,
        zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, action.zoom ?? state.zoom)),
        offsetX: action.offsetX ?? state.offsetX,
        offsetY: action.offsetY ?? state.offsetY
      };
    case "setSelected":
      {
        const selectedIds = sanitizeSelection(state.document, action.selectedIds);
        return {
          ...state,
          selectedIds,
          isolatedParentId: sanitizeIsolatedParent(
            state.document,
            state.isolatedParentId,
            selectedIds,
          ),
          canvasStageActive: selectedIds.length > 0 ? false : state.canvasStageActive,
          editingTextId: null
        };
      }
    case "setIsolatedParent": {
      const isolatedParentId =
        action.isolatedParentId && state.document.elements[action.isolatedParentId]?.children.length
          ? action.isolatedParentId
          : null;
      return {
        ...state,
        selectedIds: isolatedParentId ? [isolatedParentId] : state.selectedIds,
        isolatedParentId,
        canvasStageActive: false,
        editingTextId: null
      };
    }
    case "setHovered":
      return {
        ...state,
        hoveredId: action.hoveredId
      };
    case "setEditingText":
      return {
        ...state,
        editingTextId: action.editingTextId
      };
    case "setCanvasStageActive":
      return {
        ...state,
        canvasStageActive: action.active,
        selectedIds: action.active ? [] : state.selectedIds,
        isolatedParentId: action.active ? null : state.isolatedParentId,
        editingTextId: null
      };
    case "setGuides":
      return {
        ...state,
        guides: action.guides
      };
    case "setExportOpen":
      return {
        ...state,
        exportOpen: action.exportOpen
      };
    case "hydrateDocument":
      return {
        ...state,
        document: constrainAll(action.document),
        selectedIds: [],
        isolatedParentId: null,
        hoveredId: null,
        editingTextId: null,
        canvasStageActive: false,
        zoom: getInitialZoomForSubjectSize(action.document.canvas),
        offsetX: 0,
        offsetY: 0,
        guides: [],
        past: [],
        future: [],
      };
    case "setDocumentTransient":
      return {
        ...state,
        document: action.document,
        selectedIds: sanitizeSelection(action.document, state.selectedIds),
        isolatedParentId: sanitizeIsolatedParent(
          action.document,
          state.isolatedParentId,
          sanitizeSelection(action.document, state.selectedIds),
        ),
        guides: action.guides ?? state.guides
      };
    case "commitDocument": {
      const beforeDocument = action.beforeDocument ?? state.document;
      const selectedIds = sanitizeSelection(action.document, action.selectedIds ?? state.selectedIds);
      const isolatedParentId = sanitizeIsolatedParent(
        action.document,
        state.isolatedParentId,
        selectedIds,
      );

      if (documentsEqual(beforeDocument, action.document)) {
        return {
          ...state,
          document: action.document,
          selectedIds,
          isolatedParentId,
          guides: []
        };
      }

      return {
        ...state,
        document: action.document,
        selectedIds,
        isolatedParentId,
        editingTextId: null,
        guides: [],
        past: limitHistory([...state.past, beforeDocument]),
        future: []
      };
    }
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) {
        return state;
      }
      return {
        ...state,
        document: previous,
        selectedIds: sanitizeSelection(previous, state.selectedIds),
        isolatedParentId: sanitizeIsolatedParent(
          previous,
          state.isolatedParentId,
          sanitizeSelection(previous, state.selectedIds),
        ),
        editingTextId: null,
        guides: [],
        past: state.past.slice(0, -1),
        future: [state.document, ...state.future]
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) {
        return state;
      }
      return {
        ...state,
        document: next,
        selectedIds: sanitizeSelection(next, state.selectedIds),
        isolatedParentId: sanitizeIsolatedParent(
          next,
          state.isolatedParentId,
          sanitizeSelection(next, state.selectedIds),
        ),
        editingTextId: null,
        guides: [],
        past: limitHistory([...state.past, state.document]),
        future: state.future.slice(1)
      };
    }
    case "reset":
      return {
        ...createInitialState(STORAGE_KEY),
        document: createDefaultDocument()
      };
    default:
      return state;
  }
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

  useEffect(() => {
    hydratedRef.current = !persistStorage;
    if (!persistStorage) return;

    let cancelled = false;
    void persistenceStore.get<CanvasDocument>(storageKey).then((stored) => {
      if (cancelled) return;
      hydratedRef.current = true;
      if (stored && isCanvasDocument(stored)) {
        dispatch({ type: "hydrateDocument", document: stored });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [persistStorage, storageKey]);

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

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used inside EditorProvider");
  }
  return context;
}
