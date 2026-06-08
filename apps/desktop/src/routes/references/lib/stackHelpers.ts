import {
  readReferenceStackData,
  loadReferenceStackFile,
  loadReferenceFile,
} from "@/lib/tauri/referenceStorage";

export async function loadStackThumbnailBatch(
  referenceIds: string[],
): Promise<Array<[string, string]>> {
  const entries: Array<[string, string]> = [];
  const queue = [...referenceIds];
  const workerCount = Math.min(4, queue.length);

  async function worker() {
    while (queue.length > 0) {
      const referenceId = queue.shift();
      if (!referenceId) continue;
      const url = await loadStackThumbnailUrl(referenceId).catch(() => null);
      if (url) entries.push([referenceId, url]);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return entries;
}

export async function loadStackThumbnailUrl(referenceId: string): Promise<string | null> {
  const data = await readReferenceStackData(referenceId);
  if (!data) return null;

  // The card represents the image by the root of its first stack. A non-default
  // stack stores its root pixels in a file; the default stack's root is the
  // original image itself (and legacy data without a roots list behaves the same).
  const firstRoot = data.roots?.[0] ?? null;

  if (firstRoot?.file) {
    const blob = await loadReferenceStackFile(referenceId, firstRoot.file, "image/png");
    if (blob) return URL.createObjectURL(blob);
  }

  const original = await loadReferenceFile(referenceId, data.original.ext).catch(() => null);
  return original ? URL.createObjectURL(original) : null;
}
