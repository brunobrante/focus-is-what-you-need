import type { CanvasDocument } from "./types";
import { CANVAS_DOCUMENT_SAVED_EVENT } from "./storageKeys";

/**
 * The current-canvas draft is a UI-session cache (not database state): it lives
 * in `localStorage` and a cross-tab/cross-window `CustomEvent` announces each
 * write. The store performs that I/O directly, which made the reducer/effects
 * untestable without a DOM.
 *
 * This port captures exactly the operations the store performs against that
 * cache, so the I/O sits behind an interface with a DOM-backed default. Tests
 * (and non-DOM hosts) can inject their own implementation via
 * {@link setDraftCachePort} — the seam ORG-15 asked for.
 */
export interface DraftCachePort {
  /** Reads the raw persisted draft string for `storageKey`, or `null`. */
  readDraft(storageKey: string): string | null;
  /** Writes the serialized draft `value` under `storageKey`. */
  writeDraft(storageKey: string, value: string): void;
  /**
   * Emits the cross-tab/cross-window "document saved" event so other windows
   * observing the same `storageKey` can react to the new draft.
   */
  emitSaved(storageKey: string, document: CanvasDocument): void;
}

/**
 * Default port: `localStorage` reads/writes plus a `window.dispatchEvent`
 * announcement. Reproduces the store's previous inline behavior byte-for-byte
 * — same storage key, same event name/payload, same swallowed errors.
 */
export const defaultDraftCachePort: DraftCachePort = {
  readDraft(storageKey) {
    return localStorage.getItem(storageKey);
  },
  writeDraft(storageKey, value) {
    localStorage.setItem(storageKey, value);
  },
  emitSaved(storageKey, document) {
    window.dispatchEvent(
      new CustomEvent(CANVAS_DOCUMENT_SAVED_EVENT, {
        detail: { storageKey, document },
      }),
    );
  },
};

let port: DraftCachePort = defaultDraftCachePort;

/** Test/host seam: override the draft-cache port (pass `null` to restore the default). */
export function setDraftCachePort(next: DraftCachePort | null): void {
  port = next ?? defaultDraftCachePort;
}

export function getDraftCachePort(): DraftCachePort {
  return port;
}
