import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  createDefaultHtmlCanvasDocument,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import { saveScene } from "@/application/scenes/saveScene";
import type { ProjectType } from "@/lib/data/types";
import type { ScreenRow, VariantRow } from "@/lib/storage/schema";

export type HtmlCanvasTarget =
  | { kind: "screen"; row: ScreenRow }
  | { kind: "variant"; row: VariantRow };

export type HtmlCanvasDocumentState = {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  document: HtmlCanvasDocument | null;
  setDocument: Dispatch<SetStateAction<HtmlCanvasDocument | null>>;
};

export function useHtmlCanvasDocument(
  target: HtmlCanvasTarget | null,
  existingGraphJSON: string | null | undefined,
  projectType: ProjectType,
  label: string,
): HtmlCanvasDocumentState {
  const [document, setDocument] = useState<HtmlCanvasDocument | null>(null);
  const [status, setStatus] = useState<HtmlCanvasDocumentState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  // The latest serialized document not yet persisted, with the owner it belongs
  // to. Lets the owner-change/unmount effect flush it instead of dropping it.
  const pendingRef = useRef<{ ownerId: string; graphJSON: string } | null>(null);

  const ownerKey = useMemo(() => {
    if (!target) return null;
    return `${target.kind}:${target.row.id}`;
  }, [target]);

  useEffect(() => {
    if (!target) {
      setDocument(null);
      setStatus("idle");
      setError(null);
      lastSavedRef.current = null;
      return;
    }
    if (existingGraphJSON === undefined) {
      setDocument(null);
      setStatus("loading");
      setError(null);
      return;
    }

    try {
      const parsed = htmlCanvasDocumentFromJSON(existingGraphJSON);
      const next =
        parsed ??
        createDefaultHtmlCanvasDocument({
          name: label,
          projectType,
          targetKind: target.kind,
        });
      const serialized = serializeHtmlCanvasDocument(next);
      setDocument(next);
      setStatus("ready");
      setError(null);
      lastSavedRef.current = existingGraphJSON === serialized ? serialized : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDocument(null);
      setStatus("error");
      setError(message);
    }
  }, [existingGraphJSON, label, projectType, target]);

  useEffect(() => {
    if (!target || !document || status !== "ready" || !ownerKey) return;

    const serialized = serializeHtmlCanvasDocument(document);
    if (serialized === lastSavedRef.current) {
      pendingRef.current = null;
      return;
    }

    const ownerId = target.kind === "screen" ? target.row.activeVariantId : target.row.id;
    pendingRef.current = { ownerId, graphJSON: serialized };

    const timeout = window.setTimeout(() => {
      // Fire-and-forget into the save queue. Persistence failure becomes queue
      // state (retry/backoff) — it must never surface as a document error. A
      // screen's scene lives on its active variant.
      saveScene({ ownerType: "variant", ownerId, graphJSON: serialized });
      lastSavedRef.current = serialized;
      pendingRef.current = null;
    }, 350);

    // Clearing on every document edit is what makes the debounce work; the
    // pending edit is preserved in pendingRef and flushed by the effect below
    // only when the owner actually changes or the hook unmounts.
    return () => window.clearTimeout(timeout);
  }, [document, ownerKey, status, target]);

  // Flush the last unsaved edit when the owner changes or on unmount, so a fast
  // navigation inside the 350ms debounce window doesn't silently drop it.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current;
      if (pending && pending.graphJSON !== lastSavedRef.current) {
        saveScene({ ownerType: "variant", ownerId: pending.ownerId, graphJSON: pending.graphJSON });
        lastSavedRef.current = pending.graphJSON;
      }
      pendingRef.current = null;
    };
  }, [ownerKey]);

  return { status, error, document, setDocument };
}
