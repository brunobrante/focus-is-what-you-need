import type {
  ComponentRow,
  ProjectDesignSystem,
  ProjectRow,
  ReferenceAttachment,
  ReferenceRow,
} from "@/lib/storage/schema";

export function createDefaultDesignSystem(): ProjectDesignSystem {
  return {
    colors: [
      { id: "color-bg", name: "Background", value: "#0F0F10" },
      { id: "color-surface", name: "Surface", value: "#1E1E1E" },
      { id: "color-text", name: "Text", value: "#F2F2F2" },
      { id: "color-accent", name: "Accent", value: "#5EA2FF" },
    ],
    fonts: [
      {
        id: "font-inter",
        name: "Inter",
        family: "Inter, sans-serif",
        role: "Body",
        preview: "Aa Bb Cc 123",
      },
      {
        id: "font-geist",
        name: "Geist",
        family: "Geist Variable, sans-serif",
        role: "Display",
        preview: "Hierarchy matters",
      },
    ],
    icons: [
      { id: "icon-grid", name: "Grid", glyph: "grid", family: "system" },
      { id: "icon-search", name: "Search", glyph: "search", family: "system" },
      { id: "icon-bell", name: "Bell", glyph: "bell", family: "system" },
      { id: "icon-gear", name: "Gear", glyph: "gear", family: "system" },
    ],
    images: [],
  };
}

export function normalizeProjectRow(row: ProjectRow): ProjectRow {
  return {
    ...row,
    source: row.source ?? "local",
    thumbnailDataUrl: row.thumbnailDataUrl ?? null,
    description: row.description ?? null,
    previewScreenId: row.previewScreenId ?? null,
    designSystem: row.designSystem ?? createDefaultDesignSystem(),
  };
}

export function normalizeComponentRow(row: ComponentRow): ComponentRow {
  return {
    ...row,
    category: row.category ?? null,
    description: row.description ?? null,
    assignedScreenIds: Array.isArray(row.assignedScreenIds) ? row.assignedScreenIds : [],
    sourceNodeId: row.sourceNodeId ?? null,
  };
}

function legacyAttachment(row: ReferenceRow): ReferenceAttachment[] {
  if (row.ownerType === "screen") {
    return [
      {
        projectId: row.projectId ?? "",
        screenId: row.ownerId ?? null,
        componentId: null,
      },
    ].filter((attachment) => attachment.projectId);
  }
  if (row.ownerType === "component") {
    return [
      {
        projectId: row.projectId ?? "",
        screenId: null,
        componentId: row.ownerId ?? null,
      },
    ].filter((attachment) => attachment.projectId);
  }
  if (row.ownerType === "project") {
    return [
      {
        projectId: row.ownerId ?? row.projectId ?? "",
        screenId: null,
        componentId: null,
      },
    ].filter((attachment) => attachment.projectId);
  }
  return [];
}

export function normalizeReferenceRow(row: ReferenceRow): ReferenceRow {
  const attachments = Array.isArray(row.attachments) ? row.attachments : legacyAttachment(row);
  const projectIds =
    Array.isArray(row.projectIds) && row.projectIds.length > 0
      ? row.projectIds
      : Array.from(
          new Set(
            [
              row.projectId,
              ...attachments.map((attachment) => attachment.projectId),
            ].filter((value): value is string => Boolean(value)),
          ),
        );

  return {
    ...row,
    visibility:
      row.visibility ??
      ((row as { scope?: "external" | "local" }).scope === "local" ? "local" : "external"),
    description: row.description ?? "",
    metadata: Array.isArray(row.metadata) ? row.metadata : [],
    thumbnailUrl: row.thumbnailUrl ?? null,
    projectIds,
    attachments,
  };
}
