import { createOwnerDebounceQueue } from "@/application/persistence/ownerDebounceQueue";
import { propagateSceneToParents } from "@/lib/storage/repos/scenes.repo";
import type { SceneOwnerType } from "@/lib/storage/schema";

/**
 * Off-critical-path ancestor propagation. `saveScene` writes the edited scene row
 * synchronously and enqueues a job here; the actual ancestor walk (each hop reads a
 * scene, rebuilds the parent graph, regenerates thumbnails) runs at idle, coalesced
 * per owner. A 60fps drag of one node collapses to a single propagation pass once it
 * settles, instead of multiplying every save by the tree depth on the interaction
 * thread. Mirrors `thumbnailQueue` (which it composes with — propagation schedules
 * each ancestor's thumbnail refresh); both share `createOwnerDebounceQueue` (SAVE-8).
 */

type PropagationJob = {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
};

const PROPAGATION_DELAY_MS = 140;

const queue = createOwnerDebounceQueue<PropagationJob>({
  delayMs: PROPAGATION_DELAY_MS,
  run: (job) => propagateSceneToParents(job),
});

export function schedulePropagation(job: PropagationJob): void {
  queue.schedule(job);
}

/** Drain all pending propagation jobs now (tests; explicit shutdown flush). */
export function flushPropagationJobs(): Promise<void> {
  return queue.flush();
}
