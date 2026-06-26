/**
 * Command palette registry — the source of truth for everything that shows up
 * when the global search is in ">" (command) mode.
 *
 * This is intentionally a plain, declarative list so functions and settings can
 * be added without touching the search engine. Each command is available in all
 * scopes by default, or restricted to a subset via `scopes`.
 *
 * Scope-specific commands that need live state the registry cannot reach (e.g.
 * canvas tools that must dispatch into the active editor) are registered
 * dynamically at runtime through the search source API instead of living here.
 *
 * This module is pure data: a command's effect is described declaratively (e.g.
 * `navigateTo`), not as a router callback, so the domain layer stays free of any
 * React Router coupling. The application layer maps the declared target onto the
 * real `navigate` (DOM-7).
 */

import type { SearchScope } from "./searchTypes";

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
  /** Declarative navigation target; the application layer pushes this route. */
  navigateTo: string;
};

export const PALETTE_COMMANDS: CommandDefinition[] = [
  // ── Navigation ────────────────────────────────────────────────────────────
  {
    id: "nav.home",
    title: "Go to Home",
    section: "Navigation",
    keywords: ["start", "recent", "workspaces"],
    navigateTo: "/",
  },
  {
    id: "nav.projects",
    title: "Go to Projects",
    section: "Navigation",
    keywords: ["workspace", "projects", "files"],
    navigateTo: "/projects",
  },
  {
    id: "nav.canvas",
    title: "Open Canvas",
    section: "Navigation",
    keywords: ["editor", "edit", "design"],
    navigateTo: "/canvas",
  },
  {
    id: "nav.references",
    title: "Go to References",
    section: "Navigation",
    keywords: ["inspiration", "gallery", "library"],
    navigateTo: "/references",
  },
  {
    id: "nav.systemDesign",
    title: "Go to System Design",
    section: "Navigation",
    keywords: ["tokens", "design system", "styles"],
    navigateTo: "/system-design",
  },
  {
    id: "nav.components",
    title: "Go to Components",
    section: "Navigation",
    keywords: ["global components", "library"],
    navigateTo: "/components",
  },
  {
    id: "nav.builder",
    title: "Open Builder",
    section: "Navigation",
    keywords: ["generate", "tools", "cut", "stack", "crop"],
    navigateTo: "/generate",
  },
  // ── Create ────────────────────────────────────────────────────────────────
  {
    id: "create.project",
    title: "New Project",
    section: "Create",
    keywords: ["add", "create project"],
    navigateTo: "/new",
  },
];
