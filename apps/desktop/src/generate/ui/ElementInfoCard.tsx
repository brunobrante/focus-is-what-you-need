import { Image as ImageIcon, Layers } from "lucide-react";

export function ElementInfoCard({
  name,
  width,
  height,
  type,
  showBecomeRoot = false,
  onBecomeRoot,
}: {
  name: string;
  width: number;
  height: number;
  type: string;
  showBecomeRoot?: boolean;
  onBecomeRoot?: () => void;
}) {
  return (
    <div
      data-selection-action
      className="absolute left-3 top-3 z-30 w-[210px] rounded-[12px] border border-[var(--border)] bg-[rgba(20,20,22,0.88)] p-2.5 shadow-[0_10px_34px_rgba(0,0,0,0.35)] backdrop-blur-[8px]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
          <ImageIcon size={12} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
            <span className="min-w-0 max-w-[76px] truncate font-semibold text-[var(--text)]">{name}</span>
            <span className="shrink-0 text-[var(--text-faint)]">·</span>
            <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{Math.round(width)} × {Math.round(height)}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11.5px] font-medium text-[var(--text-muted)]">
          {type}
        </span>
      </div>

      {showBecomeRoot ? (
        <button
          type="button"
          data-selection-action
          onClick={onBecomeRoot}
          className="mt-2 inline-flex h-7 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[11.5px] font-semibold text-[var(--text)] transition-colors duration-[120ms] hover:border-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <Layers size={12} strokeWidth={1.8} />
          Become root
        </button>
      ) : null}
    </div>
  );
}
