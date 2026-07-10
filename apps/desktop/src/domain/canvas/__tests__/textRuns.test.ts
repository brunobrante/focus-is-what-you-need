import { describe, expect, it } from "bun:test";
import {
  applyRunStyles,
  commonStylesInRange,
  compactRuns,
  diffSingleEdit,
  partitionRunStyles,
  retargetRuns,
  runsAreUniform,
  runsForContent,
  runsPlainText,
  segmentsInRange,
  spliceRuns,
  stylesAt,
  type TextRun,
} from "../textRuns";

const BOLD = { fontWeight: "700" } as const;
const RED = { color: "#ff0000" } as const;

/** "Already have an account? " + bold "Sign in" — the audit's own example. */
const example: TextRun[] = [
  { text: "Already have an account? " },
  { text: "Sign in", styles: { ...BOLD } },
];

describe("compactRuns", () => {
  it("drops empty slices and merges adjacent equal styles", () => {
    expect(compactRuns([
      { text: "a", styles: { ...BOLD } },
      { text: "" },
      { text: "b", styles: { ...BOLD } },
    ])).toEqual([{ text: "ab", styles: { fontWeight: "700" } }]);
  });

  it("treats an all-undefined style object as no style", () => {
    expect(compactRuns([{ text: "a", styles: { fontWeight: undefined } }])).toBeUndefined();
    expect(compactRuns([{ text: "a" }, { text: "b", styles: {} }])).toBeUndefined();
  });

  it("returns undefined for a paragraph with nothing to overlay", () => {
    expect(compactRuns([])).toBeUndefined();
    expect(compactRuns([{ text: "plain" }])).toBeUndefined();
    expect(runsAreUniform(example)).toBe(false);
  });
});

describe("runsForContent", () => {
  it("keeps runs that match the content", () => {
    expect(runsForContent("Already have an account? Sign in", example)).toEqual(example);
  });

  it("falls back to one unstyled run when runs drift out of sync with the text", () => {
    expect(runsForContent("something else", example)).toEqual([{ text: "something else" }]);
    expect(runsForContent("abc", undefined)).toEqual([{ text: "abc" }]);
  });
});

describe("segmentsInRange / stylesAt", () => {
  it("slices with absolute indices and carries each run's style", () => {
    expect(segmentsInRange(example, 20, 29)).toEqual([
      { start: 20, end: 25, styles: undefined },
      { start: 25, end: 29, styles: { fontWeight: "700" } },
    ]);
    expect(segmentsInRange(example, 5, 5)).toEqual([]);
  });

  it("reads the style of the character at an index", () => {
    expect(stylesAt(example, 0)).toBeUndefined();
    expect(stylesAt(example, 25)).toEqual({ fontWeight: "700" });
    expect(stylesAt(example, 999)).toEqual({ fontWeight: "700" });
  });
});

describe("applyRunStyles", () => {
  it("styles a range that straddles run boundaries", () => {
    const runs = applyRunStyles(example, 20, 29, RED);
    expect(runs).toEqual([
      { text: "Already have an acco" },
      { text: "unt? ", styles: { color: "#ff0000" } },
      { text: "Sign", styles: { fontWeight: "700", color: "#ff0000" } },
      { text: " in", styles: { fontWeight: "700" } },
    ]);
    expect(runsPlainText(runs!)).toBe(runsPlainText(example));
  });

  it("clears an override when the patch carries an explicit undefined", () => {
    expect(applyRunStyles(example, 25, 32, { fontWeight: undefined })).toBeUndefined();
  });

  it("collapses back to no runs once the whole paragraph is uniform again", () => {
    const bolded = applyRunStyles([{ text: "abc" }], 0, 3, BOLD);
    expect(bolded).toEqual([{ text: "abc", styles: { fontWeight: "700" } }]);
    expect(applyRunStyles(bolded!, 0, 3, { fontWeight: undefined })).toBeUndefined();
  });

  it("is a no-op on a collapsed range", () => {
    expect(applyRunStyles(example, 4, 4, RED)).toEqual(example);
  });
});

describe("commonStylesInRange", () => {
  it("keeps only the keys every covered run agrees on", () => {
    const runs = applyRunStyles(example, 0, 32, RED)!;
    expect(commonStylesInRange(runs, 0, 32)).toEqual({ color: "#ff0000" });
    expect(commonStylesInRange(runs, 25, 32)).toEqual({ fontWeight: "700", color: "#ff0000" });
  });

  it("reports mixed weight as absent, not as one of the two values", () => {
    expect(commonStylesInRange(example, 0, 32)).toEqual({});
  });

  it("reports what typing at a collapsed caret would inherit", () => {
    // Caret just after the last plain character: still plain.
    expect(commonStylesInRange(example, 25, 25)).toEqual({});
    // Caret one character into the bold run: bold.
    expect(commonStylesInRange(example, 26, 26)).toEqual({ fontWeight: "700" });
  });
});

describe("spliceRuns", () => {
  it("inserts inheriting the character before the caret", () => {
    // Right before "Sign": the preceding char is plain, so the insert is plain.
    const runs = spliceRuns(example, 25, 25, "now ")!;
    expect(runs).toEqual([
      { text: "Already have an account? now " },
      { text: "Sign in", styles: { fontWeight: "700" } },
    ]);
  });

  it("inserts inside a styled run keeping that style", () => {
    const runs = spliceRuns(example, 29, 29, "-up")!;
    expect(runs).toEqual([
      { text: "Already have an account? " },
      { text: "Sign-up in", styles: { fontWeight: "700" } },
    ]);
  });

  it("takes the style of the selection start when replacing a range", () => {
    const runs = spliceRuns(example, 25, 32, "Register")!;
    expect(runs).toEqual([
      { text: "Already have an account? " },
      { text: "Register", styles: { fontWeight: "700" } },
    ]);
  });

  it("deletes across run boundaries and merges the survivors", () => {
    expect(spliceRuns(example, 20, 29, "")).toEqual([
      { text: "Already have an acco" },
      { text: " in", styles: { fontWeight: "700" } },
    ]);
  });

  it("appends past the end of the last run", () => {
    expect(spliceRuns(example, 32, 32, "!")).toEqual([
      { text: "Already have an account? " },
      { text: "Sign in!", styles: { fontWeight: "700" } },
    ]);
  });

  it("collapses to undefined when the styled text is deleted entirely", () => {
    expect(spliceRuns(example, 25, 32, "")).toBeUndefined();
  });

  it("handles an insert into an empty paragraph", () => {
    expect(spliceRuns([{ text: "" }], 0, 0, "hi")).toBeUndefined();
  });
});

describe("diffSingleEdit", () => {
  it("recovers a plain insert", () => {
    expect(diffSingleEdit("abc", "aXbc", 2)).toEqual({ start: 1, end: 1, inserted: "X" });
  });

  it("recovers a backspace, using the caret to break the repeated-char tie", () => {
    expect(diffSingleEdit("abb", "ab", 1)).toEqual({ start: 1, end: 2, inserted: "" });
    expect(diffSingleEdit("abb", "ab", 2)).toEqual({ start: 2, end: 3, inserted: "" });
  });

  it("recovers a selection replacement", () => {
    expect(diffSingleEdit("hello world", "hello there", 11))
      .toEqual({ start: 6, end: 11, inserted: "there" });
  });

  it("falls back to a prefix/suffix diff without a caret", () => {
    expect(diffSingleEdit("abc", "aXc")).toEqual({ start: 1, end: 2, inserted: "X" });
    expect(diffSingleEdit("abc", "")).toEqual({ start: 0, end: 3, inserted: "" });
    expect(diffSingleEdit("", "abc")).toEqual({ start: 0, end: 0, inserted: "abc" });
  });

  it("reports an empty edit for identical strings", () => {
    expect(diffSingleEdit("abc", "abc", 1)).toEqual({ start: 1, end: 1, inserted: "" });
  });
});

describe("retargetRuns", () => {
  const content = "Already have an account? Sign in";

  it("keeps styling anchored while typing before the styled run", () => {
    const after = "Already have an account?! Sign in";
    expect(retargetRuns(example, content, after, 25)).toEqual([
      { text: "Already have an account?! " },
      { text: "Sign in", styles: { fontWeight: "700" } },
    ]);
  });

  it("keeps styling anchored while typing inside the styled run", () => {
    const after = "Already have an account? Siggn in";
    expect(retargetRuns(example, content, after, 28)).toEqual([
      { text: "Already have an account? " },
      { text: "Siggn in", styles: { fontWeight: "700" } },
    ]);
  });

  it("leaves a uniform paragraph without runs", () => {
    expect(retargetRuns(undefined, "abc", "abcd", 4)).toBeUndefined();
  });

  it("survives a whole-value replacement with no caret", () => {
    expect(retargetRuns(example, content, "Already have an account? Sign out")).toEqual([
      { text: "Already have an account? " },
      { text: "Sign out", styles: { fontWeight: "700" } },
    ]);
  });
});

describe("partitionRunStyles", () => {
  it("splits a typography patch into per-run and element halves", () => {
    expect(partitionRunStyles({ fontWeight: "700", fontSize: 18, typeStyleRef: undefined })).toEqual({
      runPatch: { fontWeight: "700" },
      elementPatch: { fontSize: 18, typeStyleRef: undefined },
    });
  });
});
