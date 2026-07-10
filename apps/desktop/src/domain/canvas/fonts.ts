/**
 * The font catalog (audit item G3).
 *
 * `ElementStyles.fontFamily` stores a full CSS `font-family` **stack**, not a
 * bare family name — that is what the renderer, `fontForNode` and the export CSS
 * already hand to the browser, so the picker keeps writing stacks and keys its
 * selection on the stack's first family. `primaryFamilyOf` is that key.
 *
 * Two groups feed the picker: the standard stacks (bundled webfonts + generic
 * families, always present, identical to the values the toolbar shipped before
 * G3) and whatever is installed on the machine, enumerated natively — see
 * `src/lib/fonts/fontRegistry.ts`.
 *
 * Pure module: no DOM, no Tauri, safe to unit-test.
 */

export type FontSource = "bundled" | "generic" | "system";

export interface FontFamily {
  /** The stack's first family — the picker's key and the display grouping unit. */
  readonly family: string;
  /** What the user reads in the dropdown ("Serif", "Helvetica Neue"). */
  readonly label: string;
  /** The CSS value stored on `ElementStyles.fontFamily`. */
  readonly stack: string;
  /** Weights the family actually ships, ascending. */
  readonly weights: readonly number[];
  readonly italic: boolean;
  readonly source: FontSource;
}

/** The nine CSS weight steps, used for variable fonts and unknown families. */
export const STANDARD_WEIGHTS: readonly number[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

/** `500` → "Medium"; an off-step variable weight stays numeric ("450"). */
export function weightLabel(weight: number): string {
  return WEIGHT_LABELS[weight] ?? String(weight);
}

/**
 * The always-available families. Inter and Geist are the app's own faces (Geist
 * is bundled via `@fontsource-variable/geist`; Inter resolves to an installed
 * copy, else falls through the stack); the rest are CSS generic stacks. Both
 * bundled entries are variable, hence the full weight range.
 */
export const STANDARD_FONT_FAMILIES: readonly FontFamily[] = [
  {
    family: "Inter",
    label: "Inter",
    stack: "Inter, system-ui, sans-serif",
    weights: STANDARD_WEIGHTS,
    italic: true,
    source: "bundled",
  },
  {
    family: "Geist Variable",
    label: "Geist",
    stack: "'Geist Variable', system-ui, sans-serif",
    weights: STANDARD_WEIGHTS,
    italic: false,
    source: "bundled",
  },
  {
    family: "system-ui",
    label: "System",
    stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    weights: STANDARD_WEIGHTS,
    italic: true,
    source: "generic",
  },
  {
    family: "Georgia",
    label: "Serif",
    stack: "Georgia, 'Times New Roman', serif",
    weights: [400, 700],
    italic: true,
    source: "generic",
  },
  {
    family: "ui-monospace",
    label: "Mono",
    stack: "ui-monospace, SFMono-Regular, Menlo, monospace",
    weights: [400, 700],
    italic: true,
    source: "generic",
  },
];

/** The stack every text element falls back to (`--font-sans` in `index.css`). */
export const DEFAULT_FONT_STACK = STANDARD_FONT_FAMILIES[0].stack;

/**
 * The first family of a CSS `font-family` value, unquoted and trimmed.
 * `"'Geist Variable', system-ui"` → `Geist Variable`.
 */
export function primaryFamilyOf(stack: string): string {
  const first = stack.split(",")[0]?.trim() ?? "";
  return first.replace(/^['"]|['"]$/g, "").trim();
}

/** Wraps a family in quotes when it is not a bare CSS identifier sequence. */
function quoteFamily(family: string): string {
  return /^[A-Za-z][A-Za-z0-9-]*(?: [A-Za-z][A-Za-z0-9-]*)*$/.test(family) ? family : `'${family}'`;
}

/** What the native enumeration hands back (`list_system_fonts` in Rust). */
export interface SystemFontFamilyInfo {
  readonly family: string;
  readonly weights: readonly number[];
  readonly italic: boolean;
  readonly monospaced: boolean;
}

/** Turns one native entry into a catalog family with a safe generic fallback. */
export function toFontFamily(info: SystemFontFamilyInfo): FontFamily {
  return {
    family: info.family,
    label: info.family,
    stack: `${quoteFamily(info.family)}, ${info.monospaced ? "monospace" : "sans-serif"}`,
    weights: info.weights.length > 0 ? [...info.weights].sort((a, b) => a - b) : [400],
    italic: info.italic,
    source: "system",
  };
}

/**
 * Merges the installed families into the standard ones, dropping any installed
 * family a standard stack already fronts (so "Inter" is not listed twice).
 */
export function mergeFontFamilies(system: readonly FontFamily[]): FontFamily[] {
  const claimed = new Set(STANDARD_FONT_FAMILIES.map((font) => font.family.toLowerCase()));
  return [
    ...STANDARD_FONT_FAMILIES,
    ...system.filter((font) => !claimed.has(font.family.toLowerCase())),
  ];
}

/** Finds the catalog entry a stored `fontFamily` stack refers to, if any. */
export function findFontFamily(
  families: readonly FontFamily[],
  stack: string | undefined,
): FontFamily | undefined {
  if (!stack) return undefined;
  const key = primaryFamilyOf(stack).toLowerCase();
  return families.find((font) => font.family.toLowerCase() === key);
}

/** The weights offered for a stack — the family's own, or all nine if unknown. */
export function weightsForStack(
  families: readonly FontFamily[],
  stack: string | undefined,
): readonly number[] {
  return findFontFamily(families, stack)?.weights ?? STANDARD_WEIGHTS;
}

/** The closest available weight to `target`, ties going lighter (CSS order). */
export function nearestWeight(weights: readonly number[], target: number): number {
  if (weights.length === 0) return target;
  return weights.reduce((best, weight) =>
    Math.abs(weight - target) < Math.abs(best - target) ? weight : best,
  );
}

export interface FontFamilyOption {
  readonly label: string;
  readonly value: string;
}

export interface FontFamilyGroup {
  readonly label: string;
  readonly options: readonly FontFamilyOption[];
}

/**
 * The picker's `<optgroup>`s. A stack that matches no catalog entry (an old
 * hand-typed value, a font that was uninstalled) is surfaced as its own
 * "Current" group so selecting another family is never a silent data loss.
 */
export function fontFamilyGroups(
  families: readonly FontFamily[],
  currentStack: string | undefined,
): FontFamilyGroup[] {
  const toOption = (font: FontFamily): FontFamilyOption => ({ label: font.label, value: font.stack });
  const standard = families.filter((font) => font.source !== "system");
  const installed = families.filter((font) => font.source === "system");

  const groups: FontFamilyGroup[] = [];
  if (currentStack && !families.some((font) => font.stack === currentStack)) {
    groups.push({
      label: "Current",
      options: [{ label: primaryFamilyOf(currentStack) || currentStack, value: currentStack }],
    });
  }
  groups.push({ label: "Standard", options: standard.map(toOption) });
  if (installed.length > 0) {
    groups.push({ label: "Installed", options: installed.map(toOption) });
  }
  return groups;
}
