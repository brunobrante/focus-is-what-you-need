import { expect, test } from "bun:test";

import { wrapLineCount } from "../elementGeometry";

// Reference implementation = the original char-by-char scan the optimized
// wrapLineCount replaced (P7). The two must agree on every input.
function referenceWrapLineCount(
  line: string,
  contentWidth: number,
  measure: (value: string) => number,
): number {
  if (line.length === 0) return 1;
  let count = 0;
  let lineStart = 0;
  let index = 0;
  let lastWrapAfter: number | null = null;
  while (index < line.length) {
    const char = line[index];
    const candidateEnd = index + 1;
    const candidateWidth = measure(line.slice(lineStart, candidateEnd));
    if (candidateWidth <= contentWidth || candidateEnd === lineStart + 1) {
      if (char === " " || char === "\t") lastWrapAfter = candidateEnd;
      index = candidateEnd;
      continue;
    }
    if (lastWrapAfter !== null && lastWrapAfter > lineStart) {
      count += 1;
      lineStart = lastWrapAfter;
      index = lineStart;
      lastWrapAfter = null;
      continue;
    }
    count += 1;
    lineStart = index;
    lastWrapAfter = null;
  }
  return count + 1;
}

// Deterministic monospace measure: every char is one unit wide.
const mono = (value: string) => value.length;

const CASES = [
  "",
  "a",
  "abc",
  "abc def",
  "the quick brown fox",
  "aaaaaaaaaa", // single word longer than the line
  "hi aaaaaaaaaa yo", // long word between short ones
  "  leading",
  "trailing  ",
  "multiple   spaces   here",
  "a b c d e f g h i j k",
  "supercalifragilisticexpialidocious word",
];

test("optimized wrapLineCount matches the char-by-char reference (P7)", () => {
  for (const line of CASES) {
    const measureRange = (from: number, to: number) => mono(line.slice(from, to));
    for (const width of [1, 2, 3, 4, 5, 7, 10, 20]) {
      expect(wrapLineCount(line, 0, line.length, width, measureRange)).toBe(
        referenceWrapLineCount(line, width, mono),
      );
    }
  }
});

// The measured span is addressed by absolute offsets now (G10 measures per styled
// run), so a line in the middle of a paragraph must count the same as on its own.
test("wrapLineCount is independent of where the line sits in the text", () => {
  const paragraph = `prefix\n${CASES[4]}\nsuffix`;
  const start = "prefix\n".length;
  const end = start + CASES[4].length;
  const measureRange = (from: number, to: number) => mono(paragraph.slice(from, to));
  for (const width of [1, 3, 5, 10, 20]) {
    expect(wrapLineCount(paragraph, start, end, width, measureRange)).toBe(
      referenceWrapLineCount(CASES[4], width, mono),
    );
  }
});
