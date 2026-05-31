export const ZOOM_STEPS = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.5, 15.0, 20.0, 25.0];
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </ZoomBtn>
      {onFullscreen ? (
        <>
          <span aria-hidden className="w-px self-stretch bg-[var(--border-strong)]" />
          <ZoomBtn label="Fullscreen" onClick={onFullscreen}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4" />
            </svg>
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
