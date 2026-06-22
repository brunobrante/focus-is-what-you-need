/**
 * Command palette registry — the source of truth for everything that shows up
 * when the global search is in ">" (command) mode.
 *
 * This is intentionally a plain, declarative list so functions and settings can
 * be added without touching the search engine. Each command is available in all
 * scopes by default, or restricted to a subset via `scopes`. The `run` callback
 * receives a `CommandContext` with the capabilities a command might need
 * (navigation, closing the palette, etc.).
 *
 * Scope-specific commands that need live state the registry cannot reach (e.g.
 * canvas tools that must dispatch into the active editor) are registered
 * dynamically at runtime through the search source API instead of living here.
 */

import type { SearchScope } from "./searchTypes";

export type CommandContext = {
  /** React Router navigation. */
  navigate: (to: string) => void;
  /** The scope the palette was opened in. */
  scope: SearchScope;
};

export type CommandDefinition = {
  id: string;
  /** User-facing label shown in the palette. */
  title: string;
  /** Grouping label (e.g. "Navigation", "Settings"). */
  section: string;
  /** Extra terms matched against the query. */
  keywords?: string[];
  /** Restrict availability to these scopes. Omit to expose everywhere. */
  scopes?: SearchScope[];
  run: (ctx: CommandContext) => void;
};

export const PALETTE_COMMANDS: CommandDefinition[] = [
  // ── Navigation ────────────────────────────────────────────────────────────
  {
    id: "nav.home",
    title: "Go to Home",
    section: "Navigation",
    keywords: ["start", "recent", "workspaces"],
    run: (ctx) => ctx.navigate("/"),
  },
  {
    id: "nav.projects",
    title: "Go to Projects",
    section: "Navigation",
    keywords: ["workspace", "projects", "files"],
    run: (ctx) => ctx.navigate("/projects"),
  },
  {
    id: "nav.canvas",
    title: "Open Canvas",
    section: "Navigation",
    keywords: ["editor", "edit", "design"],
    run: (ctx) => ctx.navigate("/canvas"),
  },
  {
    id: "nav.references",
    title: "Go to References",
    section: "Navigation",
    keywords: ["inspiration", "gallery", "library"],
    run: (ctx) => ctx.navigate("/references"),
  },
  {
    id: "nav.systemDesign",
    title: "Go to System Design",
    section: "Navigation",
    keywords: ["tokens", "design system", "styles"],
    run: (ctx) => ctx.navigate("/system-design"),
  },
  {
    id: "nav.components",
    title: "Go to Components",
    section: "Navigation",
    keywords: ["global components", "library"],
    run: (ctx) => ctx.navigate("/components"),
  },
  {
    id: "nav.builder",
    title: "Open Builder",
    section: "Navigation",
    keywords: ["generate", "tools", "cut", "stack", "crop"],
    run: (ctx) => ctx.navigate("/generate"),
  },
  // ── Create ────────────────────────────────────────────────────────────────
  {
    id: "create.project",
    title: "New Project",
    section: "Create",
    keywords: ["add", "create project"],
    run: (ctx) => ctx.navigate("/new"),
  },
];
