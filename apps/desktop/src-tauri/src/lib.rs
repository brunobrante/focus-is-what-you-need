use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

mod db;

const APP_FOLDER_NAME: &str = "focus-is-what-you-need";
const DEFAULT_WORKSPACE_NAME: &str = "workspace";
const FIGX_ARCHIVE_ENTRY: &str = "data/archive.json";
const SQLITE_FILE_NAME: &str = "persistence.sqlite3";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkspaceConfig {
    pub base_folder: String,
    pub workspace_name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FigxProjectInput {
    pub project_id: String,
    pub project_name: String,
    pub archive_json: String,
    pub reference_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct WorkspaceMetaProject {
    id: String,
    name: String,
    file: String,
    updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct WorkspaceMeta {
    name: String,
    app_folder: String,
    updated_at: u64,
    projects: Vec<WorkspaceMetaProject>,
}

struct ZipEntry {
    name: String,
    data: Vec<u8>,
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("cannot resolve app data dir")
        .join("workspace-config.json")
}

fn sqlite_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(SQLITE_FILE_NAME))
}

fn default_config() -> WorkspaceConfig {
    let base = dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_FOLDER_NAME)
        .to_string_lossy()
        .into_owned();
    WorkspaceConfig {
        base_folder: base,
        workspace_name: DEFAULT_WORKSPACE_NAME.into(),
    }
}

fn read_config(app: &tauri::AppHandle) -> WorkspaceConfig {
    let path = config_path(app);
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<WorkspaceConfig>(&raw) {
            return cfg;
        }
    }
    default_config()
}

fn save_config(app: &tauri::AppHandle, cfg: &WorkspaceConfig) -> Result<(), String> {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn app_root(cfg: &WorkspaceConfig) -> PathBuf {
    PathBuf::from(&cfg.base_folder)
}

fn references_dir(cfg: &WorkspaceConfig) -> PathBuf {
    app_root(cfg).join("references")
}

fn reference_dir(cfg: &WorkspaceConfig, id: &str) -> PathBuf {
    references_dir(cfg).join(id)
}

fn legacy_references_dir(cfg: &WorkspaceConfig) -> PathBuf {
    app_root(cfg).join(&cfg.workspace_name).join("references")
}

fn legacy_reference_dir(cfg: &WorkspaceConfig, id: &str) -> PathBuf {
    legacy_references_dir(cfg).join(id)
}

fn workspaces_dir(cfg: &WorkspaceConfig) -> PathBuf {
    app_root(cfg).join("workspaces")
}

fn workspace_dir(cfg: &WorkspaceConfig) -> PathBuf {
    workspaces_dir(cfg).join(&cfg.workspace_name)
}

fn loose_projects_dir(cfg: &WorkspaceConfig) -> PathBuf {
    app_root(cfg).join("projects")
}

fn workspace_meta_path(cfg: &WorkspaceConfig) -> PathBuf {
    workspace_dir(cfg).join("meta.json")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn ensure_local_structure(cfg: &WorkspaceConfig) -> Result<(), String> {
    fs::create_dir_all(references_dir(cfg)).map_err(|e| e.to_string())?;
    fs::create_dir_all(workspace_dir(cfg)).map_err(|e| e.to_string())?;
    fs::create_dir_all(loose_projects_dir(cfg)).map_err(|e| e.to_string())?;
    if !workspace_meta_path(cfg).exists() {
        write_workspace_meta(
            cfg,
            &WorkspaceMeta {
                name: cfg.workspace_name.clone(),
                app_folder: APP_FOLDER_NAME.into(),
                updated_at: now_ms(),
                projects: vec![],
            },
        )?;
    }
    Ok(())
}

fn safe_path_segment(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return Err(format!("invalid {} path segment", label));
    }
    Ok(trimmed.into())
}

fn safe_extension(value: &str) -> String {
    let ext = value
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase();
    if ext.is_empty() { "bin".into() } else { ext }
}

fn read_reference_blob(cfg: &WorkspaceConfig, id: &str, ext: &str) -> Result<Vec<u8>, String> {
    let id = safe_path_segment(id, "reference id")?;
    let ext = safe_extension(ext);
    let candidates = [
        reference_dir(cfg, &id).join(format!("original.{}", ext)),
        references_dir(cfg).join(format!("{}.{}", id, ext)),
        legacy_reference_dir(cfg, &id).join(format!("original.{}", ext)),
        legacy_references_dir(cfg).join(format!("{}.{}", id, ext)),
    ];
    let path = candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "reference file not found".to_string())?;
    fs::read(&path).map_err(|e| e.to_string())
}

fn read_workspace_meta(cfg: &WorkspaceConfig) -> WorkspaceMeta {
    let path = workspace_meta_path(cfg);
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<WorkspaceMeta>(&raw).ok())
        .unwrap_or_else(|| WorkspaceMeta {
            name: cfg.workspace_name.clone(),
            app_folder: APP_FOLDER_NAME.into(),
            updated_at: now_ms(),
            projects: vec![],
        })
}

fn write_workspace_meta(cfg: &WorkspaceConfig, meta: &WorkspaceMeta) -> Result<(), String> {
    let path = workspace_meta_path(cfg);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_workspace_config(app: tauri::AppHandle) -> WorkspaceConfig {
    read_config(&app)
}

#[tauri::command]
fn set_workspace_folder(app: tauri::AppHandle, base_folder: String) -> Result<(), String> {
    let mut cfg = read_config(&app);
    cfg.base_folder = base_folder;
    save_config(&app, &cfg)?;
    ensure_local_structure(&cfg)
}

#[tauri::command]
async fn pick_folder_dialog() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Escolher pasta dos projetos")
            .pick_folder()
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
fn ensure_workspace_folders(app: tauri::AppHandle) -> Result<String, String> {
    let cfg = read_config(&app);
    ensure_local_structure(&cfg)?;
    Ok(app_root(&cfg).to_string_lossy().into_owned())
}

#[tauri::command]
fn write_reference_file(
    app: tauri::AppHandle,
    id: String,
    ext: String,
    data_b64: String,
) -> Result<(), String> {
    let data = BASE64.decode(&data_b64).map_err(|e| e.to_string())?;
    let cfg = read_config(&app);
    ensure_local_structure(&cfg)?;
    let id = safe_path_segment(&id, "reference id")?;
    let ext = safe_extension(&ext);
    let dir = reference_dir(&cfg, &id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("original.{}", ext)), &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_reference_file(
    app: tauri::AppHandle,
    id: String,
    ext: String,
) -> Result<String, String> {
    let cfg = read_config(&app);
    let data = read_reference_blob(&cfg, &id, &ext)?;
    Ok(BASE64.encode(&data))
}

#[tauri::command]
fn delete_reference_file(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let cfg = read_config(&app);
    let id = safe_path_segment(&id, "reference id")?;
    for dir in [references_dir(&cfg), legacy_references_dir(&cfg)] {
        let reference_folder = dir.join(&id);
        if reference_folder.exists() {
            let _ = fs::remove_dir_all(reference_folder);
        }
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with(&format!("{}.", id)) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn write_reference_stack_file(
    app: tauri::AppHandle,
    id: String,
    file_name: String,
    data_b64: String,
) -> Result<(), String> {
    let data = BASE64.decode(&data_b64).map_err(|e| e.to_string())?;
    let cfg = read_config(&app);
    ensure_local_structure(&cfg)?;
    let id = safe_path_segment(&id, "reference id")?;
    let file_name = safe_path_segment(&file_name, "stack file name")?;
    let stack_dir = reference_dir(&cfg, &id).join("stack");
    fs::create_dir_all(&stack_dir).map_err(|e| e.to_string())?;
    fs::write(stack_dir.join(file_name), &data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_reference_stack_file(
    app: tauri::AppHandle,
    id: String,
    file_name: String,
) -> Result<String, String> {
    let cfg = read_config(&app);
    let id = safe_path_segment(&id, "reference id")?;
    let file_name = safe_path_segment(&file_name, "stack file name")?;
    let candidates = [
        reference_dir(&cfg, &id).join("stack").join(&file_name),
        legacy_reference_dir(&cfg, &id).join("stack").join(&file_name),
    ];
    let path = candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "reference stack file not found".to_string())?;
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(BASE64.encode(&data))
}

#[tauri::command]
fn write_reference_stack_data(
    app: tauri::AppHandle,
    id: String,
    content: String,
) -> Result<(), String> {
    let cfg = read_config(&app);
    ensure_local_structure(&cfg)?;
    let id = safe_path_segment(&id, "reference id")?;
    let stack_dir = reference_dir(&cfg, &id).join("stack");
    fs::create_dir_all(&stack_dir).map_err(|e| e.to_string())?;
    fs::write(stack_dir.join("data.json"), content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_reference_stack_data(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let cfg = read_config(&app);
    let id = safe_path_segment(&id, "reference id")?;
    let candidates = [
        reference_dir(&cfg, &id).join("stack").join("data.json"),
        legacy_reference_dir(&cfg, &id).join("stack").join("data.json"),
    ];
    let path = candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "reference stack data not found".to_string())?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_reference_stack(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let cfg = read_config(&app);
    let id = safe_path_segment(&id, "reference id")?;
    for dir in [reference_dir(&cfg, &id), legacy_reference_dir(&cfg, &id)] {
        let stack_dir = dir.join("stack");
        if stack_dir.exists() {
            let _ = fs::remove_dir_all(stack_dir);
        }
    }
    Ok(())
}

#[tauri::command]
fn read_references_meta(app: tauri::AppHandle) -> Result<String, String> {
    let cfg = read_config(&app);
    let primary = references_dir(&cfg).join("meta.json");
    let fallback = legacy_references_dir(&cfg).join("meta.json");
    if primary.exists() {
        fs::read_to_string(&primary).map_err(|e| e.to_string())
    } else if fallback.exists() {
        fs::read_to_string(&fallback).map_err(|e| e.to_string())
    } else {
        Ok("[]".into())
    }
}

#[tauri::command]
fn write_references_meta(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let cfg = read_config(&app);
    ensure_local_structure(&cfg)?;
    fs::write(references_dir(&cfg).join("meta.json"), content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_local_figx_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let cfg = read_config(&app);
    ensure_local_structure(&cfg)?;
    let mut paths = list_figx_paths(&workspace_dir(&cfg))?;
    paths.extend(list_figx_paths(&loose_projects_dir(&cfg))?);
    paths.sort();
    paths.dedup();

    let mut archives = Vec::new();
    for path in paths {
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        let Some(entry) = read_stored_zip_entry(&bytes, FIGX_ARCHIVE_ENTRY) else {
            continue;
        };
        if let Ok(raw) = String::from_utf8(entry) {
            archives.push(raw);
        }
    }
    Ok(archives)
}

#[tauri::command]
fn sync_figx_projects(
    app: tauri::AppHandle,
    projects: Vec<FigxProjectInput>,
) -> Result<String, String> {
    let cfg = read_config(&app);
    ensure_local_structure(&cfg)?;

    let mut meta_projects = Vec::new();

    for project in projects {
        let filename = figx_filename(&project.project_id, &project.project_name);
        let path = workspace_dir(&cfg).join(&filename);
        remove_stale_project_files(&workspace_dir(&cfg), &project.project_id, &filename);

        let entries = project_archive_entries(&cfg, &project)?;
        write_zip_file(&path, &entries)?;

        meta_projects.push(WorkspaceMetaProject {
            id: project.project_id,
            name: project.project_name,
            file: filename,
            updated_at: now_ms(),
        });
    }

    let meta = WorkspaceMeta {
        name: cfg.workspace_name.clone(),
        app_folder: APP_FOLDER_NAME.into(),
        updated_at: now_ms(),
        projects: meta_projects,
    };
    write_workspace_meta(&cfg, &meta)?;
    serde_json::to_string(&meta).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_figx_project(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let cfg = read_config(&app);
    ensure_local_structure(&cfg)?;
    if let Ok(entries) = fs::read_dir(workspace_dir(&cfg)) {
        for entry in entries.flatten() {
            let filename = entry.file_name().to_string_lossy().into_owned();
            if filename.starts_with(&format!("{}--", project_id))
                && filename.ends_with(".figx")
            {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    let current_meta = read_workspace_meta(&cfg);
    let meta = WorkspaceMeta {
        name: current_meta.name,
        app_folder: current_meta.app_folder,
        updated_at: now_ms(),
        projects: current_meta
            .projects
            .into_iter()
            .filter(|project| project.id != project_id)
            .collect(),
    };
    write_workspace_meta(&cfg, &meta)
}

fn list_figx_paths(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut result = Vec::new();
    if !dir.exists() {
        return Ok(result);
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("figx") {
            result.push(path);
        }
    }
    Ok(result)
}

fn figx_filename(project_id: &str, project_name: &str) -> String {
    format!("{}--{}.figx", project_id, slugify(project_name))
}

fn slugify(value: &str) -> String {
    let slug: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else if ch.is_ascii_whitespace() || ch == '-' || ch == '_' {
                '-'
            } else {
                '-'
            }
        })
        .collect();
    let collapsed = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if collapsed.is_empty() {
        "project".into()
    } else {
        collapsed
    }
}

fn remove_stale_project_files(dir: &Path, project_id: &str, keep_filename: &str) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let filename = entry.file_name().to_string_lossy().into_owned();
            if filename != keep_filename && filename.starts_with(&format!("{}--", project_id)) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

fn project_archive_entries(
    cfg: &WorkspaceConfig,
    project: &FigxProjectInput,
) -> Result<Vec<ZipEntry>, String> {
    let archive: Value =
        serde_json::from_str(&project.archive_json).map_err(|e| e.to_string())?;
    let saved_at = now_ms();
    let manifest = json!({
        "format": "figx",
        "formatVersion": 1,
        "app": APP_FOLDER_NAME,
        "projectId": project.project_id,
        "projectName": project.project_name,
        "savedAt": saved_at,
        "archiveEntry": FIGX_ARCHIVE_ENTRY,
    });

    let mut entries = vec![
        json_entry("manifest.json", &manifest)?,
        ZipEntry {
            name: FIGX_ARCHIVE_ENTRY.into(),
            data: serde_json::to_vec_pretty(&archive).map_err(|e| e.to_string())?,
        },
    ];

    if let Some(project_value) = archive.get("project") {
        entries.push(json_entry("data/project.json", project_value)?);
    }
    if let Some(tables) = archive.get("tables").and_then(|value| value.as_object()) {
        for (table_name, table_value) in tables {
            entries.push(json_entry(
                &format!("data/tables/{}.json", table_file_name(table_name)),
                table_value,
            )?);
        }
    }

    entries.extend(reference_archive_entries(cfg, &project.reference_ids)?);
    Ok(entries)
}

fn table_file_name(table_name: &str) -> String {
    table_name
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
}

fn reference_archive_entries(
    cfg: &WorkspaceConfig,
    reference_ids: &[String],
) -> Result<Vec<ZipEntry>, String> {
    let wanted: HashSet<&str> = reference_ids.iter().map(String::as_str).collect();
    let metas = read_reference_meta_values(cfg)?;
    let selected: Vec<Value> = metas
        .into_iter()
        .filter(|meta| {
            meta.get("id")
                .and_then(|id| id.as_str())
                .map(|id| wanted.contains(id))
                .unwrap_or(false)
        })
        .collect();

    let mut entries = vec![json_entry("references/meta.json", &Value::Array(selected.clone()))?];
    for meta in selected {
        let Some(id) = meta.get("id").and_then(|value| value.as_str()) else {
            continue;
        };
        let Ok(safe_id) = safe_path_segment(id, "reference id") else {
            continue;
        };
        let primary_dir = reference_dir(cfg, &safe_id);
        let fallback_dir = legacy_reference_dir(cfg, &safe_id);
        if primary_dir.is_dir() {
            push_reference_dir_entries(&primary_dir, &format!("references/{}", safe_id), &mut entries)?;
            continue;
        }
        if fallback_dir.is_dir() {
            push_reference_dir_entries(&fallback_dir, &format!("references/{}", safe_id), &mut entries)?;
            continue;
        }
        let ext = meta
            .get("ext")
            .and_then(|value| value.as_str())
            .or_else(|| {
                meta.get("name")
                    .and_then(|value| value.as_str())
                    .and_then(|name| name.rsplit('.').next())
            })
            .unwrap_or("bin");
        let ext = safe_extension(ext);
        let primary = references_dir(cfg).join(format!("{}.{}", safe_id, ext));
        let fallback = legacy_references_dir(cfg).join(format!("{}.{}", safe_id, ext));
        let path = if primary.exists() { primary } else { fallback };
        if let Ok(data) = fs::read(path) {
            entries.push(ZipEntry {
                name: format!("references/{}.{}", safe_id, ext),
                data,
            });
        }
    }

    Ok(entries)
}

fn push_reference_dir_entries(
    dir: &Path,
    zip_prefix: &str,
    entries: &mut Vec<ZipEntry>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let zip_name = format!("{}/{}", zip_prefix, name);
        if path.is_dir() {
            push_reference_dir_entries(&path, &zip_name, entries)?;
        } else if let Ok(data) = fs::read(&path) {
            entries.push(ZipEntry { name: zip_name, data });
        }
    }
    Ok(())
}

fn read_reference_meta_values(cfg: &WorkspaceConfig) -> Result<Vec<Value>, String> {
    let primary = references_dir(cfg).join("meta.json");
    let fallback = legacy_references_dir(cfg).join("meta.json");
    let raw = if primary.exists() {
        fs::read_to_string(primary).map_err(|e| e.to_string())?
    } else if fallback.exists() {
        fs::read_to_string(fallback).map_err(|e| e.to_string())?
    } else {
        "[]".into()
    };
    let parsed: Value = serde_json::from_str(&raw).unwrap_or(Value::Array(vec![]));
    Ok(parsed.as_array().cloned().unwrap_or_default())
}

fn json_entry(name: &str, value: &Value) -> Result<ZipEntry, String> {
    Ok(ZipEntry {
        name: name.into(),
        data: serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    })
}

fn write_zip_file(path: &Path, entries: &[ZipEntry]) -> Result<(), String> {
    let mut output = Vec::new();
    let mut central = Vec::new();

    for entry in entries {
        let offset = output.len() as u32;
        let crc = crc32(&entry.data);
        let name_bytes = entry.name.as_bytes();
        let size = entry.data.len() as u32;

        push_u32(&mut output, 0x0403_4b50);
        push_u16(&mut output, 20);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u32(&mut output, crc);
        push_u32(&mut output, size);
        push_u32(&mut output, size);
        push_u16(&mut output, name_bytes.len() as u16);
        push_u16(&mut output, 0);
        output.extend_from_slice(name_bytes);
        output.extend_from_slice(&entry.data);

        push_u32(&mut central, 0x0201_4b50);
        push_u16(&mut central, 20);
        push_u16(&mut central, 20);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, crc);
        push_u32(&mut central, size);
        push_u32(&mut central, size);
        push_u16(&mut central, name_bytes.len() as u16);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, 0);
        push_u32(&mut central, offset);
        central.extend_from_slice(name_bytes);
    }

    let central_offset = output.len() as u32;
    let central_size = central.len() as u32;
    output.extend_from_slice(&central);

    push_u32(&mut output, 0x0605_4b50);
    push_u16(&mut output, 0);
    push_u16(&mut output, 0);
    push_u16(&mut output, entries.len() as u16);
    push_u16(&mut output, entries.len() as u16);
    push_u32(&mut output, central_size);
    push_u32(&mut output, central_offset);
    push_u16(&mut output, 0);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, output).map_err(|e| e.to_string())
}

fn read_stored_zip_entry(bytes: &[u8], target: &str) -> Option<Vec<u8>> {
    let mut offset = 0usize;
    while offset + 30 <= bytes.len() {
        if read_u32(bytes, offset)? != 0x0403_4b50 {
            break;
        }
        let method = read_u16(bytes, offset + 8)?;
        let compressed_size = read_u32(bytes, offset + 18)? as usize;
        let name_len = read_u16(bytes, offset + 26)? as usize;
        let extra_len = read_u16(bytes, offset + 28)? as usize;
        let name_start = offset + 30;
        let name_end = name_start.checked_add(name_len)?;
        let data_start = name_end.checked_add(extra_len)?;
        let data_end = data_start.checked_add(compressed_size)?;
        if data_end > bytes.len() {
            return None;
        }
        let name = std::str::from_utf8(&bytes[name_start..name_end]).ok()?;
        if name == target && method == 0 {
            return Some(bytes[data_start..data_end].to_vec());
        }
        offset = data_end;
    }
    None
}

fn push_u16(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_le_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
    ]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
        *bytes.get(offset + 2)?,
        *bytes.get(offset + 3)?,
    ]))
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in data {
        crc ^= *byte as u32;
        for _ in 0..8 {
            let mask = if crc & 1 == 1 { 0xedb8_8320 } else { 0 };
            crc = (crc >> 1) ^ mask;
        }
    }
    !crc
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Open the single pooled SQLite connection and run migrations once.
            let path = sqlite_path(app.handle())?;
            let conn = db::open_and_migrate(&path)?;
            app.manage(db::Db::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_workspace_config,
            set_workspace_folder,
            pick_folder_dialog,
            ensure_workspace_folders,
            db::kv_get,
            db::kv_set,
            db::db_apply,
            db::db_get_scene,
            db::db_load_scene_nodes,
            db::db_get_thumbnail,
            db::db_get_record,
            db::db_list_records,
            write_reference_file,
            read_reference_file,
            delete_reference_file,
            write_reference_stack_file,
            read_reference_stack_file,
            write_reference_stack_data,
            read_reference_stack_data,
            delete_reference_stack,
            read_references_meta,
            write_references_meta,
            read_local_figx_projects,
            sync_figx_projects,
            delete_figx_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
