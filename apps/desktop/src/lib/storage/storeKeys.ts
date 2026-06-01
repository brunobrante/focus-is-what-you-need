export const TABLES = {
  meta: "meta",
  projects: "projects",
  screens: "screens",
  components: "components",
  variants: "variants",
  references: "references",
  scenes: "scenes",
  thumbnails: "thumbnails",
  settings: "settings",
  workspaces: "workspaces",
  screenVersions: "screen_versions",
  placements: "placements",
  history: "history",
} as const;

export type TableKey = (typeof TABLES)[keyof typeof TABLES];
