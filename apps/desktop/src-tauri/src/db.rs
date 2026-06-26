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
            PRIMARY KEY (tbl, id)
        );
        CREATE INDEX IF NOT EXISTS idx_records_tbl ON records(tbl);",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
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
                    "INSERT INTO records (tbl, id, json)
                     VALUES (?1, ?2, ?3)
                     ON CONFLICT(tbl, id) DO UPDATE SET json = excluded.json",
                )
                .map_err(|e| e.to_string())?;
            let mut delete = tx
                .prepare_cached("DELETE FROM records WHERE tbl = ?1 AND id = ?2")
                .map_err(|e| e.to_string())?;

            for mutation in &batch {
                match mutation {
                    Mutation::UpsertRecord { table, id, json } => {
                        applied += upsert
                            .execute(params![table, id, json])
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
