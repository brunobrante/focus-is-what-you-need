/**
 * Styled text runs (audit item G10).
 *
 * A text element's `content` stays the plain-text projection of the whole
 * paragraph — every caret index, hit test, wrap and export still works off it,
 * and an element with uniform styling carries no runs at all. `runs` is an
 * optional *overlay*: a partition of `content` into consecutive slices, each
 * with an optional style patch layered over the element's own `styles`. So
 * "Already have an account? **Sign in**" is one element with two runs.
 *
 * The invariant every function here preserves: `runsPlainText(runs) === content`
 * and runs are compact (no empty slices, no two adjacent slices with equal
 * style). `runsForContent` re-establishes it defensively when a scene arrives
 * with the two out of sync.
 *
 * Run styles deliberately exclude `fontSize` and `lineHeight`: those set the
 * line box, which the caret layout and the auto-fit height model as one value
 * per paragraph. Size stays element-level; weight, family, italic, color,
 * letter-spacing and strike-through are per-run.
 *
 * Pure module: no DOM, no engine imports.
 */

export interface TextRunStyles {
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: "normal" | "italic";
  color?: string;
  /** letter-spacing in %, same unit as `ElementStyles.letterSpacing`. */
  letterSpacing?: number;
  lineThrough?: boolean;
}

export interface TextRun {
  text: string;
  /** Overrides layered over the element's styles; absent means "inherit all". */
  styles?: TextRunStyles;
}

/** The style keys a run may override — the split point for an inspector patch. */
export const TEXT_RUN_STYLE_KEYS = [
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "color",
  "letterSpacing",
  "lineThrough",
] as const satisfies ReadonlyArray<keyof TextRunStyles>;

export type TextRunStyleKey = (typeof TEXT_RUN_STYLE_KEYS)[number];

/** A run's slice of `content`, with absolute indices. Used by the measurers. */
export interface TextRunSegment {
  start: number;
  end: number;
  styles: TextRunStyles | undefined;
}

export function runsPlainText(runs: readonly TextRun[]): string {
  return runs.map((run) => run.text).join("");
}

function stylesEqual(a: TextRunStyles | undefined, b: TextRunStyles | undefined): boolean {
  if (a === b) return true;
  const left = a ?? {};
  const right = b ?? {};
  return TEXT_RUN_STYLE_KEYS.every((key) => left[key] === right[key]);
}

/** Drops keys set to `undefined`; returns `undefined` for an all-inherit style. */
function compactStyles(styles: TextRunStyles | undefined): TextRunStyles | undefined {
  if (!styles) return undefined;
  const out: TextRunStyles = {};
  let any = false;
  for (const key of TEXT_RUN_STYLE_KEYS) {
    const value = styles[key];
    if (value === undefined) continue;
    // `key` indexes a union of value types; the read above is already narrowed.
    (out as Record<string, unknown>)[key] = value;
    any = true;
  }
  return any ? out : undefined;
}

/**
 * Removes empty runs and merges adjacent equal-styled ones. Returns `undefined`
 * when the result carries no styling at all, which is how a uniform paragraph is
 * stored (no `runs` field, no scene bloat).
 */
export function compactRuns(runs: readonly TextRun[]): TextRun[] | undefined {
  const out: TextRun[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const styles = compactStyles(run.styles);
    const last = out[out.length - 1];
    if (last && stylesEqual(last.styles, styles)) {
      last.text += run.text;
      continue;
    }
    out.push(styles ? { text: run.text, styles } : { text: run.text });
  }
  if (out.length === 0) return undefined;
  if (out.length === 1 && out[0].styles === undefined) return undefined;
  return out;
}

/**
 * The runs to use for `content`. Falls back to a single unstyled run whenever
 * `runs` is absent or has drifted out of sync with the text (a hand-edited scene,
 * an older export) — styling is lost, the text never is.
 */
export function runsForContent(content: string, runs: readonly TextRun[] | undefined): TextRun[] {
  if (runs && runs.length > 0 && runsPlainText(runs) === content) {
    return runs.map((run) => ({ ...run }));
  }
  return [{ text: content }];
}

/** True when the paragraph has no styling overlay worth storing. */
export function runsAreUniform(runs: readonly TextRun[] | undefined): boolean {
  return compactRuns(runs ?? []) === undefined;
}

/** The style overlay in effect at character `index` (the char *after* the caret). */
export function stylesAt(runs: readonly TextRun[], index: number): TextRunStyles | undefined {
  let offset = 0;
  for (const run of runs) {
    if (index < offset + run.text.length) return run.styles;
    offset += run.text.length;
  }
  return runs[runs.length - 1]?.styles;
}

/** Slices runs into the half-open range `[start, end)`, absolute indices kept. */
export function segmentsInRange(
  runs: readonly TextRun[],
  start: number,
  end: number,
): TextRunSegment[] {
  const segments: TextRunSegment[] = [];
  let offset = 0;
  for (const run of runs) {
    const runEnd = offset + run.text.length;
    const from = Math.max(start, offset);
    const to = Math.min(end, runEnd);
    if (from < to) segments.push({ start: from, end: to, styles: run.styles });
    offset = runEnd;
    if (offset >= end) break;
  }
  return segments;
}

/** Splits runs so that every index in `boundaries` falls on a run edge. */
function splitAt(runs: readonly TextRun[], boundaries: readonly number[]): TextRun[] {
  const cuts = new Set(boundaries);
  const out: TextRun[] = [];
  let offset = 0;
  for (const run of runs) {
    let cursor = 0;
    for (let i = 1; i < run.text.length; i += 1) {
      if (!cuts.has(offset + i)) continue;
      out.push({ text: run.text.slice(cursor, i), styles: run.styles });
      cursor = i;
    }
    out.push({ text: run.text.slice(cursor), styles: run.styles });
    offset += run.text.length;
  }
  return out;
}

/**
 * Layers `patch` over every run inside `[start, end)`. A key present with an
 * `undefined` value *clears* that override (back to the element's style), which
 * is how the inspector unsets a per-run weight.
 */
export function applyRunStyles(
  runs: readonly TextRun[],
  start: number,
  end: number,
  patch: Partial<TextRunStyles>,
): TextRun[] | undefined {
  if (start >= end) return compactRuns(runs);
  const split = splitAt(runs, [start, end]);
  const patched: TextRun[] = [];
  let offset = 0;
  for (const run of split) {
    const runEnd = offset + run.text.length;
    const inside = offset >= start && runEnd <= end;
    patched.push(inside ? { text: run.text, styles: { ...run.styles, ...patch } } : run);
    offset = runEnd;
  }
  return compactRuns(patched);
}

/**
 * The overlay shared by every character of `[start, end)`: a key is present only
 * when all covered runs agree on it. A collapsed range reports the style that
 * typing there would inherit. Drives the inspector's mixed-selection display.
 */
export function commonStylesInRange(
  runs: readonly TextRun[],
  start: number,
  end: number,
): TextRunStyles {
  if (start >= end) return { ...(inheritedStylesAt(runs, start) ?? {}) };
  const segments = segmentsInRange(runs, start, end);
  if (segments.length === 0) return {};
  const common: TextRunStyles = { ...(segments[0].styles ?? {}) };
  for (const segment of segments.slice(1)) {
    for (const key of TEXT_RUN_STYLE_KEYS) {
      if (common[key] !== (segment.styles ?? {})[key]) delete common[key];
    }
  }
  return common;
}

/** Word-processor rule: typing inherits the style of the character *before* the caret. */
function inheritedStylesAt(runs: readonly TextRun[], caret: number): TextRunStyles | undefined {
  return caret > 0 ? stylesAt(runs, caret - 1) : runs[0]?.styles;
}

/**
 * Replaces `[start, end)` with `inserted`. Inserted text inherits the style of
 * the run that was there (for a replacement) or of the character before the
 * caret (for a plain insert) — the same rule every text editor uses.
 */
export function spliceRuns(
  runs: readonly TextRun[],
  start: number,
  end: number,
  inserted: string,
): TextRun[] | undefined {
  const styles = end > start ? stylesAt(runs, start) : inheritedStylesAt(runs, start);
  const next: TextRun[] = [];
  let offset = 0;
  for (const run of runs) {
    const runEnd = offset + run.text.length;
    const head = run.text.slice(0, Math.max(0, Math.min(start - offset, run.text.length)));
    const tail = run.text.slice(Math.max(0, Math.min(end - offset, run.text.length)));
    if (head) next.push({ text: head, styles: run.styles });
    if (offset <= start && start < runEnd) {
      // The insertion point lives in this run; emit the new text between the halves.
      if (inserted) next.push({ text: inserted, styles });
    }
    if (tail) next.push({ text: tail, styles: run.styles });
    offset = runEnd;
  }
  // An insert at the very end of the paragraph has no run to land inside.
  if (inserted && start >= offset) next.push({ text: inserted, styles });
  return compactRuns(next);
}

export interface SingleEdit {
  start: number;
  end: number;
  inserted: string;
}

/**
 * Recovers the `(start, end, inserted)` of the single contiguous edit that turned
 * `before` into `after`. A `<textarea>` only ever reports the whole new value, but
 * every keystroke, paste, delete and drop it produces *is* one contiguous edit, so
 * the common prefix/suffix pins it exactly.
 *
 * `caret` (the selection offset **after** the edit) disambiguates the otherwise
 * ambiguous repeated-character cases — deleting the "b" from "abb" is either
 * index 1 or 2, and only the caret says which. Omit it and the plain
 * prefix/suffix diff is used, which is right for a whole-value replacement.
 */
export function diffSingleEdit(before: string, after: string, caret?: number): SingleEdit {
  const prefixLimit = Math.min(before.length, after.length, caret ?? after.length);
  let start = 0;
  while (start < prefixLimit && before[start] === after[start]) start += 1;

  const suffixLimit = Math.min(
    before.length - start,
    after.length - start,
    caret === undefined ? after.length - start : after.length - caret,
  );
  let suffix = 0;
  while (
    suffix < suffixLimit &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    start,
    end: before.length - suffix,
    inserted: after.slice(start, after.length - suffix),
  };
}

/**
 * Re-anchors `runs` onto `after`, given the text it currently describes. The one
 * entry point every text write goes through, so styling survives typing,
 * deleting and pasting without any caller doing index arithmetic.
 */
export function retargetRuns(
  runs: readonly TextRun[] | undefined,
  before: string,
  after: string,
  caret?: number,
): TextRun[] | undefined {
  if (before === after) return compactRuns(runs ?? []);
  if (runsAreUniform(runs)) return undefined;
  const edit = diffSingleEdit(before, after, caret);
  return spliceRuns(runsForContent(before, runs), edit.start, edit.end, edit.inserted);
}

/** Splits an inspector style patch into its per-run and element-level halves. */
export function partitionRunStyles<T extends Record<string, unknown>>(
  patch: T,
): { runPatch: Partial<TextRunStyles>; elementPatch: Partial<T> } {
  const runPatch: Partial<TextRunStyles> = {};
  const elementPatch: Partial<T> = {};
  for (const [key, value] of Object.entries(patch)) {
    if ((TEXT_RUN_STYLE_KEYS as readonly string[]).includes(key)) {
      (runPatch as Record<string, unknown>)[key] = value;
    } else {
      (elementPatch as Record<string, unknown>)[key] = value;
    }
  }
  return { runPatch, elementPatch };
}
