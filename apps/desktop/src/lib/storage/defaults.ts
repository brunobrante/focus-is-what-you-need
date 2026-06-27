import type {
  ComponentRow,
  ProjectDesignSystem,
  ProjectRow,
  ReferenceAttachment,
  ReferenceRow,
} from "@/lib/storage/schema";
import { componentScopeOf } from "@/application/graph/componentOwnership";

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
    icon: row.icon ?? null,
    thumbnailDataUrl: row.thumbnailDataUrl ?? null,
    description: row.description ?? null,
    previewScreenId: row.previewScreenId ?? null,
    designSystem: row.designSystem ?? createDefaultDesignSystem(),
  };
}

export function normalizeComponentRow(row: ComponentRow): ComponentRow {
  const scope = componentScopeOf(row);
  return {
    ...row,
    workspaceId: row.workspaceId ?? null,
    projectId: row.projectId ?? null,
    category: row.category ?? null,
    description: row.description ?? null,
    assignedScreenIds: Array.isArray(row.assignedScreenIds) ? row.assignedScreenIds : [],
    sourceNodeId: row.sourceNodeId ?? null,
    // Project/workspace-global components are linkable by default; existing rows
    // need no migration. An explicit `linkable: false` is preserved.
    linkable: row.linkable ?? (scope === "project" || scope === "workspace"),
    draftKind: row.draftKind ?? null,
    draftType: row.draftType ?? null,
  };
}

export type ComponentScope = "workspace" | "project" | "screen" | "nested";
// Scope is derived from the `owns` edge via `componentScopeOf`
// (application/graph/componentOwnership.ts); the old field-based `componentScope`
// is gone with the screenId/parentVariantId fields.

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
    stack: row.stack,
    projectIds,
    attachments,
    // Library references are linkable by default; a detached local copy sets
    // these explicitly when it is created.
    linkable: row.linkable ?? true,
    detachedFrom: row.detachedFrom ?? null,
  };
}
