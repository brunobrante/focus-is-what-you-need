import { useCallback, useEffect, useRef, useState } from "react";
import type { ReferenceRow } from "@/lib/storage/schema";
import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";
import { listReferenceLibraryMeta } from "@/lib/storage/repos/referenceLibrary.repo";

/**
 * Resolves the image URL for a reference row, with lazy loading via IntersectionObserver.
 *
 * Returns a `{ url, setRef }` pair. Attach `setRef` to the card's root element so
 * the blob is only loaded once the card scrolls into view (300px margin). When
 * `setRef` is never called the hook falls back to loading immediately, preserving
 * the old eager behaviour for inspectors and modals.
 *
 * A card's baked `thumbnailUrl` is a data URL and resolves synchronously.
 * Large originals (>1MB) have no baked thumbnail — those load from the blob store.
 */
export function useReferenceRowImage(
  reference: ReferenceRow | null,
  options: { eager?: boolean } = {},
): { url: string | null; setRef: (el: Element | null) => void } {
  const baked = reference?.thumbnailUrl ?? null;
  const id = reference?.id ?? "";
  const sourceReferenceId = reference?.sourceReferenceId;
  const title = reference?.title ?? "";
  const { eager = false } = options;

  const [resolved, setResolved] = useState<string | null>(baked);
  const elementRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!id) {
      setResolved(null);
      return;
    }
    if (baked) {
      setResolved(baked);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setResolved(null);

    const start = () => {
      void (async () => {
        const blob = await loadReferenceRowBlob({ id, sourceReferenceId, title });
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      })();
    };

    if (eager || typeof IntersectionObserver === "undefined") {
      start();
      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    const element = elementRef.current;
    if (!element) {
      start();
      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            start();
            break;
          }
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [baked, id, sourceReferenceId, title, eager]);

  const setRef = useCallback((element: Element | null) => {
    elementRef.current = element;
  }, []);

  return { url: resolved, setRef };
}

async function loadReferenceRowBlob(reference: {
  id: string;
  sourceReferenceId?: string;
  title: string;
}): Promise<Blob | null> {
  const ext = extFromName(reference.title);

  const directIds = [reference.sourceReferenceId, reference.id].filter(
    (value): value is string => Boolean(value),
  );
  for (const candidateId of directIds) {
    const blob = await loadReferenceFile(candidateId, ext).catch(() => null);
    if (blob) return blob;
  }

  const metas = await listReferenceLibraryMeta().catch(() => []);
  const match =
    metas.find((meta) => meta.id === reference.sourceReferenceId) ??
    metas.find((meta) => meta.id === reference.id) ??
    metas.find((meta) => meta.name === reference.title);
  if (match) {
    const blob = await loadReferenceFile(match.id, match.ext || extFromName(match.name)).catch(
      () => null,
    );
    if (blob) return blob;
  }

  return null;
}
