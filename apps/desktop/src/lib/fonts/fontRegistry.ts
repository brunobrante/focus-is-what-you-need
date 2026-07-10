import { useEffect, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  type FontFamily,
  mergeFontFamilies,
  STANDARD_FONT_FAMILIES,
  type SystemFontFamilyInfo,
  toFontFamily,
} from "@/domain/canvas/fonts";
import { detectPersistenceRuntime } from "@/infrastructure/persistence/runtime";
import { preloadStandardFontFaces } from "./fontFaces";

/**
 * The process-wide font catalog (audit item G3): the standard stacks, plus the
 * families installed on the machine once they have been enumerated.
 *
 * Enumeration is asynchronous and happens at most once per process. Until it
 * lands, `getFontFamilies()` returns the standard stacks — the picker is usable
 * from the first frame and grows a moment later.
 */

let families: readonly FontFamily[] = STANDARD_FONT_FAMILIES;
let inflight: Promise<readonly FontFamily[]> | null = null;
const listeners = new Set<() => void>();

/** Stable snapshot for `useSyncExternalStore` — the array identity only changes on load. */
export function getFontFamilies(): readonly FontFamily[] {
  return families;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Enumerates the installed families. Desktop goes through the native
 * `list_system_fonts` command (WKWebView has no Local Font Access API); the web
 * build tries `queryLocalFonts`, which needs a granted permission and rejects
 * otherwise. Either way a failure degrades to the standard stacks.
 */
async function loadSystemFonts(): Promise<FontFamily[]> {
  try {
    if (detectPersistenceRuntime() === "desktop") {
      const installed = await invoke<SystemFontFamilyInfo[]>("list_system_fonts");
      return installed.map(toFontFamily);
    }
    const queryLocalFonts = (globalThis as { queryLocalFonts?: () => Promise<FontData[]> })
      .queryLocalFonts;
    if (typeof queryLocalFonts === "function") {
      return groupLocalFontData(await queryLocalFonts());
    }
  } catch {
    // No enumeration backend, or the user denied the local-fonts permission.
  }
  return [];
}

/** The shape `queryLocalFonts` yields; typed here because lib.dom omits it. */
interface FontData {
  readonly family: string;
  readonly style: string;
}

/**
 * `queryLocalFonts` reports one entry per *face*, with the weight only spelled
 * out in the human style name ("Helvetica Neue Bold Italic"). Collapse faces per
 * family and read the two facts the picker needs off that name.
 */
function groupLocalFontData(fonts: readonly FontData[]): FontFamily[] {
  const byFamily = new Map<string, SystemFontFamilyInfo & { weights: number[] }>();
  for (const font of fonts) {
    const entry = byFamily.get(font.family) ?? {
      family: font.family,
      weights: [],
      italic: false,
      monospaced: false,
    };
    const style = font.style.toLowerCase();
    const weight = LOCAL_STYLE_WEIGHTS.find(([name]) => style.includes(name))?.[1] ?? 400;
    if (!entry.weights.includes(weight)) entry.weights.push(weight);
    byFamily.set(font.family, {
      ...entry,
      italic: entry.italic || style.includes("italic") || style.includes("oblique"),
    });
  }
  return [...byFamily.values()].map(toFontFamily).sort((a, b) => a.family.localeCompare(b.family));
}

// Longest names first so "extra bold" is not swallowed by "bold".
const LOCAL_STYLE_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["extra light", 200],
  ["ultra light", 200],
  ["extra bold", 800],
  ["ultra bold", 800],
  ["semibold", 600],
  ["semi bold", 600],
  ["medium", 500],
  ["regular", 400],
  ["normal", 400],
  ["black", 900],
  ["heavy", 900],
  ["light", 300],
  ["thin", 100],
  ["bold", 700],
];

/** Loads the catalog once; concurrent callers share the same promise. */
export function loadFontFamilies(): Promise<readonly FontFamily[]> {
  inflight ??= loadSystemFonts().then((system) => {
    families = mergeFontFamilies(system);
    for (const listener of listeners) listener();
    return families;
  });
  // The standard faces must be resolved before the picker measures text with
  // them (text-fit and the caret layout both read metrics synchronously).
  void preloadStandardFontFaces();
  return inflight;
}

/** Subscribes a component to the catalog, kicking off the load on first mount. */
export function useFontFamilies(): readonly FontFamily[] {
  useEffect(() => {
    void loadFontFamilies();
  }, []);
  return useSyncExternalStore(subscribe, getFontFamilies, getFontFamilies);
}
