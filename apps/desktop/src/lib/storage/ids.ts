// Short, client-generated, collision-resistant ids (D10 in Architecture.md).
//
// NOT UUIDv4. Entity / edge / row ids are ~12-char nanoid-style ids. ~71 bits of
// entropy is ample for an offline+online client-generated id space (a 122-bit
// UUID is overkill and costs ~3x the bytes in the hottest blobs, where ids are
// referenced everywhere). Ids stay client-generated strings — no autoincrement,
// so offline creation never collides with the server (D1).
//
// Node ids *inside* `graphJSON` are scene-local and dedup against their own scene
// via `uniqueNodeId` — they do not use this generator.

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
const ID_LENGTH = 12;

/**
 * A ~12-char URL-safe id (64-symbol alphabet → 6 bits/char → ~71 bits). Uses
 * `crypto.getRandomValues` when available (browser, Bun, Node ≥ 19), falling back
 * to `Math.random` only where no crypto exists at all.
 */
export function newId(): string {
  const cryptoObj =
    typeof crypto !== "undefined" && "getRandomValues" in crypto ? crypto : null;
  let out = "";
  if (cryptoObj) {
    const bytes = new Uint8Array(ID_LENGTH);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < ID_LENGTH; i++) {
      out += ALPHABET[bytes[i]! & 63];
    }
    return out;
  }
  for (let i = 0; i < ID_LENGTH; i++) {
    out += ALPHABET[Math.floor(Math.random() * 64)];
  }
  return out;
}

export function now(): number {
  return Date.now();
}
