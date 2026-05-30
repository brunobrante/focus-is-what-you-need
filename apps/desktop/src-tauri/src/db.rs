//! Pooled SQLite backend for the delta save system.
//!
//! A single long-lived `Connection` lives in Tauri `State` (migrations run once
//! at setup), replacing the old open-a-connection-and-CREATE-TABLE-per-call
//! `kv_*` path. `db_apply` applies an entire coalesced batch in ONE transaction
//! (one IPC == one SQLite txn); reads are per row/owner.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

pub struct Db(pub Arc<Mutex<Connection>>);

impl Db {
    pub fn new(conn: Connection) -> Self {
        Db(Arc::new(Mutex::new(conn)))
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
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
        "CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scenes (
            owner_type TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            id TEXT NOT NULL,
            graph_json TEXT NOT NULL,
            scene_version INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (owner_type, owner_id)
        );
        CREATE TABLE IF NOT EXISTS thumbnails (
            owner_type TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            id TEXT NOT NULL,
            data_url TEXT NOT NULL,
            captured_at INTEGER NOT NULL,
            PRIMARY KEY (owner_type, owner_id)
        );
        CREATE TABLE IF NOT EXISTS nodes (
            owner_type TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            id TEXT NOT NULL,
            parent_id TEXT,
            order_index REAL NOT NULL,
            node_type TEXT NOT NULL,
            name TEXT NOT NULL,
            props_json TEXT NOT NULL,
            rev INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (owner_type, owner_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_nodes_owner ON nodes(owner_type, owner_id);
        CREATE TABLE IF NOT EXISTS records (
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
    UpsertScene {
        owner_type: String,
        owner_id: String,
        graph_json: String,
        scene_version: i64,
    },
    UpsertNode {
        owner_type: String,
        owner_id: String,
        id: String,
        parent_id: Option<String>,
        order_index: f64,
        node_type: String,
        name: String,
        props_json: String,
        rev: i64,
    },
    DeleteNode {
        owner_type: String,
        owner_id: String,
        node_id: String,
    },
    DeleteSceneNodes {
        owner_type: String,
        owner_id: String,
    },
    UpsertThumbnail {
        owner_type: String,
        owner_id: String,
        data_url: String,
        captured_at: i64,
    },
    DeleteThumbnail {
        owner_type: String,
        owner_id: String,
    },
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
pub struct SceneVersion {
    owner_type: String,
    owner_id: String,
    scene_version: i64,
}

#[derive(Serialize)]
pub struct ApplyAck {
    applied: usize,
    scene_versions: Vec<SceneVersion>,
}

#[derive(Serialize)]
pub struct SceneDto {
    id: String,
    owner_type: String,
    owner_id: String,
    graph_json: String,
    scene_version: i64,
    updated_at: i64,
}

#[derive(Serialize)]
pub struct ThumbnailDto {
    id: String,
    owner_type: String,
    owner_id: String,
    data_url: String,
    captured_at: i64,
}

#[derive(Serialize)]
pub struct NodeDto {
    owner_type: String,
    owner_id: String,
    id: String,
    parent_id: Option<String>,
    order_index: f64,
    node_type: String,
    name: String,
    props_json: String,
    rev: i64,
    updated_at: i64,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn db_apply(state: State<'_, Db>, batch: Vec<Mutation>) -> Result<ApplyAck, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = db.lock().map_err(|_| "db mutex poisoned".to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut scene_versions: Vec<SceneVersion> = Vec::new();
        let applied = batch.len();
        let t = now_ms();

        for mutation in &batch {
            match mutation {
                Mutation::UpsertScene {
                    owner_type,
                    owner_id,
                    graph_json,
                    scene_version,
                } => {
                    let id = format!("{}:{}", owner_type, owner_id);
                    tx.execute(
                        "INSERT INTO scenes (owner_type, owner_id, id, graph_json, scene_version, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                         ON CONFLICT(owner_type, owner_id) DO UPDATE SET
                           graph_json = excluded.graph_json,
                           scene_version = excluded.scene_version,
                           updated_at = excluded.updated_at
                         WHERE excluded.scene_version > scenes.scene_version",
                        params![owner_type, owner_id, id, graph_json, scene_version, t],
                    )
                    .map_err(|e| e.to_string())?;

                    let winning: i64 = tx
                        .query_row(
                            "SELECT scene_version FROM scenes WHERE owner_type = ?1 AND owner_id = ?2",
                            params![owner_type, owner_id],
                            |row| row.get(0),
                        )
                        .map_err(|e| e.to_string())?;
                    scene_versions.push(SceneVersion {
                        owner_type: owner_type.clone(),
                        owner_id: owner_id.clone(),
                        scene_version: winning,
                    });
                }
                Mutation::UpsertNode {
                    owner_type,
                    owner_id,
                    id,
                    parent_id,
                    order_index,
                    node_type,
                    name,
                    props_json,
                    rev,
                } => {
                    tx.execute(
                        "INSERT INTO nodes (owner_type, owner_id, id, parent_id, order_index, node_type, name, props_json, rev, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                         ON CONFLICT(owner_type, owner_id, id) DO UPDATE SET
                           parent_id = excluded.parent_id,
                           order_index = excluded.order_index,
                           node_type = excluded.node_type,
                           name = excluded.name,
                           props_json = excluded.props_json,
                           rev = excluded.rev,
                           updated_at = excluded.updated_at
                         WHERE excluded.rev >= nodes.rev",
                        params![owner_type, owner_id, id, parent_id, order_index, node_type, name, props_json, rev, t],
                    )
                    .map_err(|e| e.to_string())?;
                }
                Mutation::DeleteNode {
                    owner_type,
                    owner_id,
                    node_id,
                } => {
                    tx.execute(
                        "DELETE FROM nodes WHERE owner_type = ?1 AND owner_id = ?2 AND id = ?3",
                        params![owner_type, owner_id, node_id],
                    )
                    .map_err(|e| e.to_string())?;
                }
                Mutation::DeleteSceneNodes {
                    owner_type,
                    owner_id,
                } => {
                    tx.execute(
                        "DELETE FROM nodes WHERE owner_type = ?1 AND owner_id = ?2",
                        params![owner_type, owner_id],
                    )
                    .map_err(|e| e.to_string())?;
                }
                Mutation::UpsertThumbnail {
                    owner_type,
                    owner_id,
                    data_url,
                    captured_at,
                } => {
                    let id = format!("{}:{}", owner_type, owner_id);
                    tx.execute(
                        "INSERT INTO thumbnails (owner_type, owner_id, id, data_url, captured_at)
                         VALUES (?1, ?2, ?3, ?4, ?5)
                         ON CONFLICT(owner_type, owner_id) DO UPDATE SET
                           data_url = excluded.data_url,
                           captured_at = excluded.captured_at",
                        params![owner_type, owner_id, id, data_url, captured_at],
                    )
                    .map_err(|e| e.to_string())?;
                }
                Mutation::DeleteThumbnail {
                    owner_type,
                    owner_id,
                } => {
                    tx.execute(
                        "DELETE FROM thumbnails WHERE owner_type = ?1 AND owner_id = ?2",
                        params![owner_type, owner_id],
                    )
                    .map_err(|e| e.to_string())?;
                }
                Mutation::UpsertRecord { table, id, json } => {
                    tx.execute(
                        "INSERT INTO records (tbl, id, json)
                         VALUES (?1, ?2, ?3)
                         ON CONFLICT(tbl, id) DO UPDATE SET json = excluded.json",
                        params![table, id, json],
                    )
                    .map_err(|e| e.to_string())?;
                }
                Mutation::DeleteRecords { table, ids } => {
                    for id in ids {
                        tx.execute(
                            "DELETE FROM records WHERE tbl = ?1 AND id = ?2",
                            params![table, id],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                }
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(ApplyAck {
            applied,
            scene_versions,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_get_scene(
    state: State<'_, Db>,
    owner_type: String,
    owner_id: String,
) -> Result<Option<SceneDto>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "db mutex poisoned".to_string())?;
        conn.query_row(
            "SELECT id, owner_type, owner_id, graph_json, scene_version, updated_at
             FROM scenes WHERE owner_type = ?1 AND owner_id = ?2",
            params![owner_type, owner_id],
            |row| {
                Ok(SceneDto {
                    id: row.get(0)?,
                    owner_type: row.get(1)?,
                    owner_id: row.get(2)?,
                    graph_json: row.get(3)?,
                    scene_version: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_load_scene_nodes(
    state: State<'_, Db>,
    owner_type: String,
    owner_id: String,
) -> Result<Vec<NodeDto>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "db mutex poisoned".to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT owner_type, owner_id, id, parent_id, order_index, node_type, name, props_json, rev, updated_at
                 FROM nodes WHERE owner_type = ?1 AND owner_id = ?2 ORDER BY order_index ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![owner_type, owner_id], |row| {
                Ok(NodeDto {
                    owner_type: row.get(0)?,
                    owner_id: row.get(1)?,
                    id: row.get(2)?,
                    parent_id: row.get(3)?,
                    order_index: row.get(4)?,
                    node_type: row.get(5)?,
                    name: row.get(6)?,
                    props_json: row.get(7)?,
                    rev: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
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

#[tauri::command]
pub async fn db_get_thumbnail(
    state: State<'_, Db>,
    owner_type: String,
    owner_id: String,
) -> Result<Option<ThumbnailDto>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "db mutex poisoned".to_string())?;
        conn.query_row(
            "SELECT id, owner_type, owner_id, data_url, captured_at
             FROM thumbnails WHERE owner_type = ?1 AND owner_id = ?2",
            params![owner_type, owner_id],
            |row| {
                Ok(ThumbnailDto {
                    id: row.get(0)?,
                    owner_type: row.get(1)?,
                    owner_id: row.get(2)?,
                    data_url: row.get(3)?,
                    captured_at: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
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
        let conn = db.lock().map_err(|_| "db mutex poisoned".to_string())?;
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
        let conn = db.lock().map_err(|_| "db mutex poisoned".to_string())?;
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

// ---------------------------------------------------------------------------
// KV — now served from the same pooled connection (no per-call open / CREATE)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn kv_get(state: State<'_, Db>, key: String) -> Result<Option<String>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "db mutex poisoned".to_string())?;
        conn.query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn kv_set(state: State<'_, Db>, key: String, value: String) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "db mutex poisoned".to_string())?;
        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at",
            params![key, value, now_ms()],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
