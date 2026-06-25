// Pure compilation of an element's `fills` list into the CSS/SVG the renderer
// drops onto the element. Zero I/O, zero React. The type-awareness — the SAME
// fill type compiling to a `background-color`, a `background-image` gradient, an
// `<img object-fit>`, a repeating background, or a `<video>` — lives here so the
// renderer (`ElementRenderer`) and the persistence adapter stay thin.
//
// Element kinds collapse to three render targets:
//   • "box"   — rect / ellipse / polygon / star / icon / wrapper (clipped divs
//               included): paints via comma-stacked `background-image` layers +
//               `background-blend-mode`, clipped by the element's clip-path.
//   • "text"  — same background layers but with `background-clip: text` so the
//               glyphs reveal the paint.
//   • "image" — the Image element's DUAL render path: a single image/video fill
//               renders as `<img>` / `<video>`; a Tile fill or a non-image fill
//               renders as a background div. The renderer reads `imageRender`.
//
// WebKit caveats encoded here (full notes in docs/planned/inspector-fill.md):
//   • Per-fill opacity is baked into color alpha via `color-mix(... transparent)`
//     for solid/gradient (works across sRGB/P3/OKLCH). CSS has no per-layer image
//     opacity, so image/video layer opacity is best-effort (honored on the
//     image-element render path via the element filter, ignored on box layers).
//   • Gradient interpolation (`in oklch` / hue methods) and `color-mix` are
//     Safari-16.2+; this app's WKWebView is modern. sRGB gradients need neither.
//   • Image adjustments: exposure/contrast/saturation → CSS `filter`;
//     temperature/tint/highlights/shadows have no CSS filter, so they compile to
//     an inline SVG `<filter>` referenced as `url(#id)` and applied on the
//     image-element render path only (a box `filter` would also hit children).

import type {
  Fill,
  GradientFill,
  GradientInterpolation,
  ImageAdjustments,
  ImageFill,
  SolidFill,
  VideoFill,
} from "./fill";
import { fillBlend, fillEnabled, fillOpacity } from "./fill";

export type FillTarget = "box" | "text" | "image";

/** Resolves a token `$$ref` to a live CSS value (color or gradient string), or
 *  undefined when unbound/unresolved. */
export type FillRefResolver = (ref: string | undefined) => string | undefined;

/** An inline SVG `<filter>` spec for the image-adjustment chain. Rendered by
 *  the FillDefs component; the element references it via `filter: url(#id)`. */
export type SvgFilterDef = {
  id: string;
  temperature: number; // -100..100
  tint: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
};

/** An exact-gap tile, rendered as an SVG `<pattern>` overlay (CSS has no exact
 *  background tile gap). `cell = motif + gap` in userSpaceOnUse px. */
export type SvgPatternLayer = {
  id: string;
  href: string;
  motif: number; // px
  gap: number; // px
  opacity: number; // 0..1
};

export type CompiledBoxStyle = {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundBlendMode?: string;
  // text-clip painting:
  backgroundClip?: string;
  WebkitBackgroundClip?: string;
  WebkitTextFillColor?: string;
  color?: string;
};

export type ImageRenderDirective =
  | { mode: "img"; src: string; objectFit: string; objectPosition?: string; filter?: string }
  | { mode: "video"; src: string; objectFit: string; objectPosition?: string }
  | { mode: "background"; filter?: string };

export type CompiledFill = {
  /** Inline style for box/text targets (and the background div of an image
   *  element). Empty object when an `<img>`/`<video>` path is used. */
  style: CompiledBoxStyle;
  /** SVG `<filter>` defs to inline (image adjustments). */
  filterDefs: SvgFilterDef[];
  /** Exact-gap tile overlay, when a tile fill sets `tileGap`. At most one. */
  patternLayer?: SvgPatternLayer;
  /** How the Image element should render its content. Only set for target "image". */
  imageRender?: ImageRenderDirective;
  /** True when at least one enabled fill drives the paint (renderer then bypasses
   *  the legacy `background` path). */
  hasFills: boolean;
};

const EMPTY: CompiledFill = { style: {}, filterDefs: [], hasFills: false };

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Apply layer opacity to a color across any color space. */
function withOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  if (opacity <= 0) return "transparent";
  const c = color.trim();
  if (c === "transparent" || c === "none" || c === "") return c;
  return `color-mix(in srgb, ${c} ${round(opacity * 100)}%, transparent)`;
}

function resolveSolidColor(fill: SolidFill, resolveRef?: FillRefResolver): string {
  return resolveRef?.(fill.colorRef) ?? fill.color;
}

/** The `in <space>` clause for a gradient's interpolation (empty for sRGB). */
export function interpolationClause(interp: GradientInterpolation): string {
  switch (interp) {
    case "oklab":
      return "in oklab";
    case "oklch":
      return "in oklch";
    case "oklch-shorter":
      return "in oklch shorter hue";
    default:
      return ""; // srgb — the default, emit nothing
  }
}

/** Build a CSS gradient string for a gradient fill. A token-bound gradient uses
 *  the resolved token value verbatim (interpolation/opacity baking skipped). */
export function gradientToCss(
  fill: GradientFill,
  opacity: number,
  resolveRef?: FillRefResolver,
): string {
  const bound = resolveRef?.(fill.gradientRef);
  if (bound) return bound;

  const clause = interpolationClause(fill.interpolation);
  const stops = (fill.stops.length ? fill.stops : [{ color: "#000000", position: 0 }, { color: "#FFFFFF", position: 1 }])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => `${withOpacity(s.color, opacity)} ${round(s.position * 100)}%`)
    .join(", ");

  if (fill.kind === "radial") {
    return `radial-gradient(${clause ? clause + ", " : ""}${stops})`;
  }
  if (fill.kind === "conic") {
    const head = `from ${round(fill.angle)}deg${clause ? " " + clause : ""}`;
    return `conic-gradient(${head}, ${stops})`;
  }
  const head = `${round(fill.angle)}deg${clause ? " " + clause : ""}`;
  return `linear-gradient(${head}, ${stops})`;
}

/** A solid as a degenerate gradient layer, so it stacks + blends like the rest. */
function solidToLayerImage(color: string): string {
  return `linear-gradient(${color}, ${color})`;
}

/** background-size for an image fill's fit mode. */
function imageBackgroundSize(fill: ImageFill): string {
  switch (fill.fit) {
    case "fill":
      return "cover";
    case "fit":
      return "contain";
    case "tile":
      return fill.scale ? `${round(fill.scale)}%` : "auto";
    case "crop":
      return fill.scale ? `${round(fill.scale)}%` : "auto";
    default:
      return "cover";
  }
}

/** object-fit for an image/video fill's fit mode (single-instance render path). */
function fitToObjectFit(fit: ImageFill["fit"] | VideoFill["fit"]): string {
  switch (fit) {
    case "fill":
      return "cover";
    case "fit":
      return "contain";
    case "crop":
      return "none";
    default:
      return "cover";
  }
}

function hasSvgAdjustments(adj: ImageAdjustments | undefined): boolean {
  if (!adj) return false;
  return Boolean(adj.temperature || adj.tint || adj.highlights || adj.shadows);
}

/** CSS `filter` chain for image adjustments. The clean multipliers map to filter
 *  functions; the SVG-only parts are referenced as `url(#svgFilterId)`. */
export function adjustmentsToFilter(
  adj: ImageAdjustments | undefined,
  svgFilterId: string | undefined,
): string | undefined {
  if (!adj && !svgFilterId) return undefined;
  const parts: string[] = [];
  if (adj) {
    if (typeof adj.exposure === "number" && adj.exposure !== 1) parts.push(`brightness(${round(adj.exposure)})`);
    if (typeof adj.contrast === "number" && adj.contrast !== 1) parts.push(`contrast(${round(adj.contrast)})`);
    if (typeof adj.saturation === "number" && adj.saturation !== 1) parts.push(`saturate(${round(adj.saturation)})`);
  }
  if (svgFilterId) parts.push(`url(#${svgFilterId})`);
  return parts.length ? parts.join(" ") : undefined;
}

type BoxLayer = { image: string; size: string; position: string; repeat: string; blend: string };

function imageLayer(fill: ImageFill, opacity: number): BoxLayer {
  // Per-layer image opacity isn't expressible in CSS background layers; opacity
  // is ignored here (documented) — it IS honored on the image-element path.
  void opacity;
  return {
    image: `url("${fill.src}")`,
    size: imageBackgroundSize(fill),
    position: fill.position ?? "center",
    repeat: fill.fit === "tile" ? "repeat" : "no-repeat",
    blend: fillBlend(fill),
  };
}

/** Compile the box/text background layer stack. `fills[0]` is the TOP layer,
 *  matching the inspector list order and CSS (first background-image = on top). */
function compileBoxLayers(
  fills: Fill[],
  target: FillTarget,
  resolveRef: FillRefResolver | undefined,
  defIdBase: string,
): { style: CompiledBoxStyle; filterDefs: SvgFilterDef[]; patternLayer?: SvgPatternLayer } {
  const layers: BoxLayer[] = [];
  const filterDefs: SvgFilterDef[] = [];
  let patternLayer: SvgPatternLayer | undefined;

  fills.forEach((fill, index) => {
    if (!fillEnabled(fill)) return;
    const op = fillOpacity(fill);

    if (fill.type === "solid") {
      layers.push({
        image: solidToLayerImage(withOpacity(resolveSolidColor(fill, resolveRef), op)),
        size: "auto",
        position: "center",
        repeat: "no-repeat",
        blend: fillBlend(fill),
      });
      return;
    }
    if (fill.type === "gradient") {
      layers.push({
        image: gradientToCss(fill, op, resolveRef),
        size: "auto",
        position: "center",
        repeat: "no-repeat",
        blend: fillBlend(fill),
      });
      return;
    }
    if (fill.type === "image") {
      const src = resolveRef?.(fill.imageRef) ?? fill.src;
      if (fill.fit === "tile" && fill.tileGap && fill.tileGap > 0 && !patternLayer) {
        // Exact-gap tile → SVG <pattern> overlay (CSS can't express the gap).
        patternLayer = {
          id: `${defIdBase}-pat-${index}`,
          href: src,
          motif: fill.scale && fill.scale > 0 ? fill.scale : 64,
          gap: fill.tileGap,
          opacity: op,
        };
        return;
      }
      layers.push(imageLayer({ ...fill, src }, op));
      return;
    }
    // Video isn't paintable as a box background layer (doc: ✗). Skipped here;
    // the image-element path renders it as a <video>.
  });

  if (layers.length === 0 && !patternLayer) {
    return { style: {}, filterDefs, patternLayer };
  }

  const style: CompiledBoxStyle = {
    backgroundColor: "transparent",
  };
  if (layers.length) {
    style.backgroundImage = layers.map((l) => l.image).join(", ");
    style.backgroundSize = layers.map((l) => l.size).join(", ");
    style.backgroundPosition = layers.map((l) => l.position).join(", ");
    style.backgroundRepeat = layers.map((l) => l.repeat).join(", ");
    const blends = layers.map((l) => l.blend);
    if (blends.some((b) => b !== "normal")) style.backgroundBlendMode = blends.join(", ");
  }

  if (target === "text") {
    style.backgroundClip = "text";
    style.WebkitBackgroundClip = "text";
    style.WebkitTextFillColor = "transparent";
    style.color = "transparent";
  }

  return { style, filterDefs, patternLayer };
}

/** The first enabled image/video fill (drives the Image element's render path). */
function primaryImageFill(fills: Fill[]): ImageFill | VideoFill | undefined {
  return fills.find(
    (f) => fillEnabled(f) && (f.type === "image" || f.type === "video"),
  ) as ImageFill | VideoFill | undefined;
}

/**
 * Compile an element's fills for a render target.
 *
 * @param defIdBase a per-element-unique prefix for generated SVG def ids.
 */
export function compileFills(
  fills: Fill[] | undefined,
  target: FillTarget,
  resolveRef?: FillRefResolver,
  defIdBase = "fill",
): CompiledFill {
  if (!fills || fills.length === 0) return EMPTY;
  const active = fills.filter(fillEnabled);
  if (active.length === 0) return { ...EMPTY, hasFills: false };

  if (target === "image") {
    const primary = primaryImageFill(fills);

    if (primary && primary.type === "video") {
      return {
        style: {},
        filterDefs: [],
        hasFills: true,
        imageRender: {
          mode: "video",
          src: primary.src,
          objectFit: fitToObjectFit(primary.fit),
          objectPosition: primary.position,
        },
      };
    }

    if (primary && primary.type === "image") {
      const src = resolveRef?.(primary.imageRef) ?? primary.src;
      const adj = primary.adjustments;
      const svgFilterId = hasSvgAdjustments(adj) ? `${defIdBase}-adj` : undefined;
      const filterDefs: SvgFilterDef[] = svgFilterId
        ? [
            {
              id: svgFilterId,
              temperature: adj?.temperature ?? 0,
              tint: adj?.tint ?? 0,
              highlights: adj?.highlights ?? 0,
              shadows: adj?.shadows ?? 0,
            },
          ]
        : [];
      const filter = adjustmentsToFilter(adj, svgFilterId);

      if (primary.fit === "tile") {
        // Tile → background div (an <img> can never tile). Reuse the box layers,
        // and carry the adjustment filter onto that div.
        const box = compileBoxLayers([primary], "box", resolveRef, defIdBase);
        return {
          style: box.style,
          filterDefs,
          patternLayer: box.patternLayer,
          hasFills: true,
          imageRender: { mode: "background", filter },
        };
      }

      return {
        style: {},
        filterDefs,
        hasFills: true,
        imageRender: {
          mode: "img",
          src,
          objectFit: fitToObjectFit(primary.fit),
          objectPosition: primary.position,
          filter,
        },
      };
    }

    // No image/video fill — the image element is filled with solid/gradient only,
    // so it renders as a background div (no <img>).
    const box = compileBoxLayers(active, "box", resolveRef, defIdBase);
    return {
      style: box.style,
      filterDefs: box.filterDefs,
      patternLayer: box.patternLayer,
      hasFills: true,
      imageRender: { mode: "background" },
    };
  }

  // box / text
  const box = compileBoxLayers(active, target, resolveRef, defIdBase);
  return {
    style: box.style,
    filterDefs: box.filterDefs,
    patternLayer: box.patternLayer,
    hasFills: true,
  };
}

/** The render target for an element type (mirrors ElementRenderer's branches).
 *  Returns null for types that take no fill panel (line/arrow/path/svg). */
export function fillTargetForType(type: string): FillTarget | null {
  if (type === "text") return "text";
  if (type === "image") return "image";
  if (type === "line" || type === "arrow" || type === "path" || type === "svg") return null;
  return "box"; // rect, ellipse, polygon, star, icon, wrapper
}
