import type { Project, ProjectComponent, Reference, Screen } from "./types";

export { PROJECT_TYPE_LABEL, PROJECT_TYPE_DIMS } from "./types";

export const PROJECTS: Project[] = [
  {
    id: "p1",
    name: "Delivery App",
    type: "mobile",
    screens: 12,
    updated: "2 hours ago",
  },
  {
    id: "p2",
    name: "Internal Dashboard",
    type: "desktop",
    screens: 8,
    updated: "yesterday",
  },
  {
    id: "p3",
    name: "Notes Editor",
    type: "tablet",
    screens: 5,
    updated: "3 days ago",
  },
  {
    id: "p4",
    name: "Summer Campaign Landing",
    type: "desktop",
    screens: 3,
    updated: "1 week ago",
  },
  {
    id: "p5",
    name: "Alignment Debug",
    type: "mobile",
    screens: 1,
    updated: "now",
  },
];

export const DEFAULT_SCREENS: Screen[] = [
  { id: "home", title: "Home", variant: "hero" },
  { id: "list", title: "List", variant: "list" },
  { id: "detail", title: "Detail", variant: "detail" },
  { id: "form", title: "Form", variant: "form" },
];

export const ALIGNMENT_DEBUG_SCREENS: Screen[] = [
  { id: "alignment-debug", title: "Alignment Debug", variant: "blank" },
];

export function screensForProject(project: Pick<Project, "name">): Screen[] {
  return isAlignmentDebugProject(project.name)
    ? ALIGNMENT_DEBUG_SCREENS
    : DEFAULT_SCREENS;
}

export const PROJECT_COMPONENTS: ProjectComponent[] = [
  {
    id: "header",
    title: "Header",
    kind: "Layout",
    variant: "cheader",
    scope: "global",
    screens: ["Home", "List", "Detail", "Form", "Profile"],
  },
  {
    id: "footer",
    title: "Footer",
    kind: "Layout",
    variant: "cfooter",
    scope: "global",
    screens: ["Home", "List", "Detail", "Form", "Profile"],
  },
  {
    id: "buttons",
    title: "Buttons",
    kind: "Atom",
    variant: "cbtn",
    scope: "global",
    screens: ["Home", "Form", "Detail"],
  },
  {
    id: "input",
    title: "Input field",
    kind: "Atom",
    variant: "cinput",
    scope: "global",
    screens: ["Form", "Profile"],
  },
  {
    id: "hero",
    title: "Hero",
    kind: "Section",
    variant: "chero",
    scope: "screen",
    screens: ["Home"],
  },
  {
    id: "cards",
    title: "Card grid",
    kind: "Pattern",
    variant: "ccards",
    scope: "screen",
    screens: ["List"],
  },
  {
    id: "sidebar",
    title: "Sidebar",
    kind: "Layout",
    variant: "csidebar",
    scope: "screen",
    screens: ["Detail"],
  },
  {
    id: "modal",
    title: "Modal",
    kind: "Overlay",
    variant: "cmodal",
    scope: "screen",
    screens: ["Perfil"],
  },
];

export const SCREEN_COMPONENTS: ProjectComponent[] = [
  { id: "header", title: "Header", kind: "Layout", variant: "cheader", scope: "global", screens: [] },
  { id: "hero", title: "Hero section", kind: "Section", variant: "chero", scope: "screen", screens: [] },
  { id: "buttons", title: "Buttons", kind: "Atom", variant: "cbtn", scope: "global", screens: [] },
  { id: "input", title: "Input field", kind: "Atom", variant: "cinput", scope: "global", screens: [] },
  { id: "cards", title: "Card grid", kind: "Pattern", variant: "ccards", scope: "screen", screens: [] },
  { id: "sidebar", title: "Sidebar", kind: "Layout", variant: "csidebar", scope: "screen", screens: [] },
  {
    id: "modal",
    title: "Login Modal",
    kind: "Overlay",
    variant: "cmodal",
    scope: "screen",
    screens: [],
  },
  { id: "footer", title: "Footer", kind: "Layout", variant: "cfooter", scope: "global", screens: [] },
];

export const REFERENCES: Reference[] = [
  { id: "r1", title: "Linear · Issues", source: "linear.app", origin: "url", thumb: "" },
  { id: "r2", title: "Notion · Empty state", source: "notion.so", origin: "url", thumb: "" },
  { id: "r3", title: "Stripe · Checkout", source: "stripe.com", origin: "url", thumb: "" },
  { id: "r4", title: "Onboarding · Slack", source: "Upload", origin: "upload", thumb: "" },
];

export function isAlignmentDebugProject(name: string | undefined): boolean {
  if (!name) return false;
  const normalized = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return (
    normalized.includes("alignment") &&
    normalized.includes("debug")
  );
}

export function findProjectByName(name: string | undefined): Project | undefined {
  if (!name) return undefined;
  return PROJECTS.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

export function templateForScreenName(name: string): "hero" | "list" | "detail" | "form" | "profile" {
  const s = name.toLowerCase();
  if (s.includes("hero") || s.includes("home")) return "hero";
  if (s.includes("list")) return "list";
  if (s.includes("detail")) return "detail";
  if (s.includes("form")) return "form";
  if (s.includes("profile")) return "profile";
  return "hero";
}

export function neighborScreens(currentName: string): {
  prev: { name: string; tpl: ReturnType<typeof templateForScreenName> };
  next: { name: string; tpl: ReturnType<typeof templateForScreenName> };
} {
  const names = DEFAULT_SCREENS.map((s) => s.title);
  const idx = Math.max(0, names.findIndex((n) => n === currentName));
  const prevName = names[(idx - 1 + names.length) % names.length];
  const nextName = names[(idx + 1) % names.length];
  return {
    prev: { name: prevName, tpl: templateForScreenName(prevName) },
    next: { name: nextName, tpl: templateForScreenName(nextName) },
  };
}
