import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { NavTooltip } from "./NavTooltip";
import { ZOOM_DEFAULT_IDX, ZOOM_STEPS, ZoomControls } from "./ZoomControls";
type VersionOption = { id: string; title: string };

type NeighborScreen = { name: string; href?: string; screenId?: string };

type Props = {
  children: ReactNode;
  versions?: VersionOption[];
  activeVersionId?: string;
  onVersionChange?: (id: string) => void;
  onFastEdit?: () => void;
  onSettings?: () => void;
  canvasHref?: string;
  prev?: NeighborScreen;
  next?: NeighborScreen;
};

export function PreviewShell({
  children,
  versions,
  activeVersionId,
  onVersionChange,
  onFastEdit,
  onSettings,
  canvasHref,
  prev,
  next,
}: Props) {
  const [zoomIdx, setZoomIdx] = useState(ZOOM_DEFAULT_IDX);
  const [paneHover, setPaneHover] = useState(false);
  const z = ZOOM_STEPS[zoomIdx] ?? 1;
  const isZoomed = zoomIdx !== ZOOM_DEFAULT_IDX;
  const overlayHidden = isZoomed && !paneHover;
  const overlayClass = [
    "transition-opacity duration-[180ms]",
    overlayHidden ? "pointer-events-none opacity-0" : "opacity-100",
  ].join(" ");

  return (
    <div
      onMouseEnter={() => setPaneHover(true)}
      onMouseLeave={() => setPaneHover(false)}
      className="relative flex flex-1 items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0) 0 0/22px 22px, var(--surface)",
      }}
    >
      <div
        className={[
          "absolute inset-0 flex items-center justify-center px-16 py-20",
          isZoomed ? "overflow-auto" : "overflow-hidden",
        ].join(" ")}
      >
        <div
          className={[
            "flex min-h-0 min-w-0 items-center justify-center",
            isZoomed ? "min-h-full min-w-full p-24" : "max-h-[72%] max-w-full",
          ].join(" ")}
        >
          <div
            className={[
              "flex min-h-0 min-w-0 origin-center items-center justify-center transition-transform duration-[180ms] [&_img]:object-contain",
              isZoomed
                ? "[&_img]:max-h-none [&_img]:max-w-none"
                : "max-h-full max-w-full [&_img]:h-auto [&_img]:w-auto [&_img]:max-h-[72vh] [&_img]:max-w-full",
            ].join(" ")}
            style={{ transform: `scale(${z})` }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* version dropdown top-left */}
      {versions && versions.length > 0 ? (
        <div className={["absolute left-4 top-4 z-[6]", overlayClass].join(" ")}>
          <div className="relative">
            <select
              aria-label="Versão da tela"
              value={activeVersionId}
              onChange={(e) => onVersionChange?.(e.target.value)}
              className="h-[34px] min-w-[160px] cursor-pointer rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] py-0 pl-3 pr-7 text-[12px] text-[var(--text)] outline-none transition-colors hover:border-white hover:bg-white hover:text-[#111]"
              style={{ appearance: "none", WebkitAppearance: "none" as never }}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 h-[6px] w-[6px] -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-[var(--text-muted)]"
            />
          </div>
        </div>
      ) : null}

      {/* preview-actions top-right */}
      <div className={["absolute right-4 top-4 z-[6] flex items-center gap-2", overlayClass].join(" ")}>
        {onFastEdit ? (
          <button
            type="button"
            aria-label="FastEdit"
            title="FastEdit"
            onClick={onFastEdit}
            className="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              <path d="M4 4h7" />
            </svg>
          </button>
        ) : null}
        {onSettings ? (
          <button
            type="button"
            aria-label="Configurações"
            title="Configurações"
            onClick={onSettings}
            className="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        ) : null}
        {canvasHref ? (
          <Link
            to={canvasHref}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[13px] font-medium text-[var(--text)] no-underline transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path d="M3 9h18" />
            </svg>
            Abrir no canvas
          </Link>
        ) : null}
      </div>

      {/* prev arrow + tooltip */}
      {prev ? (
        <div className={["group absolute left-4 top-1/2 z-[4] -translate-y-1/2", overlayClass].join(" ")}>
          <Link
            to={prev.href ?? "#"}
            aria-label="Tela anterior"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] no-underline transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <NavTooltip side="prev" name={prev.name} screenId={prev.screenId} />
        </div>
      ) : null}

      {/* next arrow + tooltip */}
      {next ? (
        <div className={["group absolute right-4 top-1/2 z-[4] -translate-y-1/2", overlayClass].join(" ")}>
          <Link
            to={next.href ?? "#"}
            aria-label="Próxima tela"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] no-underline transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
          <NavTooltip side="next" name={next.name} screenId={next.screenId} />
        </div>
      ) : null}

      {/* zoom controls (always visible) */}
      <ZoomControls
        index={zoomIdx}
        onZoomIn={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
        onZoomOut={() => setZoomIdx((i) => Math.max(0, i - 1))}
        onReset={() => setZoomIdx(ZOOM_DEFAULT_IDX)}
      />
    </div>
  );
}
