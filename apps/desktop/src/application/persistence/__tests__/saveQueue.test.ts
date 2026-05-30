import { expect, test } from "bun:test";

import { SaveQueue } from "@/application/persistence/saveQueue";
import { createMemoryOutbox } from "@/infrastructure/persistence/outbox";
import type { ApplyAck, Mutation } from "@/domain/persistence/mutations";
import type { PersistencePort } from "@/domain/persistence/persistencePort";

function recordingPort(): { port: PersistencePort; batches: Mutation[][] } {
  const batches: Mutation[][] = [];
  const port = stubPort(async (batch) => {
    batches.push(batch);
    return { applied: batch.length };
  });
  return { port, batches };
}

function stubPort(applyBatch: (b: Mutation[]) => Promise<ApplyAck>): PersistencePort {
  return {
    applyBatch,
    async getRecord() {
      return null;
    },
    async listRecords() {
      return [];
    },
  };
}

test("60 edits of the same record coalesce to one op", async () => {
  const { port, batches } = recordingPort();
  const queue = new SaveQueue(port, { autoFlush: false });

  for (let i = 0; i < 60; i += 1) {
    queue.enqueue({ op: "upsertRecord", table: "scenes", id: "s1", json: `${i}` });
  }
  expect(queue.size()).toBe(1);

  await queue.flush();
  expect(batches).toHaveLength(1);
  expect(batches[0]).toHaveLength(1);
  expect(batches[0]![0]).toMatchObject({ op: "upsertRecord", id: "s1", json: "59" });
});

test("a whole interaction sends one atomic batch", async () => {
  const { port, batches } = recordingPort();
  const queue = new SaveQueue(port, { autoFlush: false });

  queue.enqueue({ op: "upsertRecord", table: "scenes", id: "a", json: "1" });
  queue.enqueue({ op: "upsertRecord", table: "thumbnails", id: "a", json: "2" });
  queue.enqueue({ op: "deleteRecords", table: "components", ids: ["x"] });

  await queue.flush();
  expect(batches).toHaveLength(1);
  expect(batches[0]).toHaveLength(3);
});

test("outbox replays on boot", async () => {
  const { port, batches } = recordingPort();
  const outbox = createMemoryOutbox([
    { op: "deleteRecords", table: "thumbnails", ids: ["t1"] },
  ]);
  const queue = new SaveQueue(port, { autoFlush: false, outbox });

  await queue.replayOutbox();
  expect(batches).toHaveLength(1);
  expect(batches[0]![0]).toMatchObject({ op: "deleteRecords", ids: ["t1"] });
  expect(await outbox.load()).toHaveLength(0);
});

test("failed batch is retried and then succeeds", async () => {
  let calls = 0;
  const port = stubPort(async (batch) => {
    calls += 1;
    if (calls === 1) throw new Error("transient");
    return { applied: batch.length };
  });
  const queue = new SaveQueue(port, { autoFlush: false, maxRetries: 3 });

  queue.enqueue({ op: "upsertRecord", table: "t", id: "n", json: "1" });
  await queue.flush();

  expect(calls).toBe(2);
  expect(queue.size()).toBe(0);
  expect(queue.getStatus()).toBe("idle");
});
