import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import type { HtmlCanvasDocument } from "@/lib/canvas/htmlScene";

type HistoryOptions = {
  record?: boolean;
};

type UseCanvasHistoryInput = {
  documentKey: string | null;
  setDocument: Dispatch<SetStateAction<HtmlCanvasDocument | null>>;
};

const HISTORY_LIMIT = 80;

export function useCanvasHistory({ documentKey, setDocument }: UseCanvasHistoryInput) {
  const pastRef = useRef<HtmlCanvasDocument[]>([]);
  const futureRef = useRef<HtmlCanvasDocument[]>([]);
  const transactionStartRef = useRef<HtmlCanvasDocument | null>(null);

  useEffect(() => {
    pastRef.current = [];
    futureRef.current = [];
    transactionStartRef.current = null;
  }, [documentKey]);

  const pushPast = useCallback((document: HtmlCanvasDocument) => {
    const past = pastRef.current;
    past.push(document);
    if (past.length > HISTORY_LIMIT) past.shift();
    futureRef.current = [];
  }, []);

  const update = useCallback(
    (
      updater: (current: HtmlCanvasDocument) => HtmlCanvasDocument,
      options: HistoryOptions = {},
    ) => {
      setDocument((current) => {
        if (!current) return current;
        const next = updater(current);
        if (next === current || sameDocumentShape(current, next)) return current;
        if (options.record !== false && !transactionStartRef.current) {
          pushPast(current);
        }
        return next;
      });
    },
    [pushPast, setDocument],
  );

  const commit = useCallback(
    (
      previous: HtmlCanvasDocument | null,
      next: HtmlCanvasDocument,
      options: HistoryOptions = {},
    ) => {
      if (previous && options.record !== false && !sameDocumentShape(previous, next)) {
        pushPast(previous);
      }
      setDocument(next);
    },
    [pushPast, setDocument],
  );

  const beginTransaction = useCallback((document: HtmlCanvasDocument | null) => {
    if (!document || transactionStartRef.current) return;
    transactionStartRef.current = document;
  }, []);

  const endTransaction = useCallback(() => {
    const start = transactionStartRef.current;
    if (!start) return;
    transactionStartRef.current = null;
    setDocument((current) => {
      if (current && !sameDocumentShape(start, current)) {
        pushPast(start);
      }
      return current;
    });
  }, [pushPast, setDocument]);

  const undo = useCallback(() => {
    setDocument((current) => {
      if (!current) return current;
      const previous = pastRef.current.pop();
      if (!previous) return current;
      futureRef.current.push(current);
      transactionStartRef.current = null;
      return previous;
    });
  }, [setDocument]);

  const redo = useCallback(() => {
    setDocument((current) => {
      if (!current) return current;
      const next = futureRef.current.pop();
      if (!next) return current;
      pastRef.current.push(current);
      transactionStartRef.current = null;
      return next;
    });
  }, [setDocument]);

  return {
    beginTransaction,
    commit,
    endTransaction,
    redo,
    undo,
    update,
  };
}

// Structural equality ignoring `updatedAt`, used on every edit (per drag frame).
// A field-by-field walk that short-circuits on the first difference — it replaces
// a `JSON.stringify` of the whole document (twice per call), whose multi-KB string
// allocation + GC pressure dominated the in-memory interaction path (PERF-08).
export function sameDocumentShape(a: HtmlCanvasDocument, b: HtmlCanvasDocument): boolean {
  if (a === b) return true;
  return (
    a.rootId === b.rootId &&
    a.format === b.format &&
    a.version === b.version &&
    a.viewport.width === b.viewport.width &&
    a.viewport.height === b.viewport.height &&
    deepEqual(a.nodes, b.nodes)
  );
}

/**
 * Allocation-free deep equality for plain JSON-shaped values (the canvas nodes are
 * plain objects/arrays from spreads or `JSON.parse`, with no class instances,
 * functions, Dates, or Maps). Uses `for…in` so it never allocates a keys array.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  const aArray = Array.isArray(a);
  const bArray = Array.isArray(b);
  if (aArray || bArray) {
    if (!aArray || !bArray || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!deepEqual(a[index], b[index])) return false;
    }
    return true;
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  let aCount = 0;
  for (const key in aRecord) {
    aCount += 1;
    if (!deepEqual(aRecord[key], bRecord[key])) return false;
  }
  let bCount = 0;
  for (const _key in bRecord) bCount += 1;
  return aCount === bCount;
}
