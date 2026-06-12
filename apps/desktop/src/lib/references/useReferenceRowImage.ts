import { useEffect, useState } from "react";
import type { ReferenceRow } from "@/lib/storage/schema";
import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";
import { listReferenceLibraryMeta } from "@/lib/storage/repos/referenceLibrary.repo";

/**
 * Resolves the image URL to render for a reference card.
 *
 * A card's baked `thumbnailUrl` is a data URL, but `bakeOriginalThumbnail` skips
 * originals larger than 1MB (to keep multi-MB base64 out of the structured rows),
 * so a large whole-image reference has no baked thumbnail. When that happens we
 * load the original binary from the reference blob store — adapter-aware
 * (IndexedDB on web, disk via Tauri) and uncapped.
 *
 * The blob may not live under the row's own id: a project reference points at the
 * library image it derives from via `sourceReferenceId`, and legacy/divergent
 * rows can have a broken self-referential link. So we try the row's ids first,
 * then recover through the reference library catalog (by id, then by filename).
 *
 * Returns the baked thumbnail immediately when present; otherwise null until the
 * blob resolves. The owned object URL is revoked on change/unmount.
 */
export function useReferenceRowImage(reference: ReferenceRow): string | null {
  const baked = reference.thumbnailUrl ?? null;
  const { id, sourceReferenceId, title } = reference;

  const [resolved, setResolved] = useState<string | null>(baked);

  useEffect(() => {
    if (baked) {
      setResolved(baked);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setResolved(null);
    void (async () => {
      const blob = await loadReferenceRowBlob({ id, sourceReferenceId, title });
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [baked, id, sourceReferenceId, title]);

  return resolved;
}

async function loadReferenceRowBlob(reference: {
  id: string;
  sourceReferenceId?: string;
  title: string;
}): Promise<Blob | null> {
  const ext = extFromName(reference.title);

  // The blob is usually keyed by the library id (sourceReferenceId), falling back
  // to the row id for whole-image references that share it.
  const directIds = [reference.sourceReferenceId, reference.id].filter(
    (value): value is string => Boolean(value),
  );
  for (const candidateId of directIds) {
    const blob = await loadReferenceFile(candidateId, ext).catch(() => null);
    if (blob) return blob;
  }

  // Recover an orphaned reference whose binary lives under a library entry with a
  // different id (legacy data, or a row imported in another environment): match
  // the catalog by id, then by filename.
  const metas = await listReferenceLibraryMeta().catch(() => []);
  const match =
    metas.find((meta) => meta.id === reference.sourceReferenceId) ??
    metas.find((meta) => meta.id === reference.id) ??
    metas.find((meta) => meta.name === reference.title);
  if (match) {
    const blob = await loadReferenceFile(match.id, match.ext || extFromName(match.name)).catch(
      () => null,
    );
    if (blob) return blob;
  }

  return null;
}
