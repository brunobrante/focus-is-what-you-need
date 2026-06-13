import { IconExpand, IconMinus, IconPlus } from "@/components/icons";
import { USER_MAX_ZOOM, USER_MIN_ZOOM } from "@/domain/zoom";

// Discrete zoom stops for the snapshot viewers. The endpoints are pinned to the
// shared user-facing range so the viewers can never drift from the canvas/Builder.
export const ZOOM_STEPS = [USER_MIN_ZOOM, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.5, 15.0, 20.0, USER_MAX_ZOOM];
export const ZOOM_DEFAULT_IDX = 0;

type Props = {
  index: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFullscreen?: () => void;
};

export function ZoomControls({ index, onZoomIn, onZoomOut, onReset, onFullscreen }: Props) {
  const z = ZOOM_STEPS[index] ?? 1;
  const canReset = index !== ZOOM_DEFAULT_IDX;
  const isMin = index <= 0;
  const isMax = index >= ZOOM_STEPS.length - 1;

  return (
    <div
      role="toolbar"
      aria-label="Zoom"
      className="absolute bottom-4 right-4 z-[6] flex items-center gap-0 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)]"
    >
      <ZoomBtn label="Zoom out" disabled={isMin} onClick={onZoomOut}>
        <IconMinus size={14} strokeWidth={2} />
      </ZoomBtn>
      <button
        type="button"
        disabled={!canReset}
        onClick={onReset}
        aria-label="Reset zoom"
        title="Reset to 100%"
        className={[
          "inline-flex h-8 min-w-[56px] cursor-pointer items-center justify-center border-0 bg-transparent px-2 text-center text-[11px] font-medium transition-colors",
          canReset
            ? "text-[var(--text-soft)] hover:bg-white hover:text-[#111]"
            : "cursor-default text-[var(--text-faint)]",
        ].join(" ")}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {Math.round(z * 100)}%
      </button>
      <ZoomBtn label="Zoom in" disabled={isMax} onClick={onZoomIn}>
        <IconPlus size={14} strokeWidth={2} />
      </ZoomBtn>
      {onFullscreen ? (
        <>
          <span aria-hidden className="w-px self-stretch bg-[var(--border-strong)]" />
          <ZoomBtn label="Fullscreen" onClick={onFullscreen}>
            <IconExpand size={14} strokeWidth={1.8} />
          </ZoomBtn>
        </>
      ) : null}
    </div>
  );
}

function ZoomBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 cursor-pointer place-items-center border-0 bg-transparent text-[var(--text-soft)] transition-colors enabled:hover:bg-white enabled:hover:text-[#111] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
