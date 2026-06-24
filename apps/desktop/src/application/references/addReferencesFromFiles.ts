import type { ReferenceAttachment, ReferenceRow } from "@/lib/storage/schema";
import { createOrAttachReference } from "@/lib/storage/repos/references.repo";
import { putReferenceLibraryMeta } from "@/lib/storage/repos/referenceLibrary.repo";
import { extFromName, type StoredRefMeta } from "@/lib/tauri/referenceStorage";
import { fileToReference } from "@/routes/references/lib/fileHelpers";
import type { MediaKind } from "@/routes/references/types";

const KIND_BY_MEDIA: Record<MediaKind, ReferenceRow["kind"]> = {
  image: "cards",
  video: "dash",
  figx: "hero",
};

/**
 * Upload new files from inside a project/screen/component. Each file is saved to
 * the root reference library (the single source of truth) and immediately linked
 * to the given owner. No per-project copy is made — the link row shares the
 * library blob by id, exactly like attaching an existing library pick. This lets
 * a project reference page add brand-new images while keeping the storage model
 * link-only. Returns the attached rows (failed files are skipped).
 */
export async function addReferencesFromFiles(
  files: File[] | FileList,
  attachment: ReferenceAttachment,
): Promise<ReferenceRow[]> {
  const created: ReferenceRow[] = [];
  for (const file of Array.from(files)) {
    const item = await fileToReference(file);
    if (!item) continue;

    // Catalog the upload in the root library so it also shows on /references.
    const { url: _url, ...rest } = item;
    const meta: StoredRefMeta = { ...rest, ext: item.ext || extFromName(item.name) };
    putReferenceLibraryMeta(meta);

    // Link it to the current owner — the row reuses the library id (and blob).
    const row = await createOrAttachReference({
      title: item.name,
      source: item.sourceUrl || `${item.type} · local`,
      origin: "upload",
      visibility: "local",
      bg: "#101418",
      accent: "#FFFFFF",
      kind: KIND_BY_MEDIA[item.mediaKind] ?? "cards",
      description: item.description ?? "",
      metadata: item.tags ?? [],
      thumbnailUrl: null,
      stack: item.stack,
      sourceReferenceId: item.id,
      stackNodeId: null,
      attachment,
    });
    created.push(row);
  }
  return created;
}
