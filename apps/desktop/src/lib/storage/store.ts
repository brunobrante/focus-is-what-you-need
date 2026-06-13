/**
 * Storage facade. The blob-per-table KV model is gone: every row is an
 * individual record in the record store, persisted per-row through the save
 * queue. This module just re-exports the record-store API under the names the
 * repos use.
 */
export { TABLES, type TableKey } from "@/lib/storage/storeKeys";
export {
  listTable,
  peekTable,
  getRecordById,
  putRecord,
  removeRecords,
  replaceTable,
  getMeta,
  setMeta,
  notify,
  subscribe,
  resetRecordStoreCache,
  flushRecordStore,
} from "@/lib/storage/recordStore";
