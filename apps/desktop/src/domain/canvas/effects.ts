// Pure compilation of an element's `effects` list into CSS fragments. Zero I/O,
// zero React — given the effects, the element's render target, and a color-token
// resolver, it returns the strings the renderer drops onto the element's inline
// style. The type-awareness (box-shadow vs filter:drop-shadow vs text-shadow)
// lives here so both `nodeStyle` and `detachedNodeStyle` stay thin.
//
// See docs/planned/inspector-effects.md for the WebKit caveats this encodes.

import type { Effect, EffectType } from "./types";

/** Which CSS mechanism a given element renders its shadows/blur through. */
export type EffectTarget = "box" | "image" | "vector" | "text";

export type CompiledEffects = {
  /** Comma list — boxes only (first listed paints on top). */
  boxShadow?: string;
  /** Comma list — text only. */
  textShadow?: string;
  /** Ordered chain (left-to-right pipeline): drop-shadows on non-boxes, layer
   *  blur, and the color-adjust filters. */
  filter?: string;
  /** Background blur. Emit under both `backdropFilter` and `WebkitBackdropFilter`. */
  backdropFilter?: string;
};

/** Default shadow color when none / no token is set. */
const DEFAULT_SHADOW_COLOR = "rgba(0, 0, 0, 0.25)";

const SHADOW_TYPES: ReadonlySet<EffectType> = new Set(["drop-shadow", "inner-shadow"]);

/** The color-adjust filter functions, mapped to their CSS function name. */
const FILTER_FUNCTIONS: Partial<Record<EffectType, string>> = {
  brightness: "brightness",
  contrast: "contrast",
  saturate: "saturate",
  grayscale: "grayscale",
  invert: "invert",
  sepia: "sepia",
  "hue-rotate": "hue-rotate",
};

/** Identity (no-op) amount for each filter function — used as the default. */
export function defaultFilterAmount(type: EffectType): number {
  switch (type) {
    case "brightness":
    case "contrast":
    case "saturate":
      return 1; // multiplier, 1 = unchanged
    case "hue-rotate":
      return 0; // degrees
    default:
      return 0; // grayscale/invert/sepia, 0..1
  }
}

function isEnabled(effect: Effect): boolean {
  return effect.enabled !== false;
}

function num(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveColor(effect: Effect, resolveRef?: (ref: string | undefined) => string | undefined): string {
  return resolveRef?.(effect.colorRef) ?? effect.color ?? DEFAULT_SHADOW_COLOR;
}

/** Whether the type dropdown should offer this effect for the given target. */
export function effectTypeAvailable(type: EffectType, target: EffectTarget): boolean {
  // Inner shadow is first-class only on boxes (`box-shadow: inset`). The text /
  // SVG tricks (background-clip, inverted-alpha filters) are out of v1 scope, so
  // we hide the option rather than offer something that won't render.
  if (type === "inner-shadow") return target === "box";
  return true;
}

/** Whether the spread control applies (only box-shadow has real spread). */
export function effectSpreadHonored(target: EffectTarget): boolean {
  return target === "box";
}

/**
 * Compile the ordered effects list into CSS fragments for `target`.
 *
 * @param renderScale multiplies every px length (offset/blur/spread/radius) so
 *   effects scale with the zoomed render, matching how other px styles scale.
 * @param resolveRef resolves a token `colorRef` to a live CSS color.
 */
export function compileEffects(
  effects: Effect[] | undefined,
  target: EffectTarget,
  renderScale = 1,
  resolveRef?: (ref: string | undefined) => string | undefined,
): CompiledEffects {
  if (!effects || effects.length === 0) return {};

  const boxShadows: string[] = [];
  const textShadows: string[] = [];
  const filters: string[] = [];
  const backdrops: string[] = [];
  const px = (v: number | undefined, fallback = 0) => num(v, fallback) * renderScale;

  for (const effect of effects) {
    if (!isEnabled(effect)) continue;

    if (SHADOW_TYPES.has(effect.type)) {
      const inset = effect.type === "inner-shadow";
      if (inset && target !== "box") continue; // not renderable elsewhere (v1)
      const x = px(effect.x);
      const y = px(effect.y);
      const blur = Math.max(0, px(effect.blur));
      const color = resolveColor(effect, resolveRef);

      if (target === "box") {
        const spread = px(effect.spread);
        boxShadows.push(`${inset ? "inset " : ""}${x}px ${y}px ${blur}px ${spread}px ${color}`);
      } else if (target === "text") {
        textShadows.push(`${x}px ${y}px ${blur}px ${color}`);
      } else {
        // image / vector — follows the alpha, no spread, no inset.
        filters.push(`drop-shadow(${x}px ${y}px ${blur}px ${color})`);
      }
      continue;
    }

    if (effect.type === "layer-blur") {
      filters.push(`blur(${Math.max(0, px(effect.radius))}px)`);
      continue;
    }

    if (effect.type === "background-blur") {
      backdrops.push(`blur(${Math.max(0, px(effect.radius))}px)`);
      continue;
    }

    const fn = FILTER_FUNCTIONS[effect.type];
    if (fn) {
      const amount = num(effect.amount, defaultFilterAmount(effect.type));
      const value = effect.type === "hue-rotate" ? `${amount}deg` : `${amount}`;
      filters.push(`${fn}(${value})`);
    }
  }

  return {
    boxShadow: boxShadows.length ? boxShadows.join(", ") : undefined,
    textShadow: textShadows.length ? textShadows.join(", ") : undefined,
    filter: filters.length ? filters.join(" ") : undefined,
    backdropFilter: backdrops.length ? backdrops.join(" ") : undefined,
  };
}

const EFFECT_TARGET_BY_TEXT = "text";

/** The render target for an element type (mirrors ElementRenderer's branches). */
export function effectTargetForType(type: string): EffectTarget {
  if (type === EFFECT_TARGET_BY_TEXT) return "text";
  if (type === "image") return "image";
  if (type === "path" || type === "svg") return "vector";
  return "box";
}
