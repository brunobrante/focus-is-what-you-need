import type { ReferenceAttachment, ReferenceRow } from "@/lib/storage/schema";
import { createOrAttachReference } from "@/lib/storage/repos/references.repo";
import { listReferenceLibraryMeta } from "@/lib/storage/repos/referenceLibrary.repo";
import type { MediaKind } from "@/routes/references/types";

const KIND_BY_MEDIA: Record<MediaKind, ReferenceRow["kind"]> = {
  image: "cards",
  video: "dash",
  figx: "hero",
};

/**
 * Link an existing library reference (the whole image, with its stack) into a
 * project/screen/component, reusing the link engine. Used when the Builder is
 * launched from inside a project: on save the worked reference lands back in that
 * owner's references, with no copy — the link shares the library blob by id.
 * Returns the attached row, or null when the reference is not in the library.
 */
export async function linkReferenceToOwner(
  referenceId: string,
  attachment: ReferenceAttachment,
): Promise<ReferenceRow | null> {
  const metas = await listReferenceLibraryMeta();
  const meta = metas.find((entry) => entry.id === referenceId);
  if (!meta) return null;

  return createOrAttachReference({
    title: meta.name,
    source: meta.sourceUrl || `${meta.type} · local`,
    origin: "upload",
    visibility: "local",
    bg: "#101418",
    accent: "#FFFFFF",
    kind: KIND_BY_MEDIA[meta.mediaKind] ?? "cards",
    description: meta.description ?? "",
    metadata: meta.tags ?? [],
    thumbnailUrl: null,
    stack: meta.stack,
    sourceReferenceId: meta.id,
    stackNodeId: null,
    attachment,
  });
}
