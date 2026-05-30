import type { PersistencePort } from "@/domain/persistence/persistencePort";
import type { ApplyAck, Mutation } from "@/domain/persistence/mutations";

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

export function createSqlitePersistence(): PersistencePort {
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
