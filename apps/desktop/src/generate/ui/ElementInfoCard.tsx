import { Image as ImageIcon, Layers } from "lucide-react";

export function ElementInfoCard({
  name,
  width,
  height,
  type,
  thumbnailUrl,
  canPromote,
  onPromote,
}: {
  name: string;
  width: number;
  height: number;
  type: string;
  thumbnailUrl: string;
  canPromote: boolean;
  onPromote: () => void;
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
            <span className="shrink-0 text-[var(--text-faint)]">·</span>
          </div>
        </div>
        <span className="shrink-0 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[4.5px] font-medium text-[var(--text-muted)]">
          {type}
        </span>
      </div>
      <button
        type="button"
        disabled={!canPromote}
        onClick={onPromote}
        className={[
          "mt-2 h-7 w-full cursor-pointer rounded-[8px] border px-3 text-[11.5px] font-semibold transition-colors duration-[120ms]",
          canPromote
            ? "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
            : "cursor-not-allowed border-[var(--border)] bg-[rgba(255,255,255,0.03)] text-[var(--text-faint)]",
        ].join(" ")}
      >
        <Layers size={12} strokeWidth={1.7} className="mr-1.5 inline-block align-[-2px]" />
        Tornar root
      </button>
    </div>
  );
}
