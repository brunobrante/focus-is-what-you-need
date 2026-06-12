import { useState } from "react";
import { ChevronRight, Plus, SquareDashed } from "lucide-react";
import type { SavedComponent } from "../engine/types";

export function RootSwitcher({
  roots,
  activeRootId,
  cutCountByRoot,
  onSelect,
  onNewRoot,
  creating,
}: {
  roots: SavedComponent[];
  activeRootId: string;
  cutCountByRoot: Map<string, number>;
  onSelect: (id: string) => void;
  onNewRoot: () => void;
  creating: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={open ? "Collapse stacks" : "Expand stacks"}
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
            Stacks
          </span>
          {!open && roots.length > 0 ? (
            <span className="ml-1 rounded-full bg-[var(--surface)] px-1.5 py-px text-[9px] tabular-nums text-[var(--text-faint)]">
              {roots.length}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="New stack"
          title="Create a new stack from the original image"
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
          {roots.map((root) => {
            const active = root.id === activeRootId;
            const count = cutCountByRoot.get(root.id) ?? 0;
            return (
              <button
                key={root.id}
                type="button"
                onClick={() => onSelect(root.id)}
                title={root.name}
                className={[
                  "group relative flex w-[72px] shrink-0 flex-col gap-1 rounded-[8px] border p-1 text-left transition-colors duration-[120ms]",
                  active
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

          {roots.length === 0 ? (
            <div className="flex h-[72px] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-[var(--border)] text-[10.5px] text-[var(--text-faint)]">
              <SquareDashed size={13} strokeWidth={1.7} />
              No stacks yet
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
