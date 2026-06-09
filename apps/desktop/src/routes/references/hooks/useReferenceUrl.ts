import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadReferenceUrl,
  peekReferenceUrl,
} from "@/lib/references/referenceUrlCache";

type LoadableReference = {
  id: string;
  ext?: string;
  name: string;
};

type Options = {
  /** Load immediately on mount instead of waiting for the element to scroll into view. */
  eager?: boolean;
  /** When false, skip loading entirely (e.g. a stack thumbnail already covers this card). */
  enabled?: boolean;
};

/**
 * Resolves a reference's object URL lazily. Grid cards pass the returned `setRef`
 * to their root element so the file is only read from disk once the card scrolls
 * near the viewport; modals pass `{ eager: true }` to load as soon as they open.
 */
export function useReferenceUrl(
  item: LoadableReference | null | undefined,
  options: Options = {},
): { url: string; setRef: (element: Element | null) => void } {
  const { eager = false, enabled = true } = options;
  const id = item?.id ?? null;
  const [url, setUrl] = useState<string>(() => (id ? peekReferenceUrl(id) ?? "" : ""));
  const elementRef = useRef<Element | null>(null);

  // Re-sync to whatever the cache already holds whenever the subject changes.
  useEffect(() => {
    setUrl(id ? peekReferenceUrl(id) ?? "" : "");
  }, [id]);

  useEffect(() => {
    if (!item || !enabled) return;

    const cached = peekReferenceUrl(item.id);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    const start = () => {
      void loadReferenceUrl(item).then((resolved) => {
        if (!cancelled && resolved) setUrl(resolved);
      });
    };

    if (eager || typeof IntersectionObserver === "undefined") {
      start();
      return () => {
        cancelled = true;
      };
    }

    const element = elementRef.current;
    if (!element) {
      // No element to observe — fall back to loading right away.
      start();
      return () => {
        cancelled = true;
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
    };
    // `id` captures the meaningful change; `item`'s object identity churns each
    // render and is read fresh inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, eager, enabled]);

  const setRef = useCallback((element: Element | null) => {
    elementRef.current = element;
  }, []);

  return { url, setRef };
}
