import { snapshotDataUrlFromGraphJSON } from "@/lib/storage/sceneSnapshots";
import { deleteThumbnailByOwner, upsertThumbnail } from "@/lib/storage/repos/thumbnails.repo";
import { refreshProjectThumbnailForVariantSnapshot } from "@/application/thumbnails/projectThumbnail";
import type { SceneOwnerType } from "@/lib/storage/schema";

type ThumbnailJob = {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
};

const THUMBNAIL_DELAY_MS = 120;

const pendingJobs = new Map<string, ThumbnailJob>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let activeFlush: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();

export function scheduleThumbnailRefresh(job: ThumbnailJob): void {
  const key = ownerKey(job.ownerType, job.ownerId);
  pendingJobs.set(key, job);

  const existingTimer = timers.get(key);
  if (existingTimer) clearTimeout(existingTimer);

  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void enqueueThumbnailJobRun(key);
    }, THUMBNAIL_DELAY_MS),
  );
}

export async function flushThumbnailJobs(): Promise<void> {
  if (activeFlush) return activeFlush;

  activeFlush = (async () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();

    while (pendingJobs.size > 0) {
      const keys = Array.from(pendingJobs.keys());
      for (const key of keys) {
        await runThumbnailJob(key);
      }
    }
  })().finally(() => {
    activeFlush = null;
  });

  return activeFlush;
}

function enqueueThumbnailJobRun(key: string): Promise<void> {
  writeChain = writeChain.then(() => runThumbnailJob(key));
  return writeChain;
}

async function runThumbnailJob(key: string): Promise<void> {
  const job = pendingJobs.get(key);
  if (!job) return;
  pendingJobs.delete(key);

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

function ownerKey(ownerType: SceneOwnerType, ownerId: string): string {
  return `${ownerType}:${ownerId}`;
}
