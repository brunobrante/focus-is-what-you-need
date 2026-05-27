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
    case "setTool": {
      const isolatedParentId = action.tool === "select" ? state.isolatedParentId : null;
      if (
        state.tool === action.tool &&
        state.isolatedParentId === isolatedParentId &&
        state.editingTextId === null
      ) {
        return state;
      }
      return {
        ...state,
        tool: action.tool,
        isolatedParentId,
        editingTextId: null
      };
    }
    case "setZoom": {
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, action.zoom));
      if (state.zoom === zoom) return state;
      return {
        ...state,
        zoom
      };
    }
    case "setViewport": {
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, action.zoom ?? state.zoom));
      const offsetX = action.offsetX ?? state.offsetX;
      const offsetY = action.offsetY ?? state.offsetY;
      if (state.zoom === zoom && state.offsetX === offsetX && state.offsetY === offsetY) {
        return state;
      }
      return {
        ...state,
        zoom,
        offsetX,
        offsetY
      };
    }
    case "setSelected":
      {
        const selectedIds = sanitizeSelection(state.document, action.selectedIds);
        const isolatedParentId = sanitizeIsolatedParent(
          state.document,
          state.isolatedParentId,
          selectedIds,
        );
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
      }
    case "setIsolatedParent": {
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
      return {
        ...state,
        selectedIds,
        isolatedParentId,
        canvasStageActive: false,
        editingTextId: null
      };
    }
    case "setHovered":
      if (state.hoveredId === action.hoveredId) return state;
      return {
        ...state,
        hoveredId: action.hoveredId
      };
    case "setEditingText":
      if (state.editingTextId === action.editingTextId) return state;
      return {
        ...state,
        editingTextId: action.editingTextId
      };
    case "setCanvasStageActive": {
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
      return {
        ...state,
        canvasStageActive: action.active,
        selectedIds,
        isolatedParentId,
        editingTextId: null
      };
    }
    case "setGuides":
      if (guidesEqual(state.guides, action.guides)) return state;
      return {
        ...state,
        guides: action.guides
      };
    case "setExportOpen":
      if (state.exportOpen === action.exportOpen) return state;
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
      if (
        state.document === action.document &&
        (action.guides === undefined || guidesEqual(state.guides, action.guides))
      ) {
        return state;
      }
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
