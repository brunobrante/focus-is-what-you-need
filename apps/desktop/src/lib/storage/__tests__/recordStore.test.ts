import { beforeEach, expect, test } from "bun:test";

import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import {
  TABLES,
  replaceTable,
  resetRecordStoreCache,
  subscribe,
} from "@/lib/storage/store";

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }
  removeItem(key: string): void {
    this.rows.delete(key);
  }
}

beforeEach(() => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

const row = (id: string): { id: string } => ({ id });

test("replaceTable notifies its table's subscribers by default", async () => {
  let calls = 0;
  subscribe(TABLES.projects, () => {
    calls += 1;
  });
  await replaceTable(TABLES.projects, [row("p1")]);
  expect(calls).toBe(1);
});

test("replaceTable { silent: true } suppresses the per-table notify (SAVE-4)", async () => {
  let calls = 0;
  subscribe(TABLES.projects, () => {
    calls += 1;
  });
  // The reseed populates every cache silently, then fires one batched notify, so
  // a subscriber never observes a half-applied cross-table state.
  await replaceTable(TABLES.projects, [row("p1")], { silent: true });
  expect(calls).toBe(0);
});
