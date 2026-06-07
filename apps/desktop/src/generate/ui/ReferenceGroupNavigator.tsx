import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, Image as ImageIcon } from "lucide-react";

import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";
import type { ToolReferenceGroupContext } from "../types";
import { blobToObjectUrl } from "../engine/image";

export function ReferenceGroupNavigator({
  group,
  activeReferenceId,
}: {
  group: ToolReferenceGroupContext;
  activeReferenceId: string;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elev)]">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
            <FolderOpen size={14} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[12.5px] font-semibold text-[var(--text)]">
              {group.name}
            </h2>
            <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">
              {group.references.length} {group.references.length === 1 ? "screen" : "screens"}
            </p>
          </div>
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
                  {active ? (
                    <span className="mt-1 inline-flex rounded-[4px] border border-[var(--border)] px-1.5 py-[2px] text-[9.5px] uppercase tracking-[0.4px] text-[var(--text-muted)]">
                      Open
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ReferenceGroupNavigatorThumbnail({
  reference,
}: {
  reference: ToolReferenceGroupContext["references"][number];
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState(reference.url ?? null);
  const [shouldLoad, setShouldLoad] = useState(Boolean(reference.url));

  useEffect(() => {
    if (reference.url) {
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
    let loadedObjectUrl: string | null = null;
    setUrl(reference.url ?? null);
    if (reference.url || !shouldLoad) return;

    let cancelled = false;
    void loadReferenceNavigatorThumbnail(reference).then((loadedUrl) => {
      if (cancelled) {
        revokeObjectUrl(loadedUrl);
        return;
      }
      loadedObjectUrl = loadedUrl;
      setUrl(loadedUrl);
    });

    return () => {
      cancelled = true;
      revokeObjectUrl(loadedObjectUrl);
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
