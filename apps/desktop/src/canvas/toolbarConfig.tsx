import type { ReactNode } from "react";
import type { CanvasToolId } from "./tools";
import { CANVAS_TOOL_COMMANDS } from "@/domain/settings/commands";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { getPrimaryKeyBindingLabel } from "@/domain/settings/resolve";
import type { GlobalSettings, ToolbarLayoutItem } from "@/domain/settings/types";
import {
  IconArrow, IconCursor, IconEllipse, IconHand, IconImage, IconLine,
  IconPen, IconPencil, IconPlus, IconPolygon, IconRectangle, IconScale,
  IconStar, IconSvgShape, IconText, IconWrapper,
} from "@/components/icons";

// ── Types ──────────────────────────────────────────────────────────────────────

/** A single tool that can appear in the toolbar. */
export type ToolEntry = {
  id: CanvasToolId;
  name: string;
  icon: ReactNode;
  shortcut?: string | null;
};

/**
 * A toolbar item is either:
 * - `button`   — a standalone icon button for a single tool
 * - `dropdown` — a combined button + chevron that exposes multiple tools
 *
 * `badge` on a dropdown shows a small render-mode indicator (e.g. "SVG" or "DIV")
 * next to the button. Clicking it opens the matching settings panel.
 */
export type ToolbarItemConfig =
  | { kind: "button"; tool: ToolEntry }
  | { kind: "dropdown"; tools: ToolEntry[]; badge?: string };

/** A group is a horizontal cluster of items separated from other groups by a divider. */
export type ToolbarGroupConfig = ToolbarItemConfig[];

/**
 * Injectable toolbar configuration.
 *
 * Provide a custom config via the `config` prop on `<Toolbar />` to override
 * the default layout on a per-project basis. Each group is rendered with a
 * divider between groups; items within a group are placed side by side.
 */
export type ToolbarConfig = {
  groups: ToolbarGroupConfig[];
};

// ── Icons ──────────────────────────────────────────────────────────────────────

const ICONS: Record<CanvasToolId, ReactNode> = {
  cursor:    <IconCursor />,
  hand:      <IconHand />,
  scale:     <IconScale />,
  wrapper:   <IconWrapper />,
  rectangle: <IconRectangle />,
  ellipse:   <IconEllipse />,
  line:      <IconLine />,
  arrow:     <IconArrow />,
  polygon:   <IconPolygon />,
  star:      <IconStar />,
  pen:       <IconPen />,
  pencil:    <IconPencil />,
  text:      <IconText />,
  image:     <IconImage />,
  svg:       <IconSvgShape />,
  actions:   <IconPlus size={18} strokeWidth={1.7} />,
};

// ── Tool entry registry ────────────────────────────────────────────────────────

/**
 * Pre-built `ToolEntry` for every known `CanvasToolId`.
 * Use these directly when building a custom `ToolbarConfig`, or import
 * individual entries without re-constructing them.
 */
export const TOOL_ENTRIES: Record<CanvasToolId, ToolEntry> = {
  cursor:    { id: "cursor",    name: "Select",     icon: ICONS.cursor },
  hand:      { id: "hand",      name: "Hand",       icon: ICONS.hand },
  scale:     { id: "scale",     name: "Scale",      icon: ICONS.scale },
  wrapper:   { id: "wrapper",   name: "Wrapper",    icon: ICONS.wrapper },
  rectangle: { id: "rectangle", name: "Rectangle",  icon: ICONS.rectangle },
  ellipse:   { id: "ellipse",   name: "Ellipse",    icon: ICONS.ellipse },
  line:      { id: "line",      name: "Line",       icon: ICONS.line },
  arrow:     { id: "arrow",     name: "Arrow",      icon: ICONS.arrow },
  polygon:   { id: "polygon",   name: "Polygon",    icon: ICONS.polygon },
  star:      { id: "star",      name: "Star",       icon: ICONS.star },
  pen:       { id: "pen",       name: "Pen",        icon: ICONS.pen },
  pencil:    { id: "pencil",    name: "Pencil",     icon: ICONS.pencil },
  text:      { id: "text",      name: "Text",       icon: ICONS.text },
  image:     { id: "image",     name: "Image",      icon: ICONS.image },
  svg:       { id: "svg",       name: "SVG",        icon: ICONS.svg },
  actions:   { id: "actions",   name: "Actions",    icon: ICONS.actions },
};

// ── Default config ─────────────────────────────────────────────────────────────

/** Shorthand — grab an entry by id. */
const e = (id: CanvasToolId, settings: GlobalSettings): ToolEntry => ({
  ...TOOL_ENTRIES[id],
  shortcut: getPrimaryKeyBindingLabel(settings, CANVAS_TOOL_COMMANDS[id]),
});

function createToolbarItemConfig(
  item: ToolbarLayoutItem,
  settings: GlobalSettings,
): ToolbarItemConfig | null {
  if (item.kind === "button") {
    return { kind: "button", tool: e(item.tool, settings) };
  }
  const tools = item.tools.map((tool) => e(tool, settings));
  if (tools.length === 0) return null;
  return { kind: "dropdown", tools, badge: item.badge };
}

export function createToolbarConfig(
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): ToolbarConfig {
  return {
    groups: settings.canvas.tools.toolbar.groups
      .map((group) =>
        group
          .map((item) => createToolbarItemConfig(item, settings))
          .filter((item): item is ToolbarItemConfig => item !== null),
      )
      .filter((group) => group.length > 0),
  };
}

/**
 * Default toolbar layout shipped with the canvas editor.
 *
 * Group 1 — Navigation:   [cursor/hand dropdown]
 * Group 2 — Creation:     [wrapper] [shapes dropdown] [pen] [text] [image/svg dropdown]
 * Group 3 — Actions:      [actions]
 */
export const DEFAULT_TOOLBAR_CONFIG: ToolbarConfig = {
  groups: createToolbarConfig(DEFAULT_GLOBAL_SETTINGS).groups,
};
