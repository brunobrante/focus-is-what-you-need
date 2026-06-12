import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";
import { blobToObjectUrl } from "../engine/image";

export type OriginalSlide = {
  id: string;
  name: string;
  ext?: string;
  url?: string;
};

// Full-image object URLs are cached per page session, keyed by reference id, so
// flipping back and forth through the originals does not re-read files.
const originalUrlCache = new Map<string, string>();

// "Mostrar original" view. Shows the imported original image. When the workspace
// holds several originals (a group: Original 1, Original 2, …) it becomes a
// slideshow across them.
export function OriginalSlideshow({
  references,
  initialId,
}: {
  references: OriginalSlide[];
  initialId: string;
}) {
  const startIndex = useMemo(() => {
    const found = references.findIndex((reference) => reference.id === initialId);
    return found >= 0 ? found : 0;
  }, [references, initialId]);

  const [index, setIndex] = useState(startIndex);
  useEffect(() => setIndex(startIndex), [startIndex]);

  const total = references.length;
  const current = references[Math.min(index, total - 1)];
  const [url, setUrl] = useState<string | null>(
    current ? originalUrlCache.get(current.id) ?? current.url ?? null : null,
  );

  useEffect(() => {
    if (!current) return;
    const cached = originalUrlCache.get(current.id) ?? current.url ?? null;
    if (cached) {
      setUrl(cached);
      return;
    }
    setUrl(null);
    let cancelled = false;
    void loadReferenceFile(current.id, current.ext || extFromName(current.name))
      .then((blob) => (blob ? blobToObjectUrl(blob) : null))
      .then((loaded) => {
        if (!loaded) return;
        if (originalUrlCache.has(current.id)) {
          if (loaded.startsWith("blob:")) URL.revokeObjectURL(loaded);
        } else {
          originalUrlCache.set(current.id, loaded);
        }
        if (!cancelled) setUrl(originalUrlCache.get(current.id) ?? loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.ext, current?.name, current?.url]);

  if (!current) return null;
  const multiple = total > 1;
  const go = (direction: number) => setIndex((i) => (i + direction + total) % total);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {multiple ? (
        <button
          type="button"
          aria-label="Previous original"
          onClick={() => go(-1)}
          className="absolute left-4 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[rgba(14,14,15,0.85)] text-[var(--text)] backdrop-blur hover:bg-[var(--surface-hover)]"
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}

      {url ? (
        <img
          src={url}
          alt={current.name}
          draggable={false}
          className="block max-h-[calc(100vh-220px)] max-w-full rounded-[8px] object-contain shadow-[0_14px_60px_rgba(0,0,0,0.55)]"
        />
      ) : (
        <Loader2 size={20} strokeWidth={1.8} className="animate-spin text-[var(--text-faint)]" />
      )}

      {multiple ? (
        <button
          type="button"
          aria-label="Next original"
          onClick={() => go(1)}
          className="absolute right-4 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[rgba(14,14,15,0.85)] text-[var(--text)] backdrop-blur hover:bg-[var(--surface-hover)]"
        >
          <ChevronRight size={16} />
        </button>
      ) : null}

      {multiple ? (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--border-strong)] bg-[rgba(14,14,15,0.85)] px-3 py-1 text-[11px] tabular-nums text-[var(--text-muted)] backdrop-blur">
          Original {index + 1} · {index + 1} / {total}
        </div>
      ) : null}
    </div>
  );
}
