export const TABLES = {
  meta: "meta",
  projects: "projects",
  screens: "screens",
  components: "components",
  variants: "variants",
  references: "references",
  referenceLibrary: "reference_library",
  referenceLibraryGroups: "reference_library_groups",
  scenes: "scenes",
  thumbnails: "thumbnails",
  settings: "settings",
  workspaces: "workspaces",
  systemDesigns: "system_designs",
  screenVersions: "screen_versions",
  placements: "placements",
  history: "history",
} as const;

export type TableKey = (typeof TABLES)[keyof typeof TABLES];
