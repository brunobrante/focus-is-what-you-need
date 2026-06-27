/**
 * A persistence command. Every entity in the app — projects, screens,
 * components, variants, scenes, thumbnails, placements, references, history,
 * settings, meta — is stored as one record keyed by `(table, id)`. There is no
 * table-blob: creating one record never rewrites a whole table.
 *
 * The queue coalesces these by `mutationKey` before a single batched
 * `applyBatch`, so a 60fps drag of one scene collapses to one pending write.
 *
 * `upsertRecord.rev` is the optimistic-write guard (D6 in Architecture.md):
 * a monotonic per-row revision the record store stamps on every write. Adapters
 * apply an upsert only when `incoming.rev > stored.rev`, so a stale replay can
 * never clobber a newer row — the single mechanism the future sync layer rides
 * on. It is **optional** on the wire: a mutation without `rev` (legacy / tests)
 * is applied unconditionally, preserving the prior last-write-wins behaviour.
 */
export type Mutation =
  | { op: "upsertRecord"; table: string; id: string; json: string; rev?: number }
  | { op: "deleteRecords"; table: string; ids: string[] };

export type ApplyAck = {
  applied: number;
};

/**
 * Coalescing key, scoped to a single `(table, id)` record. A repeated op of the
 * same kind on a record collapses to the latest one (last-write-wins). Upsert and
 * delete of the same record get *different* keys but the **same** record, so the
 * queue must also evict the opposite op (`oppositeMutationKey`) — otherwise an
 * upsert and a delete of one record coexist and the final state depends on Map
 * insertion order (SAVE-11). A `deleteRecords` carrying many ids must be split via
 * `eachRecordMutation` first so each pending entry is exactly one record.
 */
export function mutationKey(mutation: Mutation): string {
  switch (mutation.op) {
    case "upsertRecord":
      return `up:${mutation.table}:${mutation.id}`;
    case "deleteRecords":
      return `del:${mutation.table}:${mutation.ids.join(",")}`;
  }
}

/**
 * The key the inverse op (upsert↔delete) of the **same** record would occupy.
 * Only meaningful for single-record mutations (run `eachRecordMutation` first).
 */
export function oppositeMutationKey(mutation: Mutation): string {
  switch (mutation.op) {
    case "upsertRecord":
      return mutationKey({ op: "deleteRecords", table: mutation.table, ids: [mutation.id] });
    case "deleteRecords":
      return mutationKey({ op: "upsertRecord", table: mutation.table, id: mutation.ids[0]!, json: "" });
  }
}

/**
 * Explode a mutation into one mutation per `(table, id)` record. Upserts are
 * already single-record; a multi-id `deleteRecords` yields one single-id delete
 * per id, so the queue can coalesce each record independently against its upsert.
 */
export function* eachRecordMutation(mutation: Mutation): Iterable<Mutation> {
  if (mutation.op === "deleteRecords") {
    for (const id of mutation.ids) {
      yield { op: "deleteRecords", table: mutation.table, ids: [id] };
    }
    return;
  }
  yield mutation;
}
