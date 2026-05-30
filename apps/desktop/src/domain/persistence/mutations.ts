/**
 * A persistence command. Every entity in the app — projects, screens,
 * components, variants, scenes, thumbnails, placements, references, history,
 * meta — is stored as one record keyed by `(table, id)`. There is no
 * table-blob: creating one record never rewrites a whole table.
 *
 * The queue coalesces these by `mutationKey` before a single batched
 * `applyBatch`, so a 60fps drag of one scene collapses to one pending write.
 */
export type Mutation =
  | { op: "upsertRecord"; table: string; id: string; json: string }
  | { op: "deleteRecords"; table: string; ids: string[] };

export type ApplyAck = {
  applied: number;
};

/**
 * Coalescing key. A repeated upsert of the same record collapses to the latest
 * one (last-write-wins in the queue). Deletes are kept distinct per batch so a
 * delete is never silently dropped by a coalescing collision.
 */
export function mutationKey(mutation: Mutation): string {
  switch (mutation.op) {
    case "upsertRecord":
      return `up:${mutation.table}:${mutation.id}`;
    case "deleteRecords":
      return `del:${mutation.table}:${mutation.ids.join(",")}`;
  }
}
