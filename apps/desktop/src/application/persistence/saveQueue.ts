import type { PersistencePort } from "@/domain/persistence/persistencePort";
import { mutationKey, type Mutation } from "@/domain/persistence/mutations";

/**
 * The single save queue. Record mutations (deltas) are coalesced by key, then
 * drained in batches off the interaction path — the UI never awaits the
 * database.
 *
 *  enqueue(mutation) ──► Map<key, Mutation> ──► flush(): one applyBatch
 *        │ UI continues          │ last-write-wins         │ 1 transaction
 *
 * A persisted outbox survives a crash: the pending batch is written before each
 * flush and cleared on ack, then replayed on boot.
 */

export type SaveStatus = "idle" | "saving" | "retrying" | "error";

export interface OutboxStore {
  load(): Promise<Mutation[]>;
  save(mutations: Mutation[]): Promise<void>;
  clear(): Promise<void>;
}

export type SaveQueueOptions = {
  outbox?: OutboxStore;
  /** Auto-schedule a flush after each enqueue. Disable in unit tests. */
  autoFlush?: boolean;
  /** Custom flush scheduler (defaults to microtask + idle callback). */
  schedule?: (run: () => void) => void;
  onStatusChange?: (status: SaveStatus) => void;
  maxRetries?: number;
};

export class SaveQueue {
  /** The underlying adapter, exposed for direct per-record reads (record store
   * hydration). All writes still go through the queue. */
  readonly port: PersistencePort;
  private readonly outbox: OutboxStore | null;
  private readonly autoFlush: boolean;
  private readonly schedule: (run: () => void) => void;
  private readonly onStatusChange?: (status: SaveStatus) => void;
  private readonly maxRetries: number;

  private pending = new Map<string, Mutation>();
  private flushing: Promise<void> | null = null;
  private scheduled = false;
  private retries = 0;
  private status: SaveStatus = "idle";

  constructor(port: PersistencePort, options: SaveQueueOptions = {}) {
    this.port = port;
    this.outbox = options.outbox ?? null;
    this.autoFlush = options.autoFlush ?? true;
    this.schedule = options.schedule ?? defaultSchedule;
    this.onStatusChange = options.onStatusChange;
    this.maxRetries = options.maxRetries ?? 6;
  }

  enqueue(mutation: Mutation): void {
    this.pending.set(mutationKey(mutation), mutation);
    if (this.autoFlush) this.scheduleFlush();
  }

  /** Number of coalesced mutations waiting to be sent. */
  size(): number {
    return this.pending.size;
  }

  getStatus(): SaveStatus {
    return this.status;
  }

  /** Drain everything currently pending in a single batch. Never throws — a
   * failed batch is re-queued and retried with backoff. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  /** Replay any outbox left by a previous (possibly crashed) session. */
  async replayOutbox(): Promise<void> {
    if (!this.outbox) return;
    const saved = await this.outbox.load();
    if (saved.length === 0) return;
    for (const mutation of saved) {
      this.pending.set(mutationKey(mutation), mutation);
    }
    await this.flush();
  }

  private scheduleFlush(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      void this.flush();
    });
  }

  private async drain(): Promise<void> {
    while (this.pending.size > 0) {
      const batch = Array.from(this.pending.values());
      this.pending.clear();

      this.setStatus(this.retries > 0 ? "retrying" : "saving");
      if (this.outbox) await this.outbox.save(batch).catch(() => {});

      try {
        await this.port.applyBatch(batch);
        this.retries = 0;
        if (this.outbox) await this.outbox.clear().catch(() => {});
      } catch (error) {
        // Re-queue without clobbering newer edits that arrived meanwhile.
        for (const mutation of batch) {
          const key = mutationKey(mutation);
          if (!this.pending.has(key)) this.pending.set(key, mutation);
        }
        this.retries += 1;
        if (this.retries > this.maxRetries) {
          this.setStatus("error");
          console.error("[saveQueue] giving up after retries", error);
          return;
        }
        this.setStatus("retrying");
        await delay(backoffMs(this.retries));
        continue;
      }
    }
    this.setStatus("idle");
  }

  private setStatus(status: SaveStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(status);
  }
}

function defaultSchedule(run: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  queueMicrotask(() => {
    if (idle) idle(run);
    else setTimeout(run, 0);
  });
}

function backoffMs(retries: number): number {
  return Math.min(30_000, 250 * 2 ** (retries - 1));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
