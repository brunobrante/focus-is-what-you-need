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
        writeChain = writeChain.then(() => runJob(key));
        void writeChain;
      }, delayMs),
    );
  }

  function flush(): Promise<void> {
    if (activeFlush) return activeFlush;

    activeFlush = (async () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();

      while (pendingJobs.size > 0) {
        const keys = Array.from(pendingJobs.keys());
        for (const key of keys) {
          await runJob(key);
        }
      }
    })().finally(() => {
      activeFlush = null;
    });

    return activeFlush;
  }

  return { schedule, flush };
}
