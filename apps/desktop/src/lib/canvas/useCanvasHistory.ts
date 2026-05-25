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

function sameDocumentShape(a: HtmlCanvasDocument, b: HtmlCanvasDocument): boolean {
  return stripUpdatedAt(a) === stripUpdatedAt(b);
}

function stripUpdatedAt(document: HtmlCanvasDocument): string {
  return JSON.stringify({ ...document, updatedAt: 0 });
}
