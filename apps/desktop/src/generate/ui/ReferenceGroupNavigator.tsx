import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FolderOpen, Image as ImageIcon, Loader2, Upload } from "lucide-react";

import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";
import type { ToolReferenceGroupContext } from "../types";
import { blobToObjectUrl } from "../engine/image";

export function ReferenceGroupNavigator({
  group,
  activeReferenceId,
  onToggleCollapse,
  onUpload,
  uploading = false,
}: {
  group: ToolReferenceGroupContext;
  activeReferenceId: string;
  onToggleCollapse?: () => void;
  onUpload?: () => void;
  uploading?: boolean;
}) {
  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elev)]">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
            <FolderOpen size={14} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-[12.5px] font-semibold text-[var(--text)]">
              {group.name}
            </h2>
            <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">
              {group.references.length} {group.references.length === 1 ? "screen" : "screens"}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse group panel"
            className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[7px] border border-transparent text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <div className="flex flex-col gap-1.5">
          {group.references.map((reference) => {
            const active = reference.id === activeReferenceId;
            return (
              <Link
                key={reference.id}
                to={`/tools?id=${encodeURIComponent(reference.id)}&groupId=${encodeURIComponent(group.id)}`}
                className={[
                  "flex min-w-0 gap-2 rounded-[10px] border p-1.5 text-left text-inherit no-underline transition-colors",
                  active
                    ? "border-[var(--border-strong)] bg-[var(--surface)]"
                    : "border-transparent bg-transparent hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.02)]",
                ].join(" ")}
              >
                <ReferenceGroupNavigatorThumbnail reference={reference} />
                <span className="min-w-0 flex-1 py-0.5">
                  <span className="block truncate text-[12px] font-medium text-[var(--text)]">
                    {reference.name}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] tabular-nums text-[var(--text-faint)]">
                    {reference.w} x {reference.h}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {onUpload ? (
        <div className="shrink-0 border-t border-[var(--border)] p-2.5">
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] py-2 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={13} strokeWidth={1.8} className="animate-spin" />
            ) : (
              <Upload size={13} strokeWidth={1.8} />
            )}
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      ) : null}
    </aside>
  );
}

// Object URLs for thumbnails are cached for the page session, keyed by
// reference id. Switching the active image (or revisiting a group) reuses the
// already-decoded thumbnail instead of re-reading the file from disk.
const thumbnailUrlCache = new Map<string, string>();

function ReferenceGroupNavigatorThumbnail({
  reference,
}: {
  reference: ToolReferenceGroupContext["references"][number];
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const initialUrl = thumbnailUrlCache.get(reference.id) ?? reference.url ?? null;
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [shouldLoad, setShouldLoad] = useState(Boolean(initialUrl));

  useEffect(() => {
    if (thumbnailUrlCache.has(reference.id) || reference.url) {
      setShouldLoad(true);
      return;
    }

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reference.id, reference.url]);

  useEffect(() => {
    const cachedUrl = thumbnailUrlCache.get(reference.id) ?? reference.url ?? null;
    if (cachedUrl) {
      setUrl(cachedUrl);
      return;
    }
    if (!shouldLoad) return;

    let cancelled = false;
    void loadReferenceNavigatorThumbnail(reference).then((loadedUrl) => {
      if (!loadedUrl) return;
      // Cache for reuse; if a concurrent load already won the slot, drop ours.
      if (thumbnailUrlCache.has(reference.id)) {
        revokeObjectUrl(loadedUrl);
      } else {
        thumbnailUrlCache.set(reference.id, loadedUrl);
      }
      if (!cancelled) setUrl(thumbnailUrlCache.get(reference.id) ?? loadedUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [reference.ext, reference.id, reference.name, reference.url, shouldLoad]);

  return (
    <span
      ref={containerRef}
      className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text-faint)]"
    >
      {url ? (
        <img
          src={url}
          alt={reference.name}
          draggable={false}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <ImageIcon size={16} strokeWidth={1.6} />
      )}
    </span>
  );
}

async function loadReferenceNavigatorThumbnail(
  reference: ToolReferenceGroupContext["references"][number],
): Promise<string | null> {
  const blob = await loadReferenceFile(reference.id, reference.ext || extFromName(reference.name)).catch(
    () => null,
  );
  return blob ? blobToObjectUrl(blob) : null;
}

function revokeObjectUrl(url: string | null | undefined) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}
