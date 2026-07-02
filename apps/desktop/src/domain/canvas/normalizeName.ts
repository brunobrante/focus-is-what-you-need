/**
 * Canonical name normalization for case/whitespace/accent-insensitive matching
 * (persisted-vs-mock root reconcile, sibling name lookup, style-name keys).
 *
 * One definition so callers can't drift: three near-identical copies existed and
 * the htmlScene one had dropped the `.trim()`, so the same name normalized
 * differently depending on which copy ran (D3).
 */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
