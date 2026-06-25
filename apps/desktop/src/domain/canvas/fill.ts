// Fill data model — the typed superset behind the Inspector → Fill panel.
//
// A fill is one paint applied to an element; an element can stack several
// (Figma's model), each with its own blend mode + opacity. The same fill type
// compiles to honest, DOM-native CSS/SVG that differs per element kind — a box,
// a `<img>`, an SVG shape, or text — which is the job of `fillCompile.ts`.
//
// Design notes (the WebKit caveats are in docs/planned/inspector-fill.md):
//  • A solid/gradient/image fill is the same record shape with a `type` tag.
//  • Token bindings ($$ref) live ON the fill (colorRef / gradientRef / imageRef)
//    so a single stacked fill can be linked while its siblings stay literal,
//    mirroring how `Effect.colorRef` works.
//  • `ElementStyles.background` / `backgroundRef` stay the representation of the
//    *simple single solid* fill (today's behavior, untouched). `fills` is only
//    populated once a fill becomes non-trivial (gradient/image/video, a second
//    fill, a per-fill blend/opacity). When `fills` is present it is the COMPLETE
//    description and the renderer composites from it; `background` is kept synced
//    to a derived fallback color for legacy color readers (thumbnails, parent
//    overlay, Fast Edit). See `normalizeFills` / `flattenFillsToBackground`.

/** CSS mix-blend / background-blend mode names (the non-separable four render
 *  with slightly different chroma in WebKit — see the doc). */
export type FillBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export type GradientKind = "linear" | "radial" | "conic";

/** Gradient interpolation color space (paper's Average/OKLAB/OKLCH/Nearest-hue).
 *  `oklch-shorter` = "Nearest hue" (shorter hue arc). All but `srgb` are gated at
 *  Safari 16.2 (`color-interpolation-method`). */
export type GradientInterpolation = "srgb" | "oklab" | "oklch" | "oklch-shorter";

export type GradientStop = {
  /** CSS color literal (hex / rgb() / color(display-p3 …) / oklch(…)). */
  color: string;
  /** 0..1 along the gradient axis. */
  position: number;
};

/** How an image fill maps the source into the box.
 *  Tile/Pattern can only render as a repeating background (or SVG <pattern>),
 *  never on a bare `<img>` — that is why the Image element needs a dual render
 *  path (see fillCompile + ElementRenderer). */
export type ImageFit = "fill" | "fit" | "crop" | "tile";

/** Figma-style image adjustments. Exposure/contrast/saturation map cleanly to
 *  CSS `filter`; temperature/tint/highlights/shadows have no CSS-filter
 *  equivalent and compile to an inline SVG `<feColorMatrix>` / `<feComponentTransfer>`
 *  chain (`filter: url(#id)`). All values are 0 = no-op except the three
 *  multipliers, where 1 = no-op. */
export type ImageAdjustments = {
  /** brightness() multiplier, 1 = unchanged. */
  exposure?: number;
  /** contrast() multiplier, 1 = unchanged. */
  contrast?: number;
  /** saturate() multiplier, 1 = unchanged. */
  saturation?: number;
  /** -100..100, 0 = neutral (blue ↔ yellow). SVG feColorMatrix. */
  temperature?: number;
  /** -100..100, 0 = neutral (green ↔ magenta). SVG feColorMatrix. */
  tint?: number;
  /** -100..100, 0 = neutral. SVG feComponentTransfer tone curve. */
  highlights?: number;
  /** -100..100, 0 = neutral. SVG feComponentTransfer tone curve. */
  shadows?: number;
};

type FillCommon = {
  /** Stable id for React keys + reorder; unique within the element. */
  id: string;
  /** Per-fill enable toggle. Absent or true = applied. */
  enabled?: boolean;
  /** 0..1 layer opacity. Baked into color alpha for solid/gradient (via
   *  color-mix); best-effort for image/video layers (CSS has no per-layer image
   *  opacity). */
  opacity?: number;
  /** Per-fill blend mode (background-blend-mode within the element). */
  blendMode?: FillBlendMode;
};

export type SolidFill = FillCommon & {
  type: "solid";
  /** CSS color literal — sRGB hex, rgb(), color(display-p3 …), or oklch(…). */
  color: string;
  /** System Design color-token ref ("colors:<id>"); resolved live. */
  colorRef?: string;
};

export type GradientFill = FillCommon & {
  type: "gradient";
  kind: GradientKind;
  /** Degrees (linear / conic). Ignored by radial. */
  angle: number;
  stops: GradientStop[];
  interpolation: GradientInterpolation;
  /** System Design gradient-token ref ("gradients:<id>"); resolved live. */
  gradientRef?: string;
};

export type ImageFill = FillCommon & {
  type: "image";
  src: string;
  fit: ImageFit;
  /** background/object position, e.g. "center" or "50% 50%". */
  position?: string;
  /** Tile/crop scale as a percentage of natural size (100 = natural). */
  scale?: number;
  /** Exact tile gap in px — forces the SVG `<pattern>` render path. */
  tileGap?: number;
  /** System Design image-token ref ("images:<id>"); resolved live. */
  imageRef?: string;
  adjustments?: ImageAdjustments;
};

export type VideoFill = FillCommon & {
  type: "video";
  src: string;
  /** Video can fill/fit/crop but never tile. */
  fit: "fill" | "fit" | "crop";
  position?: string;
};

export type Fill = SolidFill | GradientFill | ImageFill | VideoFill;

export type FillType = Fill["type"];

/** Lines and arrows have no interior — the Fill panel is hidden for them. */
export function elementTakesFill(type: string): boolean {
  return type !== "line" && type !== "arrow";
}

/** Default opacity (1) when a fill omits it. */
export function fillOpacity(fill: Fill): number {
  return typeof fill.opacity === "number" ? fill.opacity : 1;
}

export function fillEnabled(fill: Fill): boolean {
  return fill.enabled !== false;
}

export function fillBlend(fill: Fill): FillBlendMode {
  return fill.blendMode ?? "normal";
}

// ─── Bridge: simple `background`/`src` representation ⇄ the `fills` array ───────
//
// The Fill panel always edits a normalized `Fill[]`. For the common cases — a
// single plain solid, or a single plain image (fill/fit/crop) on the Image
// element — we keep storing the simple `background`/`backgroundRef` (or
// `src`/`objectFit`) shape and leave `fills` absent, so every legacy reader
// (thumbnails, parent overlay, Fast Edit) is untouched. `fills` is only
// populated once a fill becomes non-trivial.

/** Stable ids for the single fill synthesized from the simple representation. */
export const SYNTH_SOLID_FILL_ID = "f-solid";
export const SYNTH_IMAGE_FILL_ID = "f-image";

const OBJECT_FIT_TO_FIT: Record<string, ImageFill["fit"]> = {
  cover: "fill",
  contain: "fit",
  none: "crop",
  fill: "fill",
  "scale-down": "fit",
};

const FIT_TO_OBJECT_FIT: Record<ImageFill["fit"], string> = {
  fill: "cover",
  fit: "contain",
  crop: "none",
  tile: "cover",
};

export function objectFitToFit(objectFit: string | undefined): ImageFill["fit"] {
  return OBJECT_FIT_TO_FIT[objectFit ?? "cover"] ?? "fill";
}

export function fitToObjectFitValue(fit: ImageFill["fit"]): string {
  return FIT_TO_OBJECT_FIT[fit] ?? "cover";
}

export function synthSolidFill(background?: string, backgroundRef?: string): SolidFill {
  return {
    id: SYNTH_SOLID_FILL_ID,
    type: "solid",
    color: background ?? "#FFFFFF",
    colorRef: backgroundRef,
  };
}

export function synthImageFill(src?: string, objectFit?: string): ImageFill {
  return {
    id: SYNTH_IMAGE_FILL_ID,
    type: "image",
    src: src ?? "",
    fit: objectFitToFit(objectFit),
  };
}

export type FillSource = {
  type: string;
  fills?: Fill[];
  background?: string;
  backgroundRef?: string;
  src?: string;
  objectFit?: string;
};

/** The fills list the inspector should display/edit. Returns the stored `fills`
 *  when present, else a single fill synthesized from the simple representation. */
export function normalizeFills(source: FillSource): Fill[] {
  if (source.fills && source.fills.length > 0) return source.fills;
  if (source.type === "image") return [synthImageFill(source.src, source.objectFit)];
  return [synthSolidFill(source.background, source.backgroundRef)];
}

/** True when `fill` is a plain solid that can round-trip through `background`. */
function isPlainSolid(fill: Fill): fill is SolidFill {
  return (
    fill.type === "solid" &&
    fillEnabled(fill) &&
    fillOpacity(fill) >= 1 &&
    fillBlend(fill) === "normal"
  );
}

/** True when `fill` is a plain image (no tile/gap/adjustments/opacity/blend/ref)
 *  that can round-trip through `src` + `objectFit`. */
function isPlainImage(fill: Fill): fill is ImageFill {
  return (
    fill.type === "image" &&
    fillEnabled(fill) &&
    fillOpacity(fill) >= 1 &&
    fillBlend(fill) === "normal" &&
    fill.fit !== "tile" &&
    !fill.tileGap &&
    !fill.imageRef &&
    !fill.adjustments &&
    !fill.position
  );
}

/** A reasonable solid fallback color for legacy readers when `fills` paints
 *  something non-solid (used to keep `background` sane). Bottom-most solid wins;
 *  else the first gradient's first stop; else undefined (pure image/video). */
export function fillsFallbackColor(fills: Fill[]): string | undefined {
  for (let i = fills.length - 1; i >= 0; i--) {
    const f = fills[i];
    if (f.type === "solid" && fillEnabled(f)) return f.color;
  }
  for (const f of fills) {
    if (f.type === "gradient" && fillEnabled(f) && f.stops.length) return f.stops[0].color;
  }
  return undefined;
}

/** The style/source patch for an edited fills list. Collapses the trivial cases
 *  back to the simple representation; otherwise stores `fills` and syncs a
 *  fallback `background` color. For the Image element, `src`/`objectFit` are
 *  reported separately so the caller can keep the node's image synced. */
export type FillWritePatch = {
  fills?: Fill[];
  background?: string;
  backgroundRef?: string;
  /** Image element only — sync the node `src` (undefined = leave as-is). */
  src?: string;
  /** Image element only — sync `objectFit` (undefined = leave as-is). */
  objectFit?: string;
};

export function fillsToWritePatch(fills: Fill[], elementType: string): FillWritePatch {
  const enabled = fills.filter(fillEnabled);

  // Collapse: a single plain solid → the classic background path.
  if (elementType !== "image" && fills.length === 1 && isPlainSolid(fills[0])) {
    const solid = fills[0];
    return { fills: undefined, background: solid.color, backgroundRef: solid.colorRef };
  }

  // Collapse: the Image element holding a single plain image → src + objectFit.
  if (elementType === "image" && fills.length === 1 && isPlainImage(fills[0])) {
    const img = fills[0];
    return {
      fills: undefined,
      src: img.src,
      objectFit: fitToObjectFitValue(img.fit),
    };
  }

  // Otherwise store the full list and sync a fallback color for legacy readers.
  const patch: FillWritePatch = {
    fills,
    background: fillsFallbackColor(fills),
    backgroundRef: undefined,
  };
  if (elementType === "image") {
    const primary = enabled.find((f) => f.type === "image" || f.type === "video") as
      | ImageFill
      | VideoFill
      | undefined;
    if (primary) {
      patch.src = primary.src;
      if (primary.type === "image") patch.objectFit = fitToObjectFitValue(primary.fit);
    }
  }
  return patch;
}
