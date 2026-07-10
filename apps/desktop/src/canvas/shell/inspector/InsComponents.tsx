import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconChevronDown } from "@/components/icons";

import { clamp } from "@/domain/canvas/geometry";

/**
 * Shared visual tokens for the inspector. The look is modelled on Framer's
 * property panel: soft filled fields with a large corner radius, muted glyph
 * labels sitting inside the field, and segmented controls with a sliding
 * indicator. Centralising the palette here keeps every section in lock-step
 * (the hex values used to be copy-pasted across a dozen files).
 */
export const INS = {
  /** Field / control fill at rest and on hover. */
  fill: "#242424",
  fillHover: "#2C2C2C",
  /** Recessed track behind segmented controls and sliders. */
  track: "#1C1C1C",
  /** The sliding indicator / active segment. */
  active: "#363636",
  /** Hairline divider between sections. */
  divider: "#282828",
  /** Text roles. */
  text: "#EDEDED",
  label: "#8A8A8A",
  faint: "#5F5F5F",
  textHover: "#E2E2E2",
  /** Accent (focus ring, sliders, switches). Framer's tint is the same blue. */
  accent: "#0D99FF",
} as const;

/** Field chrome shared by every text-like control (input, select, readout). */
export const fieldClass =
  "flex h-[30px] min-w-0 items-center gap-1.5 rounded-[8px] bg-[#242424] px-2.5 " +
  "border border-transparent transition-colors hover:bg-[#2C2C2C] " +
  "focus-within:border-[#0D99FF]/70 focus-within:bg-[#2C2C2C]";

/** A small square icon button (link, add, per-side toggles, …). */
export const iconButtonClass =
  "grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] border border-transparent " +
  "bg-transparent text-[#9A9A9A] transition-colors hover:bg-[#2C2C2C] hover:text-[#E2E2E2] " +
  "disabled:cursor-not-allowed disabled:opacity-40";

/** A full-width action button (Edit path, Flatten, Boolean ops, …). */
export const insButtonClass =
  "flex h-[30px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-[8px] " +
  "bg-[#242424] px-3 text-[12px] font-medium text-[#EDEDED] transition-colors hover:bg-[#2E2E2E] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** A muted glyph label that lives inside a field (X, Y, W, H, °, %, …). */
export function FieldGlyph({ children }: { children: ReactNode }) {
  return (
    <span className="grid w-3.5 shrink-0 place-items-center text-[10.5px] font-medium text-[#7C7C7C]">
      {children}
    </span>
  );
}

/** A System Design color token offered for binding in InsColor. */
export type InsColorToken = { id: string; name: string; value: string };

/**
 * Scrub lifecycle for continuous controls (sliders, the native color swatch). A
 * consumer that wants a drag to coalesce into a single undo entry (H3) wraps the
 * subtree in `ScrubProvider`; leaf controls call onScrubStart on gesture begin
 * and onScrubEnd on release. Controls also accept explicit props that win over
 * the context, so both wiring styles work.
 */
type ScrubHandlers = { onScrubStart?: () => void; onScrubEnd?: () => void };
const ScrubContext = createContext<ScrubHandlers>({});

export function ScrubProvider({
  onScrubStart,
  onScrubEnd,
  children,
}: ScrubHandlers & { children: ReactNode }) {
  const value = useMemo(() => ({ onScrubStart, onScrubEnd }), [onScrubStart, onScrubEnd]);
  return <ScrubContext.Provider value={value}>{children}</ScrubContext.Provider>;
}

export function useScrubHandlers(explicit?: ScrubHandlers): ScrubHandlers {
  const ctx = useContext(ScrubContext);
  return {
    onScrubStart: explicit?.onScrubStart ?? ctx.onScrubStart,
    onScrubEnd: explicit?.onScrubEnd ?? ctx.onScrubEnd,
  };
}

export { clamp };

export type CommitResult = boolean | void;

export function updateNumber(value: string, commit: (value: number) => void): boolean {
  if (value.trim() === "") return false;
  const next = Number(value);
  if (!Number.isFinite(next)) return false;
  commit(next);
  return true;
}

// ── Token binding (non-color, G14) ──────────────────────────────────────────

export type InsTokenOption = { ref: string; name: string };

/** Compact "bind to token" select: "None" + the category's token names. The
 *  caller writes the ref AND the concrete fallback value on bind, and clears
 *  the ref on "None" (or on any manual edit of the concrete field). */
export function InsTokenBind({
  boundRef,
  options,
  onBind,
  onUnbind,
}: {
  boundRef?: string;
  options: InsTokenOption[];
  onBind: (option: InsTokenOption) => void;
  onUnbind: () => void;
}) {
  if (options.length === 0) return null;
  const bound = boundRef ? options.find((option) => option.ref === boundRef) : undefined;
  return (
    <InsSelect
      value={bound?.name ?? "None"}
      onChange={(name) => {
        if (name === "None") {
          onUnbind();
          return;
        }
        const option = options.find((o) => o.name === name);
        if (option) onBind(option);
      }}
      options={["None", ...options.map((o) => o.name)]}
    />
  );
}

// ── Hex alpha helpers ────────────────────────────────────────────────────────
// Color + opacity % pairs store a single `#RRGGBBAA` string (the doc's model
// for border/stroke colors). #RGB and #RRGGBB parse as fully opaque; anything
// that isn't a plain hex literal is left alone (returns null).

/** The alpha of a hex color as 0–100, or null when not a hex literal. */
export function hexAlphaPercent(color: string): number | null {
  const raw = color.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return null;
  if (raw.length !== 9) return 100;
  return Math.round((parseInt(raw.slice(7, 9), 16) / 255) * 100);
}

/** The same hex color with its alpha channel replaced (percent 0–100), or null
 *  when the input isn't a hex literal. 100% collapses back to #RRGGBB. */
export function hexWithAlphaPercent(color: string, percent: number): string | null {
  const raw = color.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return null;
  const rgb =
    raw.length === 4
      ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
      : raw.slice(0, 7);
  const clamped = clamp(Math.round(percent), 0, 100);
  if (clamped >= 100) return rgb.toUpperCase();
  const alpha = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${rgb}${alpha}`.toUpperCase();
}

export function useDeferredCommitField(value: string, onChange: (v: string) => CommitResult) {
  const [draftValue, setDraftValueState] = useState(value);
  const draftValueRef = useRef(value);
  const committedValueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  committedValueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    draftValueRef.current = value;
    setDraftValueState(value);
  }, [value]);

  const setDraftValue = useCallback((nextValue: string) => {
    draftValueRef.current = nextValue;
    setDraftValueState(nextValue);
  }, []);

  const commitDraft = useCallback(() => {
    const draft = draftValueRef.current;
    const committed = committedValueRef.current;
    if (draft === committed) return;
    const result = onChangeRef.current(draft);
    if (result === false) {
      draftValueRef.current = committed;
      setDraftValueState(committed);
    }
  }, []);

  const resetDraft = useCallback(() => {
    const committed = committedValueRef.current;
    draftValueRef.current = committed;
    setDraftValueState(committed);
  }, []);

  return { draftValue, setDraftValue, commitDraft, resetDraft };
}

// A text element's tab mounts ~30 deferred-commit fields; giving each its own
// capture-phase document.pointerdown + window.blur listener meant ~30 handlers ran
// on every pointerdown anywhere in the app. Instead all fields share ONE pair of
// listeners driven by a registry (P8). Committing a field whose element doesn't
// contain the pointer target is a no-op when that field has no pending draft, so
// the shared handler is behaviourally identical to the old per-field ones.
type CommitSubscriber = { ref: { current: HTMLElement | null }; commit: () => void };
const commitSubscribers = new Set<CommitSubscriber>();
let commitListenersInstalled = false;

function handleSharedCommitPointerDown(event: PointerEvent) {
  const target = event.target;
  // Copy first: a commit can unmount/re-subscribe fields mid-iteration.
  for (const sub of [...commitSubscribers]) {
    const element = sub.ref.current;
    if (element && target instanceof Node && element.contains(target)) continue;
    sub.commit();
  }
}

function handleSharedCommitBlur() {
  for (const sub of [...commitSubscribers]) sub.commit();
}

function ensureCommitListeners() {
  const ownerDocument = globalThis.document;
  if (commitListenersInstalled || !ownerDocument) return;
  ownerDocument.addEventListener("pointerdown", handleSharedCommitPointerDown, true);
  globalThis.addEventListener("blur", handleSharedCommitBlur);
  commitListenersInstalled = true;
}

function releaseCommitListenersIfIdle() {
  const ownerDocument = globalThis.document;
  if (!commitListenersInstalled || commitSubscribers.size > 0 || !ownerDocument) return;
  ownerDocument.removeEventListener("pointerdown", handleSharedCommitPointerDown, true);
  globalThis.removeEventListener("blur", handleSharedCommitBlur);
  commitListenersInstalled = false;
}

export function useCommitOnOutsideInteraction<T extends HTMLElement>(
  ref: { current: T | null },
  commitDraft: () => void,
) {
  useEffect(() => {
    if (!globalThis.document) return undefined;
    const subscriber: CommitSubscriber = { ref, commit: commitDraft };
    commitSubscribers.add(subscriber);
    ensureCommitListeners();
    return () => {
      commitSubscribers.delete(subscriber);
      releaseCommitListenersIfIdle();
      commitDraft();
    };
  }, [commitDraft, ref]);
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center px-5 text-center">
      <div className="text-[13px] font-medium text-[#F2F2F2]">{title}</div>
      <div className="mt-1 text-[11.5px] leading-5 text-[#6B6B6B]">{body}</div>
    </div>
  );
}

export function Readout({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <InsRow label={label}>
      <div className={`${fieldClass} text-[#9A9A9A] hover:bg-[#242424]`}>
        {icon ? <FieldGlyph>{icon}</FieldGlyph> : null}
        <span className="min-w-0 flex-1 truncate text-[12px]" style={{ fontFeatureSettings: '"tnum"' }}>
          {value}
        </span>
      </div>
    </InsRow>
  );
}

export function InsSection({
  title,
  children,
  defaultOpen = true,
  disabled = false,
  action,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** When true the section's controls are shown but become read-only (locked). */
  disabled?: boolean;
  /** Optional controls rendered at the right of the header (e.g. an add button).
   *  Rendered inside its own click boundary so it doesn't toggle the section. */
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b" style={{ borderColor: INS.divider }}>
      <div className="flex h-[33px] items-center gap-1 pl-3 pr-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="-ml-0.5 flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent text-left"
        >
          <IconChevronDown
            size={10}
            strokeWidth={2.4}
            className={`shrink-0 text-[#6B6B6B] transition-transform duration-[120ms] ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <span className="truncate text-[12px] font-medium text-[#CFCFCF]">{title}</span>
        </button>
        {action ? (
          <div className="-mr-1 flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            {action}
          </div>
        ) : null}
      </div>
      {open ? (
        <div
          className={`flex flex-col gap-[7px] px-3 pb-3${disabled ? " pointer-events-none select-none opacity-50" : ""}`}
          inert={disabled || undefined}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function InsRow({
  label,
  children,
  align = "center",
}: {
  label?: string;
  children: ReactNode;
  /** Use "start" when the control is taller than one field (e.g. an align pad). */
  align?: "center" | "start";
}) {
  // Label-less rows let a control (or FieldGroup) span the full width.
  if (!label) {
    return <div className="flex min-w-0 items-center gap-1.5">{children}</div>;
  }
  return (
    <div
      className="grid min-w-0 gap-2"
      style={{ gridTemplateColumns: "64px minmax(0, 1fr)", alignItems: align === "start" ? "start" : "center" }}
    >
      <span
        className={`truncate text-[11px] text-[#8A8A8A]${align === "start" ? " pt-[7px]" : ""}`}
        style={{ letterSpacing: "0.1px" }}
      >
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Packs 2–4 fields into one horizontal row (X│Y, W│H), each flexing equally. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>;
}

export function InsInput({
  value,
  onChange,
  placeholder,
  suffix,
  icon,
}: {
  value: string;
  onChange: (v: string) => CommitResult;
  placeholder?: string;
  suffix?: string;
  /** A muted glyph rendered inside the field, left of the value (X, Y, W, …). */
  icon?: ReactNode;
}) {
  const inputWrapperRef = useRef<HTMLDivElement | null>(null);
  const { draftValue, setDraftValue, commitDraft, resetDraft } = useDeferredCommitField(value, onChange);
  useCommitOnOutsideInteraction(inputWrapperRef, commitDraft);

  return (
    <div ref={inputWrapperRef} className={fieldClass}>
      {icon ? <FieldGlyph>{icon}</FieldGlyph> : null}
      <input
        type="text"
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
          else if (e.key === "Escape") { e.preventDefault(); resetDraft(); }
        }}
        placeholder={placeholder}
        className="w-full min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#EDEDED] outline-none placeholder:text-[#5F5F5F]"
        style={{ fontFeatureSettings: '"tnum"' }}
      />
      {suffix ? <span className="ml-0.5 shrink-0 text-[10.5px] text-[#5F5F5F]">{suffix}</span> : null}
    </div>
  );
}

export function InsTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => CommitResult;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { draftValue, setDraftValue, commitDraft, resetDraft } = useDeferredCommitField(value, onChange);
  useCommitOnOutsideInteraction(textareaRef, commitDraft);

  return (
    <textarea
      ref={textareaRef}
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commitDraft(); }
        else if (event.key === "Escape") { event.preventDefault(); resetDraft(); }
      }}
      rows={3}
      className="min-h-[72px] w-full resize-none rounded-[8px] border border-transparent bg-[#242424] px-2.5 py-2 text-[12px] leading-5 text-[#EDEDED] outline-none transition-colors hover:bg-[#2C2C2C] focus:border-[#0D99FF]/70 focus:bg-[#2C2C2C]"
    />
  );
}

export function InsSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className={`${fieldClass} relative pr-6`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent text-[12px] text-[#EDEDED] outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#1E1E1E]">{o}</option>
        ))}
      </select>
      <IconChevronDown size={9} strokeWidth={2} className="pointer-events-none absolute right-2.5 text-[#7C7C7C]" />
    </div>
  );
}

export function InsToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const activeIndex = options.findIndex((o) => o.value === value);
  const n = options.length;
  return (
    <div
      className="relative flex h-[30px] min-w-0 flex-1 rounded-[8px] p-[3px]"
      style={{ background: INS.track }}
    >
      {activeIndex >= 0 ? (
        <span
          aria-hidden
          className="absolute top-[3px] bottom-[3px] rounded-[6px] transition-[left] duration-150 ease-out"
          style={{
            background: INS.active,
            width: `calc(${100 / n}% - 3px)`,
            left: `calc(${(activeIndex * 100) / n}% + 1.5px)`,
            boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          }}
        />
      ) : null}
      {options.map((o) => {
        const isActive = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="relative z-[1] flex min-w-0 flex-1 cursor-pointer items-center justify-center truncate rounded-[6px] border-0 bg-transparent text-[11px] transition-colors"
            style={{ color: isActive ? "#FFFFFF" : "#8A8A8A", fontWeight: isActive ? 500 : 400 }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function InsMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex h-[30px] min-w-0 flex-1 gap-[3px] rounded-[8px] p-[3px]" style={{ background: INS.track }}>
      {options.map((option) => {
        const isActive = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => {
              const next = isActive
                ? value.filter((item) => item !== option.value)
                : [...value, option.value];
              onChange(next);
            }}
            className="min-w-0 flex-1 cursor-pointer truncate rounded-[6px] border-0 text-[11px] transition-colors"
            style={{
              background: isActive ? "rgba(13,153,255,0.20)" : "transparent",
              color: isActive ? "#8FCBFF" : "#8A8A8A",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function InsSlider({
  value,
  min,
  max,
  step,
  onChange,
  onScrubStart,
  onScrubEnd,
  format = String,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Called on pointerdown before the drag — lets the consumer route the
   *  following onChange ticks through transient frames (commit on release, H3). */
  onScrubStart?: () => void;
  /** Called when the drag releases — commit the coalesced scrub as one entry. */
  onScrubEnd?: () => void;
  format?: (value: number) => string;
}) {
  const scrub = useScrubHandlers({ onScrubStart, onScrubEnd });
  const pct = max > min ? clamp(((value - min) / (max - min)) * 100, 0, 100) : 0;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <div className="relative flex h-[30px] min-w-0 flex-1 items-center">
        {/* Track + filled progress, vertically centred behind the native range input. */}
        <span aria-hidden className="pointer-events-none absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: INS.track }} />
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ width: `${pct}%`, background: INS.accent }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={scrub.onScrubStart}
          onPointerUp={scrub.onScrubEnd}
          onPointerCancel={scrub.onScrubEnd}
          onLostPointerCapture={scrub.onScrubEnd}
          onBlur={scrub.onScrubEnd}
          className="ins-slider relative z-[1] h-[30px] min-w-0 flex-1 cursor-pointer appearance-none bg-transparent"
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-[#8A8A8A]">{format(value)}</span>
    </div>
  );
}

export function InsSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 cursor-pointer rounded-full border-0 p-0 transition-colors duration-[150ms]"
      style={{
        width: 30,
        height: 18,
        background: checked ? INS.accent : "#3A3A3A",
      }}
    >
      <span
        aria-hidden
        className="absolute rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-transform duration-[150ms]"
        style={{
          width: 14,
          height: 14,
          top: 2,
          left: 0,
          transform: checked ? "translateX(14px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}
