import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, SquareDashed } from "lucide-react";
import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";
import { blobToObjectUrl } from "../engine/image";
import type { SavedComponent, ToolReferenceGroupItem } from "../engine/types";

export function RootSwitcher({
  roots,
  activeRootId,
  activeReferenceId,
  cutCountByRoot,
  onSelect,
  onNewRoot,
  creating,
  groupReferences = [],
  groupId,
}: {
  roots: SavedComponent[];
  activeRootId: string;
  activeReferenceId?: string;
  cutCountByRoot: Map<string, number>;
  onSelect: (id: string) => void;
  onNewRoot: () => void;
  creating: boolean;
  groupReferences?: ToolReferenceGroupItem[];
  groupId?: string;
}) {
  const [open, setOpen] = useState(true);

  // Stable total count: roots of active ref + one slot per inactive ref in the group.
  const inactiveRefs = groupReferences.filter((r) => r.id !== activeReferenceId);
  const totalCount = roots.length + inactiveRefs.length;

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
        <button
          type="button"
          aria-label="New screen"
          title="Create a new screen from the original image"
          onClick={onNewRoot}
          className={[
            "inline-flex h-6 cursor-pointer items-center gap-1 rounded-[6px] border px-1.5 text-[10.5px] font-medium transition-colors duration-[120ms]",
            creating
              ? "border-[#4C8DFF] bg-[rgba(76,141,255,0.12)] text-[#4C8DFF]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
          ].join(" ")}
        >
          <Plus size={11} strokeWidth={2} />
          New
        </button>
      </div>

      {open ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {groupReferences.length > 1
            ? // Group mode: iterate in stable group order.
              groupReferences.map((ref) => {
                if (ref.id === activeReferenceId) {
                  // Active reference: render its roots.
                  return roots.map((root) => {
                    const isActive = root.id === activeRootId;
                    const count = cutCountByRoot.get(root.id) ?? 0;
                    return (
                      <button
                        key={root.id}
                        type="button"
                        onClick={() => onSelect(root.id)}
                        title={root.isDefaultRoot ? "Full image" : root.name}
                        className={[
                          "group relative flex w-[72px] shrink-0 flex-col gap-1 rounded-[8px] border p-1 text-left transition-colors duration-[120ms]",
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
                            {root.isDefaultRoot ? "Full image" : root.name}
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--surface)] px-1 text-[9px] tabular-nums text-[var(--text-faint)]">
                            {count}
                          </span>
                        </div>
                      </button>
                    );
                  });
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
              roots.map((root) => {
                const isActive = root.id === activeRootId;
                const count = cutCountByRoot.get(root.id) ?? 0;
                return (
                  <button
                    key={root.id}
                    type="button"
                    onClick={() => onSelect(root.id)}
                    title={root.isDefaultRoot ? "Full image" : root.name}
                    className={[
                      "group relative flex w-[72px] shrink-0 flex-col gap-1 rounded-[8px] border p-1 text-left transition-colors duration-[120ms]",
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
                        {root.isDefaultRoot ? "Full image" : root.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--surface)] px-1 text-[9px] tabular-nums text-[var(--text-faint)]">
                        {count}
                      </span>
                    </div>
                  </button>
                );
              })}

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

const thumbnailCache = new Map<string, string>();

function ReferenceThumbnail({ reference }: { reference: ToolReferenceGroupItem }) {
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
        if (!loaded || cancelled) return;
        if (!thumbnailCache.has(reference.id)) thumbnailCache.set(reference.id, loaded);
        if (!cancelled) setUrl(thumbnailCache.get(reference.id) ?? loaded);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reference.id, reference.ext, reference.name, reference.url]);

  return (
    <div
      className="h-[52px] w-full rounded-[5px] border border-[var(--border)] bg-[#0E0E0E] bg-contain bg-center bg-no-repeat"
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
    />
  );
}
