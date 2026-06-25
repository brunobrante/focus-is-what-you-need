// Inline SVG that the Fill compiler can't express in pure CSS: image-adjustment
// filters (temperature / tint / highlights / shadows) and exact-gap tile
// patterns. Both must be same-document — WebKit drops external `url(file#id)`
// refs — so the renderer inlines them next to the element.
//
// See domain/canvas/fillCompile.ts (SvgFilterDef / SvgPatternLayer).

import type { SvgFilterDef, SvgPatternLayer } from "@/domain/canvas/fillCompile";

// Scale factors mapping the inspector's -100..100 sliders to filter strength.
const TEMP_K = 0.005; // ±100 → ±0.5 channel scale
const TINT_K = 0.004;
const TONE_K = 0.004;

function colorMatrixValues(temperature: number, tint: number): string {
  // Warm (+temperature) lifts red, drops blue; +tint pushes green.
  const r = 1 + temperature * TEMP_K;
  const g = 1 + tint * TINT_K;
  const b = 1 - temperature * TEMP_K;
  // 4×5 matrix, row-major (R, G, B, A).
  return [
    r, 0, 0, 0, 0,
    0, g, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ].join(" ");
}

function FilterEl({ def }: { def: SvgFilterDef }) {
  const needsMatrix = def.temperature !== 0 || def.tint !== 0;
  const needsTone = def.highlights !== 0 || def.shadows !== 0;
  // Highlights brighten/darken the upper tones (gamma exponent); shadows lift or
  // deepen the lower tones (linear offset). Approximate, per the doc.
  const exponent = Math.max(0.1, 1 - def.highlights * TONE_K);
  const offset = def.shadows * TONE_K * 0.5;
  return (
    <filter id={def.id} colorInterpolationFilters="sRGB">
      {needsMatrix ? (
        <feColorMatrix type="matrix" values={colorMatrixValues(def.temperature, def.tint)} />
      ) : null}
      {needsTone ? (
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude={1} exponent={exponent} offset={offset} />
          <feFuncG type="gamma" amplitude={1} exponent={exponent} offset={offset} />
          <feFuncB type="gamma" amplitude={1} exponent={exponent} offset={offset} />
        </feComponentTransfer>
      ) : null}
    </filter>
  );
}

/** Zero-size SVG holding the image-adjustment `<filter>` defs for one element. */
export function FillFilterDefs({ defs }: { defs: SvgFilterDef[] }) {
  if (defs.length === 0) return null;
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        {defs.map((def) => (
          <FilterEl key={def.id} def={def} />
        ))}
      </defs>
    </svg>
  );
}

/** Full-bleed SVG `<pattern>` overlay for an exact-gap tile fill. Sits behind
 *  content (the renderer places it as the first child); the element's own
 *  overflow/clip-path clips it. */
export function FillPatternOverlay({
  layer,
  renderScale = 1,
}: {
  layer: SvgPatternLayer;
  renderScale?: number;
}) {
  const motif = layer.motif * renderScale;
  const cell = (layer.motif + layer.gap) * renderScale;
  return (
    <svg
      aria-hidden
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <defs>
        <pattern id={layer.id} width={cell} height={cell} patternUnits="userSpaceOnUse">
          <image
            href={layer.href}
            width={motif}
            height={motif}
            preserveAspectRatio="xMidYMid slice"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${layer.id})`} opacity={layer.opacity} />
    </svg>
  );
}
