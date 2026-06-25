import { invoke } from "@tauri-apps/api/core";

/** Picks a screen color. Uses the web EyeDropper API when available (none in WKWebView),
 * else falls back to the native macOS NSColorSampler via Tauri. Returns #RRGGBB or null if cancelled. */
export async function pickScreenColor(): Promise<string | null> {
  // Prefer the standard web API when the runtime exposes it (e.g. a Chromium
  // dev browser). The app's macOS WKWebView does not, so we fall through to
  // the native Tauri command below.
  if (typeof window !== "undefined" && "EyeDropper" in window) {
    try {
      const EyeDropperCtor = (
        window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }
      ).EyeDropper;
      const result = await new EyeDropperCtor().open();
      return result.sRGBHex ?? null;
    } catch {
      // The user pressed Escape — the spec rejects with an AbortError. Treat
      // any cancellation/failure here as "no color picked".
      return null;
    }
  }

  // Native fallback: AppKit's NSColorSampler. Returns null on user cancel.
  try {
    const hex = await invoke<string | null>("pick_screen_color");
    return hex ?? null;
  } catch {
    return null;
  }
}
