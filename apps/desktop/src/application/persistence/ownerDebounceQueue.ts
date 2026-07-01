/**
 * A per-owner debounce-coalesce queue for off-critical-path work keyed by an
 * `(ownerType, ownerId)` subject. Repeated `schedule` calls for the same owner
 * collapse to one run after `delayMs` of quiet, and runs are serialized through a
 * single write chain so ordering is preserved (ancestor snapshot propagation needs
 * it). `flush` drains everything pending now (tests / explicit shutdown).
 *
 * Both the ancestor-propagation queue and the thumbnail-refresh queue are
 * instances of this — they differ only in `delayMs` and the `run` body (SAVE-8).
 */

type OwnerKeyed = { ownerType: string; ownerId: string };

export type OwnerDebounceQueue<J extends OwnerKeyed> = {
  /** Coalesce `job` for its owner; runs after `delayMs` of quiet. */
  schedule: (job: J) => void;
  /** Run every pending job now and resolve when the queue is empty. */
  flush: () => Promise<void>;
};

export function createOwnerDebounceQueue<J extends OwnerKeyed>(options: {
  delayMs: number;
  run: (job: J) => Promise<void>;
}): OwnerDebounceQueue<J> {
  const { delayMs, run } = options;

  const pendingJobs = new Map<string, J>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let activeFlush: Promise<void> | null = null;
  let writeChain: Promise<void> = Promise.resolve();

  function ownerKey(job: OwnerKeyed): string {
    return `${job.ownerType}:${job.ownerId}`;
  }

  async function runJob(key: string): Promise<void> {
    const job = pendingJobs.get(key);
    if (!job) return;
    pendingJobs.delete(key);
    await run(job);
  }

  /**
   * Append a job to the serialized write chain and return the new tail. The
   * `.catch` is load-bearing: without it a single rejected job leaves `writeChain`
   * in a rejected state, and every later `.then` is skipped — one failure would
   * silently brick all subsequent propagation/thumbnail work for the session.
   */
  function enqueue(key: string): Promise<void> {
    writeChain = writeChain.then(() => runJob(key)).catch((error) => {
      console.error("[ownerDebounceQueue] job failed", error);
    });
    return writeChain;
  }

  function schedule(job: J): void {
    const key = ownerKey(job);
    pendingJobs.set(key, job);

    const existingTimer = timers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        // Serialize runs through the write chain — ordering is load-bearing for
        // ancestor snapshot propagation.
        void enqueue(key);
      }, delayMs),
    );
  }

  function flush(): Promise<void> {
    if (activeFlush) return activeFlush;

    activeFlush = (async () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();

      // Drain through the same write chain, not around it, so a flush can't run a
      // job concurrently with an in-flight scheduled run and break ordering. New
      // jobs may be scheduled while we drain, so loop until nothing is pending.
      while (pendingJobs.size > 0) {
        const keys = Array.from(pendingJobs.keys());
        for (const key of keys) {
          await enqueue(key);
        }
      }
      // Settle any tail already on the chain (e.g. a scheduled run in flight).
      await writeChain;
    })().finally(() => {
      activeFlush = null;
    });

    return activeFlush;
  }

  return { schedule, flush };
}
