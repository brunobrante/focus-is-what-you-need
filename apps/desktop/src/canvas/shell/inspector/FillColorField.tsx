// The Fill panel's color control. Unlike the hex-only `InsColor` (borders /
// effects / text), this accepts any CSS color literal — `#RRGGBBAA`,
// `rgb(... / a)`, `color(display-p3 …)`, `oklch(…)` — so wide-gamut (Display P3
// / OKLCH) colors round-trip without being clipped to sRGB hex. It also offers a
// native eyedropper (the web `EyeDropper` API, or the macOS `NSColorSampler`
// fallback in WKWebView) and the same System Design color-token binding.

import { useEffect, useRef, useState } from "react";
import { IconCrosshair, IconLink, IconUnlink } from "@/components/icons";
import { parseTokenRef, tokenRef } from "@/domain/system-design/resolveTokenRef";
import { LINKED_INSTANCE_COLOR } from "@/lib/ui/linkedColor";
import { pickScreenColor } from "@/infrastructure/eyedropper";
import { iconButtonClass, type InsColorToken, InsInput, useScrubHandlers } from "./InsComponents";

export function FillColorField({
  value,
  onChange,
  tokens,
  boundRef,
  onBind,
}: {
  value: string;
  onChange: (value: string) => void;
  tokens?: InsColorToken[];
  /** Current token binding ("colors:<id>"), if bound. */
  boundRef?: string;
  /** Bind to a token ref, or pass undefined to revert to a literal. */
  onBind?: (ref: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const canBind = Boolean(onBind && tokens && tokens.length > 0);
  // The native swatch only speaks 6-digit hex; show black for richer literals.
  const nativeHex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";

  // Dragging inside the OS color picker fires a stream of `input` events (each a
  // transient scrub tick) and one `change` when the picker closes (the commit).
  // Coalesce the whole drag into a single undo entry (H3).
  const scrub = useScrubHandlers();
  const colorInputRef = useRef<HTMLInputElement>(null);
  const scrubbingRef = useRef(false);
  useEffect(() => {
    const el = colorInputRef.current;
    if (!el) return;
    const onNativeChange = () => {
      if (!scrubbingRef.current) return;
      scrubbingRef.current = false;
      scrub.onScrubEnd?.();
    };
    el.addEventListener("change", onNativeChange);
    return () => el.removeEventListener("change", onNativeChange);
  }, [scrub]);
  const onNativeInput = (next: string) => {
    if (!scrubbingRef.current) {
      scrubbingRef.current = true;
      scrub.onScrubStart?.();
    }
    onChange(next);
  };

  if (boundRef && onBind) {
    const boundId = parseTokenRef(boundRef)?.tokenId;
    const token = boundId ? tokens?.find((t) => t.id === boundId) : undefined;
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className="h-[26px] w-[26px] shrink-0 rounded-[7px] ring-1 ring-black/20"
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
        <button
          type="button"
          title="Unbind — revert to a literal color"
          onClick={() => onBind(undefined)}
          className={iconButtonClass}
        >
          <IconUnlink size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-1.5">
      <label
        className="relative h-[26px] w-[26px] shrink-0 cursor-pointer overflow-hidden rounded-[7px] ring-1 ring-black/20"
        style={{ background: value }}
      >
        <input
          ref={colorInputRef}
          type="color"
          value={nativeHex}
          onChange={(e) => onNativeInput(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <InsInput value={value} onChange={onChange} placeholder="#RRGGBB" />
      <button
        type="button"
        title="Pick a color from the screen (eyedropper)"
        onClick={async () => {
          const picked = await pickScreenColor();
          if (picked) onChange(picked);
        }}
        className={iconButtonClass}
      >
        <IconCrosshair size={11} />
      </button>
      {canBind && (
        <button
          type="button"
          title="Bind to a System Design token"
          onClick={() => setOpen((o) => !o)}
          className={iconButtonClass}
        >
          <IconLink size={11} />
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
              <span
                className="h-3 w-3 shrink-0 rounded-[3px] border border-white/10"
                style={{ background: t.value }}
              />
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
