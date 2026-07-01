import { useMemo } from "react";
import { sanitizeSvg } from "@/canvas/engine/vector/sanitizeSvg";
import type { IconToken } from "@/lib/storage/schema";

/**
 * Turn stored icon markup into a sized, sanitized, self-contained `<svg>` string
 * safe to inline. Re-sanitizing here is defensive (the markup was already cleaned
 * on import/save) and lets us force the box to `size` regardless of the source's
 * own width/height. Returns null when there is nothing renderable.
 */
export function sizedIconSvg(svg: string | undefined, size: number): string | null {
  if (!svg || !svg.trim()) return null;
  const el = sanitizeSvg(svg);
  if (!el) return null;
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  el.style.display = "block";
  return el.outerHTML;
}

/**
 * Render an icon token everywhere. Prefers native inline SVG (crisp, recolorable
 * via `currentColor`); falls back to the legacy emoji `glyph`, then to a neutral
 * placeholder. Inline SVG in the DOM is WKWebView-safe — the `<img>`/foreignObject
 * trap only bites SVG loaded through `<img src>`.
 */
export function IconGlyph({ icon, size }: { icon: IconToken; size: number }) {
  const markup = useMemo(() => sizedIconSvg(icon.svg, size), [icon.svg, size]);

  if (markup) {
    return (
      <span
        aria-hidden
        className="inline-grid place-items-center"
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  }
  if (icon.glyph) {
    return (
      <span className="grid place-items-center leading-none" style={{ width: size, height: size, fontSize: size }}>
        {icon.glyph}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded border border-dashed border-[var(--border-strong)]"
      style={{ width: size, height: size }}
    />
  );
}
