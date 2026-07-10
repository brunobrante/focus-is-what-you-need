// The Fill panel's color control. Unlike the hex-only `InsColor` (borders /
// effects / text), its text field accepts any CSS color literal — `#RRGGBBAA`,
// `rgb(... / a)`, `color(display-p3 …)`, `oklch(…)` — so wide-gamut (Display P3
// / OKLCH) colors round-trip without being clipped to sRGB hex. The swatch opens
// the same shared picker every other color control uses (saturation square, hue
// + alpha sliders, eyedropper, recent colors); touching it writes hex.

import { useState } from "react";
import { IconLink, IconUnlink } from "@/components/icons";
import { parseTokenRef, tokenRef } from "@/domain/system-design/resolveTokenRef";
import { LINKED_INSTANCE_COLOR } from "@/lib/ui/linkedColor";
import { ColorSwatch } from "./ColorPicker";
import { iconButtonClass, type InsColorToken, InsInput } from "./InsComponents";

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
      <ColorSwatch value={value} onChange={onChange} size={26} />
      <InsInput value={value} onChange={onChange} placeholder="#RRGGBB" />
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
