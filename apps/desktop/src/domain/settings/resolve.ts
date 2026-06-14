import { DEFAULT_GLOBAL_SETTINGS } from "./defaults";
import type {
  CanvasKeyCommandId,
  CanvasModifierCommandId,
  DeepPartial,
  GlobalSettings,
  KeyBinding,
  ModifierBinding,
} from "./types";

type KeyboardLikeEvent = {
  key?: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeDeep<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (override === undefined || override === null) return clone(base);
  if (Array.isArray(base) || Array.isArray(override) || !isPlainObject(base) || !isPlainObject(override)) {
    return clone(override as T);
  }

  const next: Record<string, unknown> = clone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    const current = (base as Record<string, unknown>)[key];
    next[key] = mergeDeep(current, value as never);
  }
  return next as T;
}

/**
 * Resolve the effective settings by merging the defaults with an ordered list of
 * override layers. Later layers win, which gives the cascade
 * `defaults -> global -> workspace -> project`. Pass the layers in that order.
 */
export function resolveSettingsLayers(
  layers: ReadonlyArray<DeepPartial<GlobalSettings> | null | undefined>,
): GlobalSettings {
  let resolved = clone(DEFAULT_GLOBAL_SETTINGS);
  for (const layer of layers) {
    if (!layer) continue;
    resolved = mergeDeep(resolved, layer);
  }
  return {
    ...resolved,
    schemaVersion: DEFAULT_GLOBAL_SETTINGS.schemaVersion,
    canvas: {
      ...resolved.canvas,
      tools: {
        ...resolved.canvas.tools,
        // toolbar layout is code-defined; never let stale persisted data override it
        toolbar: DEFAULT_GLOBAL_SETTINGS.canvas.tools.toolbar,
      },
    },
  };
}

export function resolveGlobalSettings(
  overrides?: DeepPartial<GlobalSettings> | null,
): GlobalSettings {
  return resolveSettingsLayers([overrides]);
}

function normalizedKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function matchesKeyBinding(
  event: KeyboardLikeEvent,
  binding: KeyBinding,
): boolean {
  if (binding.code && event.code !== binding.code) return false;
  if (binding.key && normalizedKey(event.key) !== normalizedKey(binding.key)) return false;
  if (!binding.code && !binding.key) return false;

  if (binding.mod) {
    if (!event.metaKey && !event.ctrlKey) return false;
  } else {
    if (event.metaKey !== Boolean(binding.meta)) return false;
    if (event.ctrlKey !== Boolean(binding.ctrl)) return false;
  }

  if (event.altKey !== Boolean(binding.alt)) return false;
  if (event.shiftKey !== Boolean(binding.shift)) return false;
  return true;
}

export function matchesKeyCommand(
  event: KeyboardLikeEvent,
  settings: GlobalSettings,
  commandId: CanvasKeyCommandId,
): boolean {
  return settings.canvas.inputBindings.keyCommands[commandId].some((binding) =>
    matchesKeyBinding(event, binding),
  );
}

export function isModifierCommandActive(
  event: Pick<KeyboardLikeEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  settings: GlobalSettings,
  commandId: CanvasModifierCommandId,
): boolean {
  const binding = settings.canvas.inputBindings.modifierCommands[commandId];
  switch (binding) {
    case "mod":
      return isMacLike() ? event.metaKey : event.ctrlKey;
    case "meta":
      return event.metaKey;
    case "ctrl":
      return event.ctrlKey;
    case "alt":
      return event.altKey;
    case "shift":
      return event.shiftKey;
  }
}

function isMacLike(): boolean {
  const nav = globalThis.navigator as Navigator | undefined;
  return Boolean(nav?.platform && /mac|iphone|ipad|ipod/i.test(nav.platform));
}

function formatKeyName(binding: KeyBinding): string {
  const key = binding.code === "Space" ? "Space" : binding.key ?? binding.code ?? "";
  if (key === "Backspace") return "⌫";
  if (key === "Delete") return "Del";
  if (key === "Escape") return "Esc";
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

export function formatKeyBinding(binding: KeyBinding): string {
  const isMac = isMacLike();
  const parts: string[] = [];
  if (binding.mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (binding.meta) parts.push("⌘");
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.alt) parts.push(isMac ? "⌥" : "Alt");
  if (binding.shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(formatKeyName(binding));
  return parts.join(isMac ? "" : "+");
}

export function formatModifierBinding(binding: ModifierBinding): string {
  const isMac = isMacLike();
  if (binding === "mod") return isMac ? "⌘" : "Ctrl";
  if (binding === "meta") return "⌘";
  if (binding === "ctrl") return "Ctrl";
  if (binding === "alt") return isMac ? "⌥" : "Alt";
  return isMac ? "⇧" : "Shift";
}

export function getPrimaryKeyBindingLabel(
  settings: GlobalSettings,
  commandId: CanvasKeyCommandId,
): string | null {
  const binding = settings.canvas.inputBindings.keyCommands[commandId][0];
  return binding ? formatKeyBinding(binding) : null;
}

export function getModifierBindingLabel(
  settings: GlobalSettings,
  commandId: CanvasModifierCommandId,
): string {
  return formatModifierBinding(settings.canvas.inputBindings.modifierCommands[commandId]);
}

function isOnlyModifierKey(key: string | undefined): boolean {
  return key === "Meta" || key === "Control" || key === "Alt" || key === "Shift";
}

export function captureKeyBinding(event: KeyboardLikeEvent): KeyBinding | null {
  if (isOnlyModifierKey(event.key)) return null;
  const binding: KeyBinding = {};
  if (event.metaKey || event.ctrlKey) binding.mod = true;
  if (event.altKey) binding.alt = true;
  if (event.shiftKey) binding.shift = true;
  if (event.code === "Space") binding.code = "Space";
  else binding.key = event.key;
  return binding;
}

export function captureModifierBinding(event: KeyboardLikeEvent): ModifierBinding | null {
  if (event.key === "Meta") return "mod";
  if (event.key === "Control") return "ctrl";
  if (event.key === "Alt") return "alt";
  if (event.key === "Shift") return "shift";
  if (event.metaKey) return "mod";
  if (event.ctrlKey) return "ctrl";
  if (event.altKey) return "alt";
  if (event.shiftKey) return "shift";
  return null;
}
