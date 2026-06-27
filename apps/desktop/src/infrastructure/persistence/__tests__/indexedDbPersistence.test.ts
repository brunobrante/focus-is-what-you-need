// Runs the SAME port contract (D9) against the IndexedDB adapter, so it can never
// silently diverge from the memory reference. Requires `fake-indexeddb` (a
// devDependency) to provide a global `indexedDB` under bun — run `bun install`
// first. (In a sandbox without that dep installed the import is unresolved; it
// resolves once dependencies are installed.)
import "fake-indexeddb/auto";
import { beforeEach } from "bun:test";

import {
  INDEXED_DB_NAME,
  createIndexedDbPersistence,
  resetIndexedDbForTests,
} from "@/infrastructure/persistence/indexedDbPersistence";

import {
  runAssetBlobContract,
  runRecordPortContract,
} from "./persistencePortContract";

// Each test gets a fresh database: drop the cached connection, then delete the DB
// so the next open re-creates the `records` + `asset_blobs` stores empty.
beforeEach(async () => {
  resetIndexedDbForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(INDEXED_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
});

runRecordPortContract("indexeddb", createIndexedDbPersistence);
runAssetBlobContract("indexeddb", createIndexedDbPersistence);
