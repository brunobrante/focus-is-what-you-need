import {
  readReferenceStackData,
  loadReferenceStackFile,
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
  if (!data || data.components.length === 0) return null;

  const primaryComponent =
    data.components.find((c) => c.id === data.primaryComponentId) ??
    data.components.find((c) => c.id === data.rootComponentId);
  const thumbnailComponent =
    primaryComponent?.file
      ? primaryComponent
      : pickFallbackStackThumbnailComponent(data.components, data.rootComponentId);
  if (!thumbnailComponent?.file) return null;

  const blob = await loadReferenceStackFile(referenceId, thumbnailComponent.file, "image/png");
  return blob ? URL.createObjectURL(blob) : null;
}

function pickFallbackStackThumbnailComponent(
  components: NonNullable<Awaited<ReturnType<typeof readReferenceStackData>>>["components"],
  rootComponentId: string,
) {
  const withFiles = components.filter((c) => c.id !== rootComponentId && c.file);
  const directChildren = withFiles.filter((c) => c.parentId === rootComponentId);
  const candidates = directChildren.length > 0 ? directChildren : withFiles;
  return candidates.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0] ?? null;
}
