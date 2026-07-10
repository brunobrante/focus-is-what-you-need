import { STANDARD_FONT_FAMILIES } from "@/domain/canvas/fonts";

/**
 * Face loading (audit item G3).
 *
 * Text-fit sizing and the caret layout both measure synchronously against the
 * 2D canvas, so a face that has not been fetched yet measures with the fallback
 * font and the box comes out the wrong size. Installed families need no fetch,
 * but the bundled webfaces do — so every standard face is warmed up as soon as
 * a font surface (inspector or toolbar) mounts, well before the user picks one.
 *
 * Best-effort throughout: a missing `document.fonts` (Bun) or a rejected load
 * leaves measurement exactly where it was.
 */

/** Probe size only — `FontFaceSet` keys faces by family + weight + style, not size. */
const PROBE_SIZE_PX = 16;

function fontShorthand(stack: string, weight: number): string {
  return `${weight} ${PROBE_SIZE_PX}px ${stack}`;
}

function fontSet(): FontFaceSet | null {
  return globalThis.document?.fonts ?? null;
}

/** True when every face of `stack` at `weight` is already usable for measuring. */
export function isFontFaceLoaded(stack: string, weight: number): boolean {
  const fonts = fontSet();
  if (!fonts) return true;
  try {
    return fonts.check(fontShorthand(stack, weight));
  } catch {
    return true;
  }
}

/** Fetches the faces backing `stack` at `weight`; resolves even on failure. */
export async function loadFontFace(stack: string, weight: number): Promise<void> {
  const fonts = fontSet();
  if (!fonts) return;
  try {
    await fonts.load(fontShorthand(stack, weight));
  } catch {
    // An unparsable stack or a font that failed to fetch: keep the fallback.
  }
}

let preloaded: Promise<void> | null = null;

/** Warms every weight of every standard family. Runs once per process. */
export function preloadStandardFontFaces(): Promise<void> {
  preloaded ??= Promise.all(
    STANDARD_FONT_FAMILIES.flatMap((font) =>
      font.weights.map((weight) => loadFontFace(font.stack, weight)),
    ),
  ).then(() => undefined);
  return preloaded;
}
