import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Image as ImageIcon, Loader2, Plus, Upload } from "lucide-react";

import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";
import { blobToObjectUrl } from "../engine/image";
import type { SavedComponent, ToolReferenceGroupContext } from "../engine/types";

type ImageRef = { id: string; name: string; ext?: string; url?: string };

// The unified Screens panel. One image is one screen; an image can hold several
// screens (its roots). A group bundles multiple images. This panel replaces the
// old split UI (left group navigator + right "Stacks" switcher) with a single
// list: the open image's screens (selectable) plus the group's other images
// (navigable). A stack is just what a screen contains — it has no identity here.
export function ScreensPanel({
  group,
  activeReferenceId,
  roots,
  activeRootId,
  cutCountByRoot,
  onSelectRoot,
  onNewScreen,
  onUpload,
  uploading = false,
}: {
  group: ToolReferenceGroupContext | null;
  activeReferenceId: string;
  roots: SavedComponent[];
  activeRootId: string;
  cutCountByRoot: Map<string, number>;
  onSelectRoot: (id: string) => void;
  onNewScreen: () => void;
  onUpload?: () => void;
  uploading?: boolean;
}) {
  const references = group?.references ?? [];
  const isGroup = references.length > 1;
  const otherReferences = references.filter((reference) => reference.id !== activeReferenceId);
  // When several images share a group their originals are addressed positionally:
  // Original 1, Original 2, … in import order.
  const originalLabelById = new Map<string, string>();
  if (isGroup) {
    references.forEach((reference, index) => {
      originalLabelById.set(reference.id, `Original ${index + 1}`);
    });
  }
  const screenCount = roots.length + otherReferences.length;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[var(--text-faint)]">
            Screens
          </span>
          <span className="rounded-full bg-[var(--surface)] px-1.5 py-px text-[9px] tabular-nums text-[var(--text-faint)]">
            {screenCount}
          </span>
        </div>
        <button
          type="button"
          aria-label="New screen"
          title="Create a new screen from the original image"
          onClick={onNewScreen}
          className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-1.5 text-[10.5px] font-medium text-[var(--text-muted)] transition-colors duration-[120ms] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        >
          <Plus size={11} strokeWidth={2} />
          New
        </button>
      </div>

      <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto">
        {/* Screens of the open image — its roots. */}
        {roots.map((root) => {
          const active = root.id === activeRootId;
          const count = cutCountByRoot.get(root.id) ?? 0;
          const label = root.isDefaultRoot
            ? originalLabelById.get(activeReferenceId) ?? "Full image"
            : root.name;
          return (
            <button
              key={root.id}
              type="button"
              onClick={() => onSelectRoot(root.id)}
              title={label}
              className={[
                "flex min-w-0 items-center gap-2 rounded-[9px] border p-1.5 text-left transition-colors",
                active
                  ? "border-[var(--text)] bg-[var(--surface)]"
                  : "border-transparent bg-transparent hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.02)]",
              ].join(" ")}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[7px] border border-[var(--border)] bg-[#0E0E0E] text-[var(--text-faint)]">
                {root.dataUrl ? (
                  <img
                    src={root.dataUrl}
                    alt={label}
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImageIcon size={15} strokeWidth={1.6} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[var(--text)]">
                  {label}
                </span>
                <span className="mt-0.5 block text-[10.5px] tabular-nums text-[var(--text-faint)]">
                  {count} {count === 1 ? "cut" : "cuts"}
                </span>
              </span>
            </button>
          );
        })}

        {/* Other images in the group — each is its own screen; open to edit it. */}
        {otherReferences.length > 0 ? (
          <>
            <div className="mt-1 px-1 text-[9.5px] font-semibold uppercase tracking-[0.4px] text-[var(--text-faint)]">
              Other images
            </div>
            {otherReferences.map((reference) => (
              <Link
                key={reference.id}
                to={`/tools?id=${encodeURIComponent(reference.id)}&groupId=${encodeURIComponent(group!.id)}`}
                title={reference.name}
                className="flex min-w-0 items-center gap-2 rounded-[9px] border border-transparent p-1.5 text-left text-inherit no-underline transition-colors hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.02)]"
              >
                <ScreenImageThumbnail reference={reference} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-[var(--text)]">
                    {originalLabelById.get(reference.id) ?? reference.name}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] tabular-nums text-[var(--text-faint)]">
                    {reference.w} × {reference.h}
                  </span>
                </span>
              </Link>
            ))}
          </>
        ) : null}

      </div>

      {onUpload ? (
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] py-1.5 text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 size={12} strokeWidth={1.8} className="animate-spin" />
          ) : (
            <Upload size={12} strokeWidth={1.8} />
          )}
          {uploading ? "Uploading…" : "Add image"}
        </button>
      ) : null}
    </div>
  );
}

// Object URLs for group-image thumbnails are cached per page session, keyed by
// reference id, so switching images reuses the decoded thumbnail.
const thumbnailUrlCache = new Map<string, string>();

function ScreenImageThumbnail({
  reference,
}: {
  reference: ImageRef;
}) {
  const initialUrl = thumbnailUrlCache.get(reference.id) ?? reference.url ?? null;
  const [url, setUrl] = useState<string | null>(initialUrl);

  useEffect(() => {
    const cached = thumbnailUrlCache.get(reference.id) ?? reference.url ?? null;
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    void loadReferenceFile(reference.id, reference.ext || extFromName(reference.name))
      .then((blob) => (blob ? blobToObjectUrl(blob) : null))
      .then((loaded) => {
        if (!loaded) return;
        if (thumbnailUrlCache.has(reference.id)) {
          if (loaded.startsWith("blob:")) URL.revokeObjectURL(loaded);
        } else {
          thumbnailUrlCache.set(reference.id, loaded);
        }
        if (!cancelled) setUrl(thumbnailUrlCache.get(reference.id) ?? loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reference.ext, reference.id, reference.name, reference.url]);

  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text-faint)]">
      {url ? (
        <img
          src={url}
          alt={reference.name}
          draggable={false}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
        />
      ) : (
        <ImageIcon size={15} strokeWidth={1.6} />
      )}
    </span>
  );
}
