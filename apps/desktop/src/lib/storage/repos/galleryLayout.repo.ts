import { TABLES } from "@/lib/storage/storeKeys";
import { getRecordById, putRecord } from "@/lib/storage/recordStore";

// Per-project Gallery section layout (the collapsible "sections" the user
// arranges screens/components into). This is plain UI state, but CLAUDE.md
// mandates new persisted data goes through the `records` layer / `putRecord`
// rather than ad-hoc localStorage. Keyed by `${projectId}:${kind}`.

export type GallerySection = { id: string; name: string };
export type GalleryLayoutKind = "screens" | "components";

export type GalleryLayoutRow = {
  id: string;
  sections: GallerySection[];
  sectionById: Record<string, string | null>;
};

const layoutId = (projectId: string, kind: GalleryLayoutKind): string =>
  `${projectId}:${kind}`;

export async function getGalleryLayout(
  projectId: string,
  kind: GalleryLayoutKind,
): Promise<GalleryLayoutRow | null> {
  return getRecordById<GalleryLayoutRow>(TABLES.galleryLayout, layoutId(projectId, kind));
}

export function saveGalleryLayout(
  projectId: string,
  kind: GalleryLayoutKind,
  layout: { sections: GallerySection[]; sectionById: Record<string, string | null> },
): void {
  putRecord<GalleryLayoutRow>(TABLES.galleryLayout, {
    id: layoutId(projectId, kind),
    sections: layout.sections,
    sectionById: layout.sectionById,
  });
}
