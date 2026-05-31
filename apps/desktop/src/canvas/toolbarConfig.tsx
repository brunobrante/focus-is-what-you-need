import type { ReactNode } from "react";
import type { CanvasToolId } from "./tools";

// ── Types ──────────────────────────────────────────────────────────────────────

/** A single tool that can appear in the toolbar. */
export type ToolEntry = {
  id: CanvasToolId;
  name: string;
  icon: ReactNode;
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
  cursor: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3 L5 18 L9.2 14.2 L11.6 19.6 L13.6 18.7 L11.2 13.4 L17 13.4 Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  hand: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 5.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 8.5a1.5 1.5 0 0 1 3 0v6.5c0 3.5-2.7 6-6.5 6S7 18.5 7 15v-2l-2-2.2a1.4 1.4 0 0 1 2-2L8 9.5" />
    </svg>
  ),
  wrapper: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3v18M17 3v18M3 7h18M3 17h18" />
    </svg>
  ),
  rectangle: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
    </svg>
  ),
  ellipse: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <ellipse cx="12" cy="12" rx="8" ry="7" />
    </svg>
  ),
  line: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="5" y1="19" x2="19" y2="5" />
    </svg>
  ),
  arrow: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="19" x2="19" y2="5" />
      <path d="M14 5h5v5" />
    </svg>
  ),
  polygon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 3 20.5 8.5 20.5 15.5 12 21 3.5 15.5 3.5 8.5" />
    </svg>
  ),
  star: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
    </svg>
  ),
  pen: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  text: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 6V4.5h14V6" />
      <path d="M12 4.5v15" />
      <path d="M9 19.5h6" />
    </svg>
  ),
  image: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  svg: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.5 6.5H20l-4.5 4 1.8 6.5L12 15.5 6.7 19l1.8-6.5L4 8.5h4.5Z" />
    </svg>
  ),
  actions: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
};

// ── Tool entry registry ────────────────────────────────────────────────────────

/**
 * Pre-built `ToolEntry` for every known `CanvasToolId`.
 * Use these directly when building a custom `ToolbarConfig`, or import
 * individual entries without re-constructing them.
 */
export const TOOL_ENTRIES: Record<CanvasToolId, ToolEntry> = {
  cursor:    { id: "cursor",    name: "Selecionar", icon: ICONS.cursor },
  hand:      { id: "hand",      name: "Mão",        icon: ICONS.hand },
  wrapper:   { id: "wrapper",   name: "Wrapper",    icon: ICONS.wrapper },
  rectangle: { id: "rectangle", name: "Retângulo",  icon: ICONS.rectangle },
  ellipse:   { id: "ellipse",   name: "Elipse",     icon: ICONS.ellipse },
  line:      { id: "line",      name: "Linha",      icon: ICONS.line },
  arrow:     { id: "arrow",     name: "Seta",       icon: ICONS.arrow },
  polygon:   { id: "polygon",   name: "Polígono",   icon: ICONS.polygon },
  star:      { id: "star",      name: "Estrela",    icon: ICONS.star },
  pen:       { id: "pen",       name: "Caneta",     icon: ICONS.pen },
  text:      { id: "text",      name: "Texto",      icon: ICONS.text },
  image:     { id: "image",     name: "Imagem",     icon: ICONS.image },
  svg:       { id: "svg",       name: "Ícone SVG",  icon: ICONS.svg },
  actions:   { id: "actions",   name: "Ações",      icon: ICONS.actions },
};

// ── Default config ─────────────────────────────────────────────────────────────

/** Shorthand — grab an entry by id. */
const e = (id: CanvasToolId): ToolEntry => TOOL_ENTRIES[id];

/**
 * Default toolbar layout shipped with the canvas editor.
 *
 * Group 1 — Navigation:   [cursor/hand dropdown]
 * Group 2 — Creation:     [wrapper] [shapes dropdown] [pen] [text] [image/svg dropdown]
 * Group 3 — Actions:      [actions]
 */
export const DEFAULT_TOOLBAR_CONFIG: ToolbarConfig = {
  groups: [
    // ── Navigation ──────────────────────────────────────────────────────────
    [
      { kind: "dropdown", tools: [e("cursor"), e("hand")] },
    ],
    // ── Creation ────────────────────────────────────────────────────────────
    [
      { kind: "button",   tool: e("wrapper") },
      { kind: "dropdown", tools: [e("rectangle"), e("ellipse"), e("line"), e("arrow"), e("polygon"), e("star")], badge: "SVG" },
      { kind: "button",   tool: e("pen") },
      { kind: "button",   tool: e("text") },
      { kind: "dropdown", tools: [e("image"), e("svg")] },
    ],
    // ── Actions ─────────────────────────────────────────────────────────────
    [
      { kind: "button", tool: e("actions") },
    ],
  ],
};
