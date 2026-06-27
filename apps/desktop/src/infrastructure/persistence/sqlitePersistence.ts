import type { GraphPersistencePort } from "@/domain/persistence/persistencePort";
import type { ApplyAck, Mutation } from "@/domain/persistence/mutations";
import { base64ToBytes, bytesToBase64 } from "@/lib/encoding/base64";

/**
 * Desktop PersistencePort: a thin bridge to the Rust backend. One `db_apply`
 * call == one IPC == one SQLite transaction. Reads hit a single pooled
 * connection (no per-call CREATE TABLE / connection churn). The wire format is
 * snake_case to keep the Rust serde structs idiomatic; this adapter is the only
 * place that translation lives.
 */

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

let invokePromise: Promise<Invoke> | null = null;

type WireAck = { applied: number };

export function createSqlitePersistence(): GraphPersistencePort {
  return {
    async applyBatch(mutations) {
      const invoke = await getInvoke();
      const batch = mutations.map(toWire);
      const ack = await invoke<WireAck>("db_apply", { batch });
      return { applied: ack.applied } satisfies ApplyAck;
    },

    async getRecord(table, id) {
      const invoke = await getInvoke();
      return invoke<string | null>("db_get_record", { table, id });
    },

    async listRecords(table) {
      const invoke = await getInvoke();
      return invoke<string[]>("db_list_records", { table });
    },

    async getAssetBlob(blobKey) {
      const invoke = await getInvoke();
      const b64 = await invoke<string | null>("asset_get", { blobKey });
      return b64 == null ? null : base64ToBytes(b64);
    },

    async getAssetBlobs(blobKeys) {
      const out = new Map<string, Uint8Array>();
      if (blobKeys.length === 0) return out;
      const invoke = await getInvoke();
      // One IPC returns every found blob (base64), keyed by blobKey (Rust
      // `asset_get_many`). Missing keys are absent from the map.
      const found = await invoke<Record<string, string>>("asset_get_many", {
        blobKeys,
      });
      for (const [key, b64] of Object.entries(found)) {
        out.set(key, base64ToBytes(b64));
      }
      return out;
    },

    async putAssetBlob(bytes, meta) {
      const invoke = await getInvoke();
      await invoke("asset_put", { dataB64: bytesToBase64(bytes), meta });
    },

    async deleteAssetBlob(blobKey) {
      const invoke = await getInvoke();
      await invoke("asset_delete", { blobKey });
    },
  };
}

function toWire(mutation: Mutation): Record<string, unknown> {
  switch (mutation.op) {
    case "upsertRecord":
      return {
        op: "upsert_record",
        table: mutation.table,
        id: mutation.id,
        json: mutation.json,
        // Optimistic-write guard (D6). Defaults to 0 when the writer omits it, so
        // legacy / un-revisioned writes keep last-write-wins semantics.
        rev: mutation.rev ?? 0,
      };
    case "deleteRecords":
      return {
        op: "delete_records",
        table: mutation.table,
        ids: mutation.ids,
      };
  }
}

async function getInvoke(): Promise<Invoke> {
  if (!invokePromise) {
    invokePromise = import("@tauri-apps/api/core").then(
      (module) => module.invoke as Invoke,
    );
  }
  return invokePromise;
}
