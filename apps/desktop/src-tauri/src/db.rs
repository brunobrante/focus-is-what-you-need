//! Pooled SQLite backend for the delta save system.
//!
//! A single long-lived `Connection` lives in Tauri `State` (migrations run once
//! at setup), replacing the old open-a-connection-and-CREATE-TABLE-per-call
//! `kv_*` path. `db_apply` applies an entire coalesced batch in ONE transaction
//! (one IPC == one SQLite txn); reads are per row/table.
//!
//! Every entity — projects, screens, components, variants, scenes, thumbnails,
//! placements, references, history, settings, meta — is stored as one row in the
//! generic `records(tbl, id, json)` table, keyed by `(table, id)`. Scenes and
//! thumbnails are JSON/base64 inside that `json` column like everything else;
//! there is no typed per-node table.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct Db(pub Arc<Mutex<Connection>>);

impl Db {
    pub fn new(conn: Connection) -> Self {
        Db(Arc::new(Mutex::new(conn)))
    }
}

/// Open the database and run idempotent migrations. Called once at setup.
pub fn open_and_migrate(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS records (
            tbl TEXT NOT NULL,
            id TEXT NOT NULL,
            json TEXT NOT NULL,
            rev INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (tbl, id)
        );
        CREATE INDEX IF NOT EXISTS idx_records_tbl ON records(tbl);
        CREATE TABLE IF NOT EXISTS asset_blobs (
            blob_key TEXT PRIMARY KEY,
            content_hash TEXT,
            mime_type TEXT NOT NULL,
            byte_length INTEGER NOT NULL,
            width INTEGER,
            height INTEGER,
            storage_kind TEXT NOT NULL,
            data BLOB
        );",
    )
    .map_err(|e| e.to_string())?;
    // `rev` is the optimistic-write guard (D6). A dev database created before this
    // column existed is upgraded in place — the local-only app never carries real
    // data, but an in-place ALTER avoids a forced reseed just to add a column.
    ensure_column(&conn, "records", "rev", "INTEGER NOT NULL DEFAULT 0")?;
    Ok(conn)
}

/// Add `column` to `table` if it is not already present. `PRAGMA table_info`
/// returns one row per column with the name in position 1; idempotent so it is
/// safe to run on every boot.
fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    decl: &str,
) -> Result<(), String> {
    let mut present = false;
    {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| e.to_string())?;
        let names = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        for name in names {
            if name.map_err(|e| e.to_string())? == column {
                present = true;
            }
        }
    }
    if !present {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"),
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Mutation {
    UpsertRecord {
        table: String,
        id: String,
        json: String,
        /// Optimistic-write guard (D6). Absent on the wire → 0, preserving
        /// last-write-wins for un-revisioned writers.
        #[serde(default)]
        rev: i64,
    },
    DeleteRecords {
        table: String,
        ids: Vec<String>,
    },
}

#[derive(Serialize)]
pub struct ApplyAck {
    /// Number of rows actually inserted/updated/deleted by the batch, not the
    /// number of mutations issued (RUST-3).
    applied: usize,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn db_apply(state: State<'_, Db>, batch: Vec<Mutation>) -> Result<ApplyAck, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = db.lock().unwrap_or_else(|e| e.into_inner());
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        // Count rows actually changed, not mutations issued: a multi-id delete is
        // one mutation but N rows, and a delete of a missing id changes nothing
        // (RUST-3). `execute` returns the affected-row count for each statement.
        let mut applied = 0usize;

        {
            // Compile each statement once per transaction instead of re-parsing the
            // identical INSERT/DELETE for every row in the batch (RUST-2).
            let mut upsert = tx
                .prepare_cached(
                    "INSERT INTO records (tbl, id, json, rev)
                     VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(tbl, id) DO UPDATE SET json = excluded.json, rev = excluded.rev
                     WHERE excluded.rev > records.rev",
                )
                .map_err(|e| e.to_string())?;
            let mut delete = tx
                .prepare_cached("DELETE FROM records WHERE tbl = ?1 AND id = ?2")
                .map_err(|e| e.to_string())?;

            for mutation in &batch {
                match mutation {
                    Mutation::UpsertRecord {
                        table,
                        id,
                        json,
                        rev,
                    } => {
                        applied += upsert
                            .execute(params![table, id, json, rev])
                            .map_err(|e| e.to_string())?;
                    }
                    Mutation::DeleteRecords { table, ids } => {
                        for id in ids {
                            applied += delete
                                .execute(params![table, id])
                                .map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(ApplyAck { applied })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_get_record(
    state: State<'_, Db>,
    table: String,
    id: String,
) -> Result<Option<String>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT json FROM records WHERE tbl = ?1 AND id = ?2",
            params![table, id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Asset blobs — binaries (thumbnails, crops, imports) kept OUT of `records` so a
// bulk `db_list_records` never drags megabytes through one IPC (RUST-4 / D5).
// ---------------------------------------------------------------------------

/// Metadata mirror of the TS `AssetBlobMeta`. `rename_all = "camelCase"` so the
/// nested object the renderer passes maps onto these snake_case fields.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMeta {
    blob_key: String,
    content_hash: Option<String>,
    mime_type: String,
    byte_length: i64,
    width: Option<i64>,
    height: Option<i64>,
    storage_kind: String,
}

#[tauri::command]
pub async fn asset_put(
    state: State<'_, Db>,
    data_b64: String,
    meta: AssetMeta,
) -> Result<(), String> {
    // Decode off the connection lock — the payload is renderer-supplied base64.
    let bytes = BASE64.decode(&data_b64).map_err(|e| e.to_string())?;
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().unwrap_or_else(|e| e.into_inner());
        // NOTE: large blobs (>256 KB) are stored in the column for now; offloading
        // them to files keyed by blob_key (D5) is a follow-up and additive — the
        // `storage_kind` is already recorded so a later GC/export can relocate.
        conn.execute(
            "INSERT INTO asset_blobs
                (blob_key, content_hash, mime_type, byte_length, width, height, storage_kind, data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(blob_key) DO UPDATE SET
                content_hash = excluded.content_hash,
                mime_type = excluded.mime_type,
                byte_length = excluded.byte_length,
                width = excluded.width,
                height = excluded.height,
                storage_kind = excluded.storage_kind,
                data = excluded.data",
            params![
                meta.blob_key,
                meta.content_hash,
                meta.mime_type,
                meta.byte_length,
                meta.width,
                meta.height,
                meta.storage_kind,
                bytes,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn asset_get(state: State<'_, Db>, blob_key: String) -> Result<Option<String>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().unwrap_or_else(|e| e.into_inner());
        let bytes: Option<Vec<u8>> = conn
            .query_row(
                "SELECT data FROM asset_blobs WHERE blob_key = ?1",
                params![blob_key],
                |row| row.get::<_, Option<Vec<u8>>>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        Ok(bytes.map(|b| BASE64.encode(b)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Batched read for grids: one IPC + one connection lock returns every requested
/// blob (base64), keyed by `blob_key`. Missing keys are simply absent from the map.
/// Avoids the N-round-trip cliff of calling `asset_get` once per thumbnail.
#[tauri::command]
pub async fn asset_get_many(
    state: State<'_, Db>,
    blob_keys: Vec<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().unwrap_or_else(|e| e.into_inner());
        // One cached statement reused across the loop (RUST-2): no per-row prepare.
        let mut stmt = conn
            .prepare_cached("SELECT data FROM asset_blobs WHERE blob_key = ?1")
            .map_err(|e| e.to_string())?;
        let mut out = std::collections::HashMap::with_capacity(blob_keys.len());
        for key in blob_keys {
            let bytes: Option<Vec<u8>> = stmt
                .query_row(params![key], |row| row.get::<_, Option<Vec<u8>>>(0))
                .optional()
                .map_err(|e| e.to_string())?
                .flatten();
            if let Some(b) = bytes {
                out.insert(key, BASE64.encode(b));
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn asset_delete(state: State<'_, Db>, blob_key: String) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute("DELETE FROM asset_blobs WHERE blob_key = ?1", params![blob_key])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_list_records(state: State<'_, Db>, table: String) -> Result<Vec<String>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn
            .prepare("SELECT json FROM records WHERE tbl = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![table], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}
