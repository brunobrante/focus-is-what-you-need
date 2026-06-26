import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { IconMinus, IconPlus } from "@/components/icons";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "@/canvas/engine/viewport";
import type { ZoomLimits } from "@/canvas/engine/viewport";

export type ZoomSetter = (next: number | ((zoom: number) => number)) => void;

export function ZoomControl({
  zoom,
  setZoom,
  limits,
  bare,
}: {
  zoom: number;
  setZoom: ZoomSetter;
  limits?: ZoomLimits;
  bare?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftPercent, setDraftPercent] = useState(() => String(Math.round(zoom * 100)));
  const minZoom = limits?.min ?? MIN_ZOOM;
  const maxZoom = limits?.max ?? MAX_ZOOM;
  const zoomStep = limits?.step ?? ZOOM_STEP;
  const canIn    = zoom < maxZoom - 1e-6;
  const canOut   = zoom > minZoom + 1e-6;
  const canReset = Math.abs(zoom - 1) > 1e-6;
  const clampedPercentMin = Math.round(minZoom * 100);
  const clampedPercentMax = Math.round(maxZoom * 100);

  useDismissable(menuOpen, () => setMenuOpen(false), [containerRef], { capture: true, escape: false });

  useEffect(() => {
    if (menuOpen) return;
    setDraftPercent(String(Math.round(zoom * 100)));
  }, [menuOpen, zoom]);

  const commitDraftPercent = () => {
    const raw = Number.parseFloat(draftPercent.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(raw)) {
      setDraftPercent(String(Math.round(zoom * 100)));
      return;
    }
    const nextPercent = Math.max(clampedPercentMin, Math.min(clampedPercentMax, Math.round(raw)));
    setZoom(+(nextPercent / 100).toFixed(4));
    setDraftPercent(String(nextPercent));
  };

  const buttons = (
    <>
      <ZoomBtn active={canOut} ariaLabel="Diminuir zoom" onClick={() => setZoom((z) => Math.max(minZoom, +(z - zoomStep).toFixed(4)))}>
        <IconMinus size={13} strokeWidth={1.8} />
      </ZoomBtn>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label="Zoom options"
          aria-expanded={menuOpen}
          className={[
            "inline-flex h-[26px] min-w-[52px] items-center justify-center rounded-md border-0 px-2 text-[11.5px] font-medium tracking-[0.2px] transition-colors duration-[100ms]",
            menuOpen
              ? "bg-[#2A2A2A] text-[#F2F2F2]"
              : canReset
                ? "cursor-pointer bg-transparent text-[#CFCFCF] hover:bg-[#2A2A2A]"
                : "cursor-pointer bg-transparent text-[#7A7A7A] hover:bg-[#2A2A2A] hover:text-[#A0A0A0]",
          ].join(" ")}
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {Math.round(zoom * 100)}%
        </button>
        {menuOpen && (
          <div
            className="absolute bottom-[calc(100%+6px)] left-1/2 z-20 -translate-x-1/2 rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] p-1.5"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset" }}
          >
            <div className="flex items-center gap-1">
              <label className="relative block">
                <input
                  aria-label="Zoom percent"
                  value={draftPercent}
                  onChange={(event) => setDraftPercent(event.target.value)}
                  onBlur={commitDraftPercent}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitDraftPercent();
                      setMenuOpen(false);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setDraftPercent(String(Math.round(zoom * 100)));
                      setMenuOpen(false);
                    }
                  }}
                  inputMode="numeric"
                  className="h-[26px] w-[70px] rounded-md border border-[#343434] bg-[#141414] px-2 pr-5 text-[11.5px] text-[#E2E2E2] outline-none shadow-none transition-colors focus:border-[#0D99FF]/70"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8A8A8A]">%</span>
              </label>
              <button
                type="button"
                aria-label="Reset zoom"
                disabled={!canReset}
                onClick={() => {
                  setZoom(1);
                  setDraftPercent("100");
                }}
                className={[
                  "grid h-[26px] w-[26px] place-items-center rounded-md border text-[11px] font-medium shadow-none transition-colors duration-[100ms]",
                  canReset
                    ? "cursor-pointer border-[#3A3A3A] bg-[#202020] text-[#D2D2D2] hover:bg-[#2A2A2A]"
                    : "cursor-not-allowed border-[#2F2F2F] bg-[#191919] text-[#6C6C6C]",
                ].join(" ")}
              >
                <RotateCcw size={13} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        )}
      </div>
      <ZoomBtn active={canIn} ariaLabel="Aumentar zoom" onClick={() => setZoom((z) => Math.min(maxZoom, +(z + zoomStep).toFixed(4)))}>
        <IconPlus size={13} strokeWidth={1.8} />
      </ZoomBtn>
    </>
  );

  if (bare) {
    return (
      <div ref={containerRef} role="group" aria-label="Controle de zoom" className="inline-flex items-center gap-0.5" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {buttons}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Zoom control"
      className="inline-flex items-center gap-0.5 rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] p-[3px]"
      style={{
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.4)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {buttons}
    </div>
  );
}

function ZoomBtn({
  active,
  ariaLabel,
  onClick,
  children,
}: {
  active: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={active ? onClick : undefined}
      disabled={!active}
      aria-label={ariaLabel}
      className={[
        "grid h-[26px] w-[26px] place-items-center rounded-md border-0 bg-transparent transition-colors duration-[100ms]",
        active ? "cursor-pointer text-[#CFCFCF] hover:bg-[#2A2A2A]" : "cursor-not-allowed text-[#4A4A4A]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
