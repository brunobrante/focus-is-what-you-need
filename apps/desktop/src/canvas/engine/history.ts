import type { CanvasDocument, ElementNode } from "./types";

/**
 * Structural deep-equality for the canvas document's pure-data tree (plain
 * objects, arrays, primitives — no class instances or functions). History dedup,
 * the render diff, and instance refresh all decide "did anything change?" through
 * this one function.
 *
 * It is deliberately derived from the *runtime shape* rather than an explicit
 * field list: a hand-maintained comparator (the previous implementation) silently
 * dropped every field added after it was written — `fills`, `effects`,
 * `blendMode`, `cornerRadii`, `lineHeight`, `letterSpacing`, `path`, `viewBox`,
 * `instanceOf`, layout fields — so edits whose only delta was one of those were
 * discarded as "no change", never pushed an undo entry, and never repainted (H1).
 * A structural compare cannot drift out of sync with the type.
 *
 * A missing key and a key set to `undefined` compare equal, so an optional field
 * left off does not read as a change.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const aArr = a as unknown[];
    const bArr = b as unknown[];
    if (aArr.length !== bArr.length) return false;
    for (let index = 0; index < aArr.length; index += 1) {
      if (!deepEqual(aArr[index], bArr[index])) return false;
    }
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  // Compare over both key sets. A key missing on one side reads as `undefined`,
  // so an absent optional field and one explicitly set to `undefined` are equal,
  // while `undefined` vs a real value is (correctly) a difference.
  for (const key in aObj) {
    if (!Object.prototype.hasOwnProperty.call(aObj, key)) continue;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  for (const key in bObj) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) continue;
    if (Object.prototype.hasOwnProperty.call(aObj, key)) continue; // already compared above
    if (bObj[key] !== undefined) return false;
  }
  return true;
}

export function elementNodesEqual(a: ElementNode | undefined, b: ElementNode | undefined): boolean {
  return deepEqual(a, b);
}

export function documentsEqual(a: CanvasDocument, b: CanvasDocument): boolean {
  return deepEqual(a, b);
}

export function limitHistory(history: CanvasDocument[], maxLength = 80): CanvasDocument[] {
  if (history.length <= maxLength) {
    return history;
  }
  return history.slice(history.length - maxLength);
}
