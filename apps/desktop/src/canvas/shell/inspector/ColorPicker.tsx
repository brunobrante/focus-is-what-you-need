// The inspector's color picker: a swatch button that opens a popover with a
// saturation/value square, hue + alpha sliders, a hex field, an eyedropper and a
// row of recent colors. Shared by `InsColor` (borders, effects, text) and
// `FillColorField`, so every color control in the app has the same affordances.
//
// The picker speaks hex: `#RRGGBB` when opaque, `#RRGGBBAA` when translucent.
// Values it cannot parse (wide-gamut `color(display-p3 …)` / `oklch(…)` fills)
// still render in the swatch — the picker just seeds from black and only
// overwrites them once the user actually moves a control.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { IconCrosshair, IconLink, IconUnlink } from "@/components/icons";
import { hsvToRgb, parseCssColor, rgbCss, rgbToHsv, rgbaToHex, type Hsv } from "@/domain/canvas/color";
import { parseTokenRef, tokenRef } from "@/domain/system-design/resolveTokenRef";
import { pickScreenColor } from "@/infrastructure/eyedropper";
import { LINKED_INSTANCE_COLOR } from "@/lib/ui/linkedColor";
import {
  clamp,
  fieldClass,
  iconButtonClass,
  useCommitOnOutsideInteraction,
  useDeferredCommitField,
  useScrubHandlers,
  type InsColorToken,
} from "./InsComponents";

const PANEL_WIDTH = 232;
const PANEL_HEIGHT = 288;
const RECENT_LIMIT = 8;

/** A translucent color reads as itself over this checkerboard, not over the panel. */
const CHECKER =
  "repeating-conic-gradient(#8A8A8A 0% 25%, #4A4A4A 0% 50%) 50% / 8px 8px";

// ── Recent colors (session-scoped, shared by every picker instance) ──────────

let recentColors: string[] = [];
const recentListeners = new Set<() => void>();

function pushRecentColor(hex: string): void {
  const next = [hex, ...recentColors.filter((c) => c !== hex)].slice(0, RECENT_LIMIT);
  if (next.length === recentColors.length && next.every((c, i) => c === recentColors[i])) return;
  recentColors = next;
  for (const listener of recentListeners) listener();
}

function useRecentColors(): string[] {
  return useSyncExternalStore(
    (listener) => {
      recentListeners.add(listener);
      return () => recentListeners.delete(listener);
    },
    () => recentColors,
    () => recentColors,
  );
}

// ── Swatch trigger ──────────────────────────────────────────────────────────

export function ColorSwatch({
  value,
  onChange,
  size,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Edge length of the square swatch, in px. */
  size: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        title="Edit color"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative shrink-0 cursor-pointer overflow-hidden rounded-[5px] border-0 p-0 ring-1 ring-black/20 disabled:cursor-not-allowed"
        style={{ width: size, height: size, borderRadius: size >= 24 ? 7 : 5, background: CHECKER }}
      >
        <span aria-hidden className="absolute inset-0" style={{ background: value }} />
      </button>
      {open && (
        <ColorPickerPopover
          anchor={buttonRef}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── InsColor: swatch + hex field + optional token binding ───────────────────

export function InsColor({
  value,
  onChange,
  disabled = false,
  tokens,
  boundRef,
  onBind,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** System Design color tokens this control can bind to. */
  tokens?: InsColorToken[];
  /** The current token binding ("colors:<id>"), if the value is bound. */
  boundRef?: string;
  /** Bind to a token ref, or pass undefined to revert to a literal value. */
  onBind?: (ref: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const canBind = Boolean(onBind && tokens && tokens.length > 0);

  // Bound to a token: show it read-only with a purple link badge + unbind.
  if (boundRef && onBind) {
    const boundId = parseTokenRef(boundRef)?.tokenId;
    const token = boundId ? tokens?.find((t) => t.id === boundId) : undefined;
    return (
      <div
        className={[
          "flex min-w-0 flex-1 items-center gap-1.5",
          disabled ? "pointer-events-none opacity-40" : "",
        ].join(" ")}
      >
        <div className={`${fieldClass} flex-1 hover:bg-[#242424]`}>
          <span
            className="h-[18px] w-[18px] shrink-0 rounded-[5px] ring-1 ring-black/20"
            style={{ background: token?.value ?? value }}
          />
          <span
            className="flex min-w-0 flex-1 items-center gap-1 truncate text-[12px]"
            style={{ color: LINKED_INSTANCE_COLOR }}
            title="Bound to a System Design token"
          >
            <IconLink size={11} />
            <span className="truncate">{token?.name ?? "Token"}</span>
          </span>
        </div>
        <button type="button" title="Unbind — revert to a literal color" onClick={() => onBind(undefined)} className={iconButtonClass}>
          <IconUnlink size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={[
        "relative flex min-w-0 flex-1 items-center gap-1.5",
        disabled ? "pointer-events-none opacity-40" : "",
      ].join(" ")}
    >
      <div className={`${fieldClass} flex-1`}>
        <ColorSwatch value={value} onChange={onChange} size={18} disabled={disabled} />
        <BareHexInput value={value} onChange={onChange} />
      </div>
      {canBind && (
        <button type="button" title="Bind to a System Design token" onClick={() => setOpen((o) => !o)} className={iconButtonClass}>
          <IconLink size={12} />
        </button>
      )}
      {open && canBind && (
        <div className="absolute right-0 top-[32px] z-50 max-h-48 w-44 overflow-y-auto rounded-[10px] border border-[#2C2C2C] bg-[#1E1E1E] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          {tokens!.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onBind?.(tokenRef("colors", t.id));
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[6px] px-1.5 py-1 text-left text-[12px] text-[#E2E2E2] transition-colors hover:bg-[#2A2A2A]"
            >
              <span className="h-3 w-3 shrink-0 rounded-[3px] border border-white/10" style={{ background: t.value }} />
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The hex text field used inside InsColor's field chrome (no border of its own). */
function BareHexInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { draftValue, setDraftValue, commitDraft, resetDraft } = useDeferredCommitField(
    value.toUpperCase().replace("#", ""),
    (v) => {
      const hex = "#" + v.replace(/#/g, "").trim();
      // Reject non-hex input so the deferred-commit field reverts to the last
      // valid value instead of storing junk like "#red" (L4).
      if (!/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return false;
      onChange(hex);
      return true;
    },
  );
  useCommitOnOutsideInteraction(wrapperRef, commitDraft);
  return (
    <div ref={wrapperRef} className="min-w-0 flex-1">
      <input
        type="text"
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
          else if (e.key === "Escape") { e.preventDefault(); resetDraft(); }
        }}
        className="w-full min-w-0 border-0 bg-transparent text-[12px] uppercase text-[#EDEDED] outline-none"
        style={{ fontFeatureSettings: '"tnum"' }}
      />
    </div>
  );
}

// ── Popover ─────────────────────────────────────────────────────────────────

function ColorPickerPopover({
  anchor,
  value,
  onChange,
  onClose,
}: {
  anchor: { current: HTMLElement | null };
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Anchor below the swatch, flipping above / nudging inward at a viewport edge.
  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const below = rect.bottom + 6;
    const top = below + PANEL_HEIGHT > window.innerHeight ? rect.top - PANEL_HEIGHT - 6 : below;
    setPosition({
      left: clamp(rect.left, 8, Math.max(8, window.innerWidth - PANEL_WIDTH - 8)),
      top: clamp(top, 8, Math.max(8, window.innerHeight - PANEL_HEIGHT - 8)),
    });
  }, [anchor]);

  // Close on outside pointerdown / Escape. The eyedropper hands focus to a native
  // sampler, so a window blur must NOT close the panel.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor, onClose]);

  if (!position) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Color picker"
      className="fixed z-[100] rounded-[10px] border border-[#2C2C2C] bg-[#1E1E1E] p-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
      style={{ left: position.left, top: position.top, width: PANEL_WIDTH }}
    >
      <ColorPickerBody value={value} onChange={onChange} />
    </div>,
    document.body,
  );
}

function ColorPickerBody({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const scrub = useScrubHandlers();
  const recents = useRecentColors();

  // HSV is the picker's own state: hue and saturation survive a trip through
  // pure black / a grey, which an rgb round-trip would collapse.
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(parseCssColor(value) ?? { r: 0, g: 0, b: 0 }));
  const [alpha, setAlpha] = useState(() => parseCssColor(value)?.a ?? 1);
  const emittedRef = useRef(value);

  useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    const parsed = parseCssColor(value);
    if (!parsed) return;
    setHsv((current) => {
      const next = rgbToHsv(parsed);
      // A grey has no meaningful hue; keep the one the user was dragging.
      return { h: next.s === 0 ? current.h : next.h, s: next.s, v: next.v };
    });
    setAlpha(parsed.a);
  }, [value]);

  const emit = useCallback(
    (nextHsv: Hsv, nextAlpha: number) => {
      const hex = rgbaToHex({ ...hsvToRgb(nextHsv), a: nextAlpha });
      emittedRef.current = hex;
      onChange(hex);
    },
    [onChange],
  );

  const commitRecent = useCallback(() => {
    pushRecentColor(rgbaToHex({ ...hsvToRgb(hsv), a: alpha }));
    scrub.onScrubEnd?.();
  }, [alpha, hsv, scrub]);

  const applyHex = useCallback(
    (hex: string) => {
      const parsed = parseCssColor(hex);
      if (!parsed) return false;
      const nextHsv = rgbToHsv(parsed);
      setHsv((current) => ({ ...nextHsv, h: nextHsv.s === 0 ? current.h : nextHsv.h }));
      setAlpha(parsed.a);
      emittedRef.current = hex;
      onChange(hex);
      pushRecentColor(hex);
      return true;
    },
    [onChange],
  );

  const opaque = rgbCss(hsvToRgb(hsv));
  const hueColor = rgbCss(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));

  return (
    <div className="flex flex-col gap-2.5">
      <SaturationSquare
        hsv={hsv}
        hueColor={hueColor}
        onScrubStart={scrub.onScrubStart}
        onScrubEnd={commitRecent}
        onChange={(s, v) => {
          const next = { ...hsv, s, v };
          setHsv(next);
          emit(next, alpha);
        }}
      />

      <SliderTrack
        ratio={hsv.h / 360}
        thumbColor={hueColor}
        background="linear-gradient(to right, #F00 0%, #FF0 17%, #0F0 33%, #0FF 50%, #00F 67%, #F0F 83%, #F00 100%)"
        onScrubStart={scrub.onScrubStart}
        onScrubEnd={commitRecent}
        onChange={(ratio) => {
          const next = { ...hsv, h: ratio * 360 };
          setHsv(next);
          emit(next, alpha);
        }}
      />

      <SliderTrack
        ratio={alpha}
        thumbColor={opaque}
        background={`linear-gradient(to right, transparent, ${opaque}), ${CHECKER}`}
        onScrubStart={scrub.onScrubStart}
        onScrubEnd={commitRecent}
        onChange={(ratio) => {
          setAlpha(ratio);
          emit(hsv, ratio);
        }}
      />

      <div className="flex items-center gap-1.5">
        <div className={`${fieldClass} h-[28px] flex-1`}>
          <span className="shrink-0 text-[10.5px] text-[#5F5F5F]">#</span>
          <HexField
            value={rgbaToHex({ ...hsvToRgb(hsv), a: alpha })}
            onChange={(hex) => applyHex(hex)}
          />
        </div>
        <div className={`${fieldClass} h-[28px] w-[62px] shrink-0`}>
          <AlphaField
            percent={Math.round(alpha * 100)}
            onChange={(percent) => {
              const next = percent / 100;
              setAlpha(next);
              emit(hsv, next);
              pushRecentColor(rgbaToHex({ ...hsvToRgb(hsv), a: next }));
            }}
          />
          <span className="shrink-0 text-[10.5px] text-[#5F5F5F]">%</span>
        </div>
        <button
          type="button"
          title="Pick a color from the screen (eyedropper)"
          onClick={async () => {
            const picked = await pickScreenColor();
            if (picked) applyHex(picked);
          }}
          className={`${iconButtonClass} h-[28px] w-[28px]`}
        >
          <IconCrosshair size={11} />
        </button>
      </div>

      {recents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] text-[#5F5F5F]">Recent</span>
          <div className="flex flex-wrap gap-1.5">
            {recents.map((hex) => (
              <button
                key={hex}
                type="button"
                title={hex}
                onClick={() => applyHex(hex)}
                className="relative h-[18px] w-[18px] shrink-0 cursor-pointer overflow-hidden rounded-[5px] border-0 p-0 ring-1 ring-black/25"
                style={{ background: CHECKER }}
              >
                <span aria-hidden className="absolute inset-0" style={{ background: hex }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Continuous controls ─────────────────────────────────────────────────────

/** Runs `onMove` with the pointer's position inside `element`, normalized to 0–1. */
function useDragRatio(
  onMove: (x: number, y: number) => void,
  onScrubStart?: () => void,
  onScrubEnd?: () => void,
) {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  return useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      const emit = (clientX: number, clientY: number) => {
        const rect = element.getBoundingClientRect();
        onMoveRef.current(
          rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0,
          rect.height > 0 ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0,
        );
      };
      element.setPointerCapture(event.pointerId);
      onScrubStart?.();
      emit(event.clientX, event.clientY);

      const onPointerMove = (moveEvent: PointerEvent) => emit(moveEvent.clientX, moveEvent.clientY);
      const onPointerUp = () => {
        element.removeEventListener("pointermove", onPointerMove);
        element.removeEventListener("pointerup", onPointerUp);
        element.removeEventListener("pointercancel", onPointerUp);
        onScrubEnd?.();
      };
      element.addEventListener("pointermove", onPointerMove);
      element.addEventListener("pointerup", onPointerUp);
      element.addEventListener("pointercancel", onPointerUp);
    },
    [onScrubEnd, onScrubStart],
  );
}

function SaturationSquare({
  hsv,
  hueColor,
  onChange,
  onScrubStart,
  onScrubEnd,
}: {
  hsv: Hsv;
  hueColor: string;
  onChange: (s: number, v: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const onPointerDown = useDragRatio((x, y) => onChange(x, 1 - y), onScrubStart, onScrubEnd);
  return (
    <div
      onPointerDown={onPointerDown}
      className="relative h-[140px] w-full cursor-crosshair touch-none rounded-[7px] ring-1 ring-black/25"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #FFF, transparent), ${hueColor}`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
      />
    </div>
  );
}

function SliderTrack({
  ratio,
  background,
  thumbColor,
  onChange,
  onScrubStart,
  onScrubEnd,
}: {
  ratio: number;
  background: string;
  thumbColor: string;
  onChange: (ratio: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const onPointerDown = useDragRatio((x) => onChange(x), onScrubStart, onScrubEnd);
  return (
    <div
      onPointerDown={onPointerDown}
      className="relative h-[10px] w-full cursor-pointer touch-none rounded-full ring-1 ring-black/25"
      style={{ background }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
        style={{ left: `${ratio * 100}%`, background: thumbColor }}
      />
    </div>
  );
}

// ── Text fields ─────────────────────────────────────────────────────────────

function HexField({ value, onChange }: { value: string; onChange: (hex: string) => boolean }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { draftValue, setDraftValue, commitDraft, resetDraft } = useDeferredCommitField(
    value.replace("#", ""),
    (draft) => onChange("#" + draft.replace(/#/g, "").trim()),
  );
  useCommitOnOutsideInteraction(wrapperRef, commitDraft);
  return (
    <div ref={wrapperRef} className="min-w-0 flex-1">
      <input
        type="text"
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); resetDraft(); }
        }}
        className="w-full min-w-0 border-0 bg-transparent text-[12px] uppercase text-[#EDEDED] outline-none"
        style={{ fontFeatureSettings: '"tnum"' }}
      />
    </div>
  );
}

function AlphaField({
  percent,
  onChange,
}: {
  percent: number;
  onChange: (percent: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { draftValue, setDraftValue, commitDraft, resetDraft } = useDeferredCommitField(
    String(percent),
    (draft) => {
      const next = Number(draft.trim());
      if (draft.trim() === "" || !Number.isFinite(next)) return false;
      onChange(clamp(Math.round(next), 0, 100));
      return true;
    },
  );
  useCommitOnOutsideInteraction(wrapperRef, commitDraft);
  return (
    <div ref={wrapperRef} className="min-w-0 flex-1">
      <input
        type="text"
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); resetDraft(); }
        }}
        className="w-full min-w-0 border-0 bg-transparent text-[12px] text-[#EDEDED] outline-none"
        style={{ fontFeatureSettings: '"tnum"' }}
      />
    </div>
  );
}
