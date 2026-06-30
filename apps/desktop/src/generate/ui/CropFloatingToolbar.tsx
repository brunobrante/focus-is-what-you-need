import { useState } from "react";
import { ChevronDown, Expand, Loader2, Scissors } from "lucide-react";

import type { PaddingSides } from "../types";
import { DevWrapper } from "@/components/ui/DevWrapper";

const PADDING_OPTIONS: { value: PaddingSides; label: string }[] = [
  { value: "all", label: "All sides" },
  { value: "horizontal", label: "Left + Right" },
  { value: "vertical", label: "Top + Bottom" },
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
];

/**
 * Floating toolbar centred at the top of the stage while a crop (rectangle or
 * closed pen) is active: "Adjust crop" (segment the framed object) and "Add
 * padding" (grow the crop area), the latter with a dropdown to pick which sides
 * grow and by how many pixels.
 */
export function CropFloatingToolbar({
  onAdjustCrop,
  adjusting,
  canAdjust,
  onAddPadding,
}: {
  onAdjustCrop: () => void;
  adjusting: boolean;
  /** Whether a segmentation model is available (else Adjust crop is disabled). */
  canAdjust: boolean;
  onAddPadding: (amount: number, sides: PaddingSides) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(16);
  const [sides, setSides] = useState<PaddingSides>("all");

  return (
    <div
      data-selection-action
      className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-elev)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
    >
      <DevWrapper platform="desktop">
        <button
          type="button"
          data-selection-action
          disabled={adjusting || !canAdjust}
          onClick={onAdjustCrop}
          title={
            canAdjust
              ? "Snap the crop to the object's edges"
              : "Install a segmentation model in Settings first"
          }
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {adjusting ? (
            <Loader2 size={11} strokeWidth={2} className="animate-spin" />
          ) : (
            <Scissors size={11} strokeWidth={2} />
          )}
          {adjusting ? "Adjusting…" : "Adjust crop"}
        </button>
      </DevWrapper>

      <div className="relative flex items-center">
        <button
          type="button"
          data-selection-action
          onClick={() => onAddPadding(amount, sides)}
          title={`Grow the crop by ${amount}px (${sides})`}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-l-[6px] border border-r-0 border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
        >
          <Expand size={11} strokeWidth={2} />
          Add padding
        </button>
        <button
          type="button"
          data-selection-action
          aria-label="Padding options"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-8 cursor-pointer items-center rounded-r-[6px] border border-[var(--border)] bg-[var(--surface)] px-1 text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <ChevronDown size={13} strokeWidth={2} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>

        {open ? (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              data-selection-action
              className="absolute right-0 top-[calc(100%+6px)] z-50 w-[180px] rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-elev)] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
            >
              <div className="mb-1 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                Sides
              </div>
              <div className="mb-2 flex flex-col gap-0.5">
                {PADDING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSides(opt.value)}
                    className={[
                      "flex h-7 cursor-pointer items-center rounded-[5px] px-2 text-left text-[11.5px] transition-colors",
                      sides === opt.value
                        ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                        : "text-[var(--text)] hover:bg-[var(--surface-hover)]",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--text-muted)]">
                Amount
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="h-7 w-[56px] rounded-[5px] border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 text-right text-[11.5px] tabular-nums text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                  <span className="text-[10.5px] text-[var(--text-faint)]">px</span>
                </span>
              </label>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
