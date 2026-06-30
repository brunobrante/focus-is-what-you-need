import { useEffect, useState } from "react";
import { ChevronDown, Expand, Loader2, Ruler, Scissors, SlidersHorizontal } from "lucide-react";

import type { PaddingSide, PaddingValues } from "../types";
import { DevWrapper } from "@/components/ui/DevWrapper";

/**
 * Floating toolbar centred at the top of the stage while a crop (rectangle or
 * closed pen) is active: "Adjust crop" (segment the framed object), "Show sizes"
 * (measure the spacing/padding), and a padding control. For the rectangle the
 * padding control is a per-side editor — each input shows and SETS that side's
 * padding (absolute, not an increment); for the pen it grows uniformly.
 */
export function CropFloatingToolbar({
  onAdjustCrop,
  adjusting,
  canAdjust,
  onShowSizes,
  showingSizes,
  padding,
  onSetPadding,
  onGrowPen,
}: {
  onAdjustCrop: () => void;
  adjusting: boolean;
  /** Whether a segmentation model is available (else Adjust crop is disabled). */
  canAdjust: boolean;
  onShowSizes: () => void;
  /** Whether the measurement overlay is currently shown (button acts as a toggle). */
  showingSizes: boolean;
  /** Current per-side padding (rectangle); null for the pen. */
  padding: PaddingValues | null;
  onSetPadding: (values: PaddingValues) => void;
  /** Uniform outward grow for the pen, in px. */
  onGrowPen: (amount: number) => void;
}) {
  const [open, setOpen] = useState(false);

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

      <DevWrapper platform="desktop">
        <button
          type="button"
          data-selection-action
          onClick={onShowSizes}
          title="Measure the spacing between objects inside the crop"
          className={[
            "inline-flex h-8 cursor-pointer items-center gap-1 rounded-[6px] border px-2.5 text-[11.5px] font-medium transition-colors",
            showingSizes
              ? "border-[#FF3B7B] bg-[#FF3B7B] text-white"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
          ].join(" ")}
        >
          <Ruler size={11} strokeWidth={2} />
          {showingSizes ? "Hide sizes" : "Show sizes"}
        </button>
      </DevWrapper>

      <div className="relative flex items-center">
        <button
          type="button"
          data-selection-action
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          title="Padding"
          className={[
            "inline-flex h-8 cursor-pointer items-center gap-1 rounded-[6px] border px-2.5 text-[11.5px] font-medium transition-colors",
            open
              ? "border-[var(--border-strong)] bg-[var(--surface-hover)] text-[var(--text)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
          ].join(" ")}
        >
          <Expand size={11} strokeWidth={2} />
          Padding
          <ChevronDown size={12} strokeWidth={2} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
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
              className="absolute right-0 top-[calc(100%+6px)] z-50 rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-elev)] p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
            >
              {padding ? (
                <PaddingEditor padding={padding} onSetPadding={onSetPadding} />
              ) : (
                <PenPaddingEditor onGrowPen={onGrowPen} />
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

const inputClass =
  "h-7 w-[52px] rounded-[5px] border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 text-center text-[11.5px] tabular-nums text-[var(--text)] outline-none focus:border-[var(--accent)]";

/**
 * Figma-style padding: one input that sets all sides, with a toggle to expand
 * into per-side fields (laid out as a cross). The single input shows the common
 * value when all sides match, or "Mixed" otherwise.
 */
function PaddingEditor({
  padding,
  onSetPadding,
}: {
  padding: PaddingValues;
  onSetPadding: (values: PaddingValues) => void;
}) {
  const [detailed, setDetailed] = useState(false);
  // Local draft so the fields stay editable while typing; resynced when the crop
  // (and thus the derived padding) changes by other means. Depend on the values,
  // not the object — `padding` is a fresh object each render, which would loop.
  const [draft, setDraft] = useState<PaddingValues>(padding);
  useEffect(() => {
    setDraft({ top: padding.top, right: padding.right, bottom: padding.bottom, left: padding.left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padding.top, padding.right, padding.bottom, padding.left]);

  const uniform =
    draft.top === draft.right && draft.right === draft.bottom && draft.bottom === draft.left;

  const setSide = (side: PaddingSide, raw: string) => {
    const v = Math.max(0, Math.round(Number(raw) || 0));
    const next = { ...draft, [side]: v };
    setDraft(next);
    onSetPadding(next);
  };
  const setAll = (raw: string) => {
    const v = Math.max(0, Math.round(Number(raw) || 0));
    const next = { top: v, right: v, bottom: v, left: v };
    setDraft(next);
    onSetPadding(next);
  };

  const field = (side: PaddingSide) => (
    <input
      type="number"
      min={0}
      step={1}
      aria-label={`${side} padding`}
      value={draft[side]}
      onChange={(e) => setSide(side, e.target.value)}
      className={inputClass}
    />
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
          Padding (px)
        </span>
        <button
          type="button"
          aria-label="Padding per side"
          aria-pressed={detailed}
          title="Set each side"
          onClick={() => setDetailed((d) => !d)}
          className={[
            "grid h-6 w-6 cursor-pointer place-items-center rounded-[5px] border transition-colors",
            detailed
              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
              : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]",
          ].join(" ")}
        >
          <SlidersHorizontal size={12} strokeWidth={1.9} />
        </button>
      </div>

      {detailed ? (
        <div className="grid grid-cols-3 items-center gap-1.5">
          <span />
          {field("top")}
          <span />
          {field("left")}
          <span className="grid h-7 w-7 place-items-center rounded-[5px] border border-dashed border-[var(--border-strong)] text-[var(--text-faint)]">
            <Expand size={12} strokeWidth={1.8} />
          </span>
          {field("right")}
          <span />
          {field("bottom")}
          <span />
        </div>
      ) : (
        <input
          type="number"
          min={0}
          step={1}
          aria-label="Padding (all sides)"
          value={uniform ? draft.top : ""}
          placeholder={uniform ? undefined : "Mixed"}
          onChange={(e) => setAll(e.target.value)}
          className={`${inputClass} w-full text-left`}
        />
      )}
    </div>
  );
}

/** A single uniform-grow input for the pen (no axis-aligned sides). */
function PenPaddingEditor({ onGrowPen }: { onGrowPen: (amount: number) => void }) {
  const [amount, setAmount] = useState(16);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Grow path (px)</div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          step={1}
          aria-label="Grow amount"
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => onGrowPen(amount)}
          className="h-7 cursor-pointer rounded-[5px] border border-[var(--accent)] bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-[var(--accent-fg)] hover:bg-white"
        >
          Grow
        </button>
      </div>
    </div>
  );
}
