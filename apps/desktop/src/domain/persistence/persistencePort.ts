import type { ApplyAck, Mutation } from "./mutations";

/**
 * The central persistence contract. Everything above this line (record store,
 * queue, repos) is written once; the adapters below it are the only pieces that
 * know whether the backend is SQLite (desktop), IndexedDB (web) or an in-memory
 * Map (tests).
 *
 * - Writes go through `applyBatch`: one atomic batch == one IPC on desktop /
 *   one IDBTransaction on web. N coalesced edits collapse to a single call.
 * - Reads are per record / per table — never a whole-database scan. Records are
 *   returned as raw JSON strings; the record-store layer parses and caches them.
 */
export interface PersistencePort {
  applyBatch(mutations: Mutation[]): Promise<ApplyAck>;
  getRecord(table: string, id: string): Promise<string | null>;
  listRecords(table: string): Promise<string[]>;
}
