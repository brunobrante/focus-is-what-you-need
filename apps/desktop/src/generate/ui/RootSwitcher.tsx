import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, SquareDashed, Star, Trash2 } from "lucide-react";
import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";
import { blobToDataUrl, blobToObjectUrl } from "../engine/image";
import type {
  NewScreenSource,
  SavedComponent,
  ToolReferenceGroupItem,
} from "../engine/types";

export function RootSwitcher({
  roots,
  activeRootId,
  activeReferenceId,
  primaryRootId,
  cutCountByRoot,
  onSelect,
  onSetPrimary,
  onDelete,
  onNewRoot,
  creating,
  groupReferences = [],
  groupId,
}: {
  roots: SavedComponent[];
  activeRootId: string;
  activeReferenceId?: string;
  primaryRootId?: string;
  cutCountByRoot: Map<string, number>;
  onSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onDelete: (id: string) => void;
  onNewRoot: (source?: NewScreenSource) => void;
  creating: boolean;
  groupReferences?: ToolReferenceGroupItem[];
  groupId?: string;
}) {
  const [open, setOpen] = useState(true);
  // "+ New" opens a picker of which original to copy the new screen from. The
  // sources are the group's reference images (one original each).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resolvingSourceId, setResolvingSourceId] = useState<string | null>(null);

  // Stable total count: roots of active ref + one slot per inactive ref in the group.
  const inactiveRefs = groupReferences.filter((r) => r.id !== activeReferenceId);
  const totalCount = roots.length + inactiveRefs.length;

  // The active reference's original image lives on its default root, so a new
  // screen copied from it can be seeded synchronously without a disk read.
  const activeOriginalUrl = roots.find((root) => root.isDefaultRoot)?.dataUrl;

  // Create a new screen from the chosen original. The active reference seeds from
  // its in-memory default root; other references are loaded from disk on demand.
  async function pickSource(ref: ToolReferenceGroupItem) {
    setPickerOpen(false);
    if (ref.id === activeReferenceId) {
      if (activeOriginalUrl) {
        onNewRoot({ url: activeOriginalUrl, w: ref.w, h: ref.h, type: ref.type, name: ref.name });
      } else {
        onNewRoot();
      }
      return;
    }
    setResolvingSourceId(ref.id);
    try {
      const blob = await loadReferenceFile(ref.id, ref.ext || extFromName(ref.name)).catch(() => null);
      if (!blob) return;
      const url = await blobToDataUrl(blob);
      onNewRoot({ url, w: ref.w, h: ref.h, type: ref.type, name: ref.name });
    } finally {
      setResolvingSourceId(null);
    }
  }

  // One original → create directly. Multiple → open the picker so the user
  // chooses which original to copy from. No group metadata → fall back to the
  // active reference's original (the hook's default source).
  function handleNewClick() {
    if (groupReferences.length === 0) {
      onNewRoot();
      return;
    }
    if (groupReferences.length === 1) {
      void pickSource(groupReferences[0]);
      return;
    }
    setPickerOpen((value) => !value);
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={open ? "Collapse screens" : "Expand screens"}
            onClick={() => setOpen((v) => !v)}
            className="grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[4px] text-[var(--text-faint)] hover:text-[var(--text-muted)]"
          >
            <ChevronRight
              size={12}
              strokeWidth={2.2}
              className={open ? "rotate-90 transition-transform duration-[120ms]" : "transition-transform duration-[120ms]"}
            />
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[var(--text-faint)]">
            Screens
          </span>
          {!open && totalCount > 0 ? (
            <span className="ml-1 rounded-full bg-[var(--surface)] px-1.5 py-px text-[9px] tabular-nums text-[var(--text-faint)]">
              {totalCount}
            </span>
          ) : null}
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label="New screen"
            title="Create a new screen from an original image"
            onClick={handleNewClick}
            className={[
              "inline-flex h-6 cursor-pointer items-center gap-1 rounded-[6px] border px-1.5 text-[10.5px] font-medium transition-colors duration-[120ms]",
              creating || pickerOpen
                ? "border-[#4C8DFF] bg-[rgba(76,141,255,0.12)] text-[#4C8DFF]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            <Plus size={11} strokeWidth={2} />
            New
          </button>

          {pickerOpen ? (
            <>
              {/* Click-away backdrop closes the picker. */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setPickerOpen(false)}
              />
              <div className="absolute right-0 top-7 z-50 w-[208px] overflow-hidden rounded-[9px] border border-[var(--border-strong)] bg-[var(--bg-elev)] py-1 shadow-[0_12px_36px_rgba(0,0,0,0.45)]">
                <p className="m-0 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.4px] text-[var(--text-faint)]">
                  Copy from original
                </p>
                {groupReferences.map((ref) => (
                  <button
                    key={ref.id}
                    type="button"
                    disabled={resolvingSourceId != null}
                    onClick={() => void pickSource(ref)}
                    className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ReferenceThumbnail
                      reference={ref}
                      className="h-9 w-9 shrink-0 rounded-[5px] border border-[var(--border)] bg-[#0E0E0E]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-[var(--text)]">
                        {ref.name}
                      </span>
                      <span className="block text-[9.5px] tabular-nums text-[var(--text-faint)]">
                        {ref.w} × {ref.h}
                        {ref.id === activeReferenceId ? " · current" : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {groupReferences.length > 1
            ? // Group mode: iterate in stable group order.
              groupReferences.map((ref) => {
                if (ref.id === activeReferenceId) {
                  // Active reference: render its roots.
                  return roots.map((root) => (
                    <RootCard
                      key={root.id}
                      root={root}
                      isActive={root.id === activeRootId}
                      isPrimary={root.id === primaryRootId}
                      count={cutCountByRoot.get(root.id) ?? 0}
                      onSelect={onSelect}
                      onSetPrimary={onSetPrimary}
                      onDelete={onDelete}
                    />
                  ));
                }
                // Inactive reference: navigation card.
                return (
                  <Link
                    key={ref.id}
                    to={`/tools?id=${encodeURIComponent(ref.id)}${groupId ? `&groupId=${encodeURIComponent(groupId)}` : ""}`}
                    title={ref.name}
                    className="group relative flex w-[72px] shrink-0 flex-col gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg-elev)] p-1 text-left text-inherit no-underline transition-colors duration-[120ms] hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
                  >
                    <ReferenceThumbnail reference={ref} />
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text-muted)]">
                        {ref.name}
                      </span>
                    </div>
                  </Link>
                );
              })
            : // Single reference: show roots only.
              roots.map((root) => (
                <RootCard
                  key={root.id}
                  root={root}
                  isActive={root.id === activeRootId}
                  isPrimary={root.id === primaryRootId}
                  count={cutCountByRoot.get(root.id) ?? 0}
                  onSelect={onSelect}
                  onSetPrimary={onSetPrimary}
                  onDelete={onDelete}
                />
              ))}

          {totalCount === 0 ? (
            <div className="flex h-[72px] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-[var(--border)] text-[10.5px] text-[var(--text-faint)]">
              <SquareDashed size={13} strokeWidth={1.7} />
              No screens yet
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RootCard({
  root,
  isActive,
  isPrimary,
  count,
  onSelect,
  onSetPrimary,
  onDelete,
}: {
  root: SavedComponent;
  isActive: boolean;
  isPrimary: boolean;
  count: number;
  onSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const label = root.isDefaultRoot ? "Full image" : root.name;
  return (
    <div className="group relative w-[72px] shrink-0">
      <button
        type="button"
        onClick={() => onSelect(root.id)}
        title={label}
        className={[
          "flex w-full flex-col gap-1 rounded-[8px] border p-1 text-left transition-colors duration-[120ms]",
          isActive
            ? "border-[var(--text)] bg-[var(--surface)]"
            : "border-[var(--border)] bg-[var(--bg-elev)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)]",
        ].join(" ")}
      >
        <div
          className="h-[52px] w-full rounded-[5px] border border-[var(--border)] bg-[#0E0E0E] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${root.dataUrl}")` }}
        />
        <div className="flex min-w-0 items-center justify-between gap-1">
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text)]">
            {label}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--surface)] px-1 text-[9px] tabular-nums text-[var(--text-faint)]">
            {count}
          </span>
        </div>
      </button>

      {/* Main-screen toggle. The primary screen is shown on the front of the
          reference card; exactly one screen can be main. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSetPrimary(root.id);
        }}
        aria-pressed={isPrimary}
        title={isPrimary ? "Main screen — shown on the card" : "Set as main screen"}
        className={[
          "absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full border bg-[rgba(0,0,0,0.55)] backdrop-blur-[2px] transition-all duration-[120ms]",
          isPrimary
            ? "border-[#F5C24C] text-[#F5C24C] opacity-100"
            : "border-[var(--border-strong)] text-[var(--text-muted)] opacity-0 hover:text-[var(--text)] group-hover:opacity-100",
        ].join(" ")}
      >
        <Star size={11} strokeWidth={1.8} fill={isPrimary ? "currentColor" : "none"} />
      </button>

      {/* Delete this screen and its crops. Revealed on hover. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(root.id);
        }}
        aria-label="Delete screen"
        title="Delete screen"
        className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full border border-[var(--border-strong)] bg-[rgba(0,0,0,0.55)] text-[var(--text-muted)] opacity-0 backdrop-blur-[2px] transition-all duration-[120ms] hover:border-[#F2555A] hover:text-[#F2555A] group-hover:opacity-100"
      >
        <Trash2 size={11} strokeWidth={1.8} />
      </button>
    </div>
  );
}

const thumbnailCache = new Map<string, string>();

function ReferenceThumbnail({
  reference,
  className,
}: {
  reference: ToolReferenceGroupItem;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(
    thumbnailCache.get(reference.id) ?? reference.url ?? null,
  );

  useEffect(() => {
    const cached = thumbnailCache.get(reference.id) ?? reference.url ?? null;
    if (cached) { setUrl(cached); return; }

    let cancelled = false;
    void loadReferenceFile(reference.id, reference.ext || extFromName(reference.name))
      .then((blob) => (blob ? blobToObjectUrl(blob) : null))
      .then((loaded) => {
        if (!loaded) return;
        const existing = thumbnailCache.get(reference.id);
        // Another instance already cached one (concurrent load), or this component
        // was cancelled before it could use the URL — either way `loaded` never
        // enters the cache, so revoke it instead of leaking the blob.
        if (existing) {
          if (existing !== loaded) URL.revokeObjectURL(loaded);
          if (!cancelled) setUrl(existing);
          return;
        }
        if (cancelled) { URL.revokeObjectURL(loaded); return; }
        thumbnailCache.set(reference.id, loaded);
        setUrl(loaded);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reference.id, reference.ext, reference.name, reference.url]);

  return (
    <div
      className={[
        className ?? "h-[52px] w-full rounded-[5px] border border-[var(--border)] bg-[#0E0E0E]",
        "bg-contain bg-center bg-no-repeat",
      ].join(" ")}
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
    />
  );
}
