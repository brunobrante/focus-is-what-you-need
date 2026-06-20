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
  history: "history",
  checklists: "checklists",
  galleryLayout: "gallery_layout",
} as const;

export type TableKey = (typeof TABLES)[keyof typeof TABLES];
