import type { CSSProperties } from "react";

// Serializes a React `CSSProperties` object (camelCase, numeric px shorthand,
// vendor-prefix capitalization) into a plain CSS declaration string — so the
// exact style object the canvas renderer builds can be emitted as real CSS for
// HTML export. Mirrors React's own style-to-string rules.

// Properties whose numeric values are unitless (React does not append `px`).
const UNITLESS = new Set<string>([
  "opacity",
  "zIndex",
  "fontWeight",
  "lineHeight",
  "flex",
  "flexGrow",
  "flexShrink",
  "order",
  "zoom",
  "fillOpacity",
  "strokeOpacity",
  "aspectRatio",
]);

function hyphenateProp(prop: string): string {
  // Vendor prefixes: React writes `WebkitFoo`/`MozFoo`/`msFoo`/`OFoo`. A leading
  // uppercase (Webkit/Moz/O) becomes `-webkit-`/`-moz-`/`-o-`; `ms` is special
  // (`-ms-`, no leading dash on the engine token in React's convention).
  const kebab = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
  if (/^(webkit|moz|o)-/.test(kebab)) return `-${kebab}`;
  if (/^ms-/.test(kebab)) return `-${kebab}`;
  return kebab;
}

function serializeValue(prop: string, value: string | number): string {
  if (typeof value === "number" && value !== 0 && !UNITLESS.has(prop)) {
    return `${value}px`;
  }
  return String(value);
}

/** Compiles a `CSSProperties` object into `prop: value; …`. Undefined/null
 *  entries are dropped. Order is preserved (insertion order). */
export function cssPropsToString(style: CSSProperties, indent = ""): string {
  const lines: string[] = [];
  for (const [prop, raw] of Object.entries(style)) {
    if (raw === undefined || raw === null || raw === "") continue;
    lines.push(`${indent}${hyphenateProp(prop)}: ${serializeValue(prop, raw as string | number)};`);
  }
  return lines.join("\n");
}

/** Inline `style="…"` form (single line, no trailing newline). */
export function cssPropsToInline(style: CSSProperties): string {
  return cssPropsToString(style).replace(/\n/g, " ").trim();
}
