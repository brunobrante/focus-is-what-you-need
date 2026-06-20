import { propagateSceneToParents } from "@/lib/storage/repos/scenes.repo";
import type { SceneOwnerType } from "@/lib/storage/schema";

/**
 * Off-critical-path ancestor propagation. `saveScene` writes the edited scene row
 * synchronously and enqueues a job here; the actual ancestor walk (each hop reads a
 * scene, rebuilds the parent graph, regenerates thumbnails) runs at idle, coalesced
 * per owner. A 60fps drag of one node collapses to a single propagation pass once it
 * settles, instead of multiplying every save by the tree depth on the interaction
 * thread. Mirrors `thumbnailQueue` (which it composes with — propagation schedules
 * each ancestor's thumbnail refresh).
 */

type PropagationJob = {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
};

const PROPAGATION_DELAY_MS = 140;

const pendingJobs = new Map<string, PropagationJob>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let activeFlush: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();

export function schedulePropagation(job: PropagationJob): void {
  const key = ownerKey(job.ownerType, job.ownerId);
  pendingJobs.set(key, job);

  const existingTimer = timers.get(key);
  if (existingTimer) clearTimeout(existingTimer);

  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void enqueuePropagationRun(key);
    }, PROPAGATION_DELAY_MS),
  );
}

/** Drain all pending propagation jobs now (tests; explicit shutdown flush). */
export async function flushPropagationJobs(): Promise<void> {
  if (activeFlush) return activeFlush;

  activeFlush = (async () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();

    while (pendingJobs.size > 0) {
      const keys = Array.from(pendingJobs.keys());
      for (const key of keys) {
        await runPropagationJob(key);
      }
    }
  })().finally(() => {
    activeFlush = null;
  });

  return activeFlush;
}

function enqueuePropagationRun(key: string): Promise<void> {
  writeChain = writeChain.then(() => runPropagationJob(key));
  return writeChain;
}

async function runPropagationJob(key: string): Promise<void> {
  const job = pendingJobs.get(key);
  if (!job) return;
  pendingJobs.delete(key);
  await propagateSceneToParents(job);
}

function ownerKey(ownerType: SceneOwnerType, ownerId: string): string {
  return `${ownerType}:${ownerId}`;
}
