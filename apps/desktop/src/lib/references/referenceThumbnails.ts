// Bakes a static thumbnail (data URL) for a reference card — either the whole
// original image or a specific stack node (root / cut). Cards then render from a
// plain string with no live stack reads. Mirrors the snapshot approach already
// used when attaching whole-image references.

import {
  extFromName,
  loadReferenceFile,
  loadReferenceStackFile,
} from "@/lib/tauri/referenceStorage";

// Originals above this size stay unbaked (the card shows its placeholder),
// matching the prior whole-image behaviour. Crops are always small, so they are
// baked regardless.
const MAX_ORIGINAL_THUMB_BYTES = 1024 * 1024;

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Returns a data URL for a stack node's crop. When `file` is null (the implicit
 * full-image default root) it falls back to the original image. Returns null on
 * any failure so callers can degrade to a placeholder.
 */
export async function bakeStackNodeThumbnail(input: {
  sourceReferenceId: string;
  file: string | null;
  originalExt?: string;
  originalName?: string;
}): Promise<string | null> {
  try {
    if (input.file) {
      const blob = await loadReferenceStackFile(input.sourceReferenceId, input.file, "image/png");
      return blob ? await blobToDataUrl(blob) : null;
    }
    return await bakeOriginalThumbnail(input);
  } catch {
    return null;
  }
}

/** Returns a data URL for the whole original image (size-capped). */
export async function bakeOriginalThumbnail(input: {
  sourceReferenceId: string;
  originalExt?: string;
  originalName?: string;
}): Promise<string | null> {
  try {
    const ext = input.originalExt || (input.originalName ? extFromName(input.originalName) : "");
    if (!ext) return null;
    const blob = await loadReferenceFile(input.sourceReferenceId, ext);
    if (!blob || blob.size > MAX_ORIGINAL_THUMB_BYTES) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}
