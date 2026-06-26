import { createOwnerDebounceQueue } from "@/application/persistence/ownerDebounceQueue";
import { snapshotDataUrlFromGraphJSON } from "@/lib/storage/sceneSnapshots";
import { deleteThumbnailByOwner, upsertThumbnail } from "@/lib/storage/repos/thumbnails.repo";
import { refreshProjectThumbnailForVariantSnapshot } from "@/application/thumbnails/projectThumbnail";
import type { SceneOwnerType } from "@/lib/storage/schema";

/**
 * Off-critical-path thumbnail regeneration, coalesced per owner. Shares the debounce
 * machinery with `propagationQueue` via `createOwnerDebounceQueue` (SAVE-8); differs
 * only in the delay and the run body.
 */

type ThumbnailJob = {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
};

const THUMBNAIL_DELAY_MS = 120;

const queue = createOwnerDebounceQueue<ThumbnailJob>({
  delayMs: THUMBNAIL_DELAY_MS,
  run: runThumbnailJob,
});

export function scheduleThumbnailRefresh(job: ThumbnailJob): void {
  queue.schedule(job);
}

export function flushThumbnailJobs(): Promise<void> {
  return queue.flush();
}

async function runThumbnailJob(job: ThumbnailJob): Promise<void> {
  const dataUrl = snapshotDataUrlFromGraphJSON(job.graphJSON);
  if (!dataUrl) {
    await deleteThumbnailByOwner(job.ownerType, job.ownerId);
    return;
  }

  await upsertThumbnail({
    ownerType: job.ownerType,
    ownerId: job.ownerId,
    dataUrl,
  });

  // A snapshot just changed — if it belongs to a screen's variant, refresh the
  // owning project's card thumbnail (off the critical path, gated by the
  // auto-generate setting; the helper ignores non-screen variants).
  void refreshProjectThumbnailForVariantSnapshot(job.ownerId);
}
