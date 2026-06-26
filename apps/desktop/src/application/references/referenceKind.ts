import type { ReferenceRow } from "@/lib/storage/schema";
import type { MediaKind } from "@/routes/references/types";

/**
 * Default reference card kind for each library media kind. Single source of
 * truth shared by every "create/attach reference" path (UI-12) — the file
 * importer, the library-pick linker, and the Add Reference modal.
 */
export const KIND_BY_MEDIA: Record<MediaKind, ReferenceRow["kind"]> = {
  image: "cards",
  video: "dash",
  figx: "hero",
};
