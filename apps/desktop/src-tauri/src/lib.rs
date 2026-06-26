use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

mod db;
mod eyedropper;
mod models;

const APP_FOLDER_NAME: &str = "focus-is-what-you-need";
const DEFAULT_WORKSPACE_NAME: &str = "workspace";
const FIGX_ARCHIVE_ENTRY: &str = "data/archive.json";
const SQLITE_FILE_NAME: &str = "persistence.sqlite3";
const SQLITE_DIR_NAME: &str = "db";

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

// One file in a batched export (per-element Export panel). `data` arrives as a
// JSON number array from the webview (same convention as the model runners).
#[derive(Deserialize)]
pub struct ExportArchiveEntry {
    pub name: String,
    pub data: Vec<u8>,
}


struct ZipEntry {
    name: String,
    data: Vec<u8>,
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Propagate the failure instead of `.expect()`-panicking the whole command,
    // matching every sibling path helper that returns Result (RUST-9).
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workspace-config.json"))
}

fn sqlite_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(SQLITE_DIR_NAME)
        .join(SQLITE_FILE_NAME))
}

// One-time move of the database from the app-data root into the dedicated `db/`
// subfolder. The WAL and SHM sidecars are moved together with the main file so
// no committed-but-not-checkpointed writes are lost.
fn migrate_legacy_sqlite(app: &tauri::AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let new_path = data_dir.join(SQLITE_DIR_NAME).join(SQLITE_FILE_NAME);
    if new_path.exists() {
        return Ok(());
    }
    let legacy_main = data_dir.join(SQLITE_FILE_NAME);
    if !legacy_main.exists() {
        return Ok(());
    }
    let target_dir = data_dir.join(SQLITE_DIR_NAME);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let from = data_dir.join(format!("{}{}", SQLITE_FILE_NAME, suffix));
        if from.exists() {
            let to = target_dir.join(format!("{}{}", SQLITE_FILE_NAME, suffix));
            fs::rename(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn default_config(app: &tauri::AppHandle) -> WorkspaceConfig {
    // Default to the app data dir (e.g. ~/Library/Application Support/<bundle>), which
    // the app can always write to. Avoid ~/Documents — macOS TCC blocks writes there
    // with "Operation not permitted" until the user grants Files-and-Folders access.
    let base = app
        .path()
        .app_data_dir()
        .ok()
        .or_else(|| dirs::data_dir().map(|dir| dir.join(APP_FOLDER_NAME)))
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .into_owned();
    WorkspaceConfig {
        base_folder: base,
        workspace_name: DEFAULT_WORKSPACE_NAME.into(),
    }
}

fn read_config(app: &tauri::AppHandle) -> WorkspaceConfig {
    let Ok(path) = config_path(app) else {
        return default_config(app);
    };
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<WorkspaceConfig>(&raw) {
            return cfg;
        }
    }
    default_config(app)
}

fn save_config(app: &tauri::AppHandle, cfg: &WorkspaceConfig) -> Result<(), String> {
    let path = config_path(app)?;
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

fn now_ms() -> u64 {
    // `duration_since(UNIX_EPOCH)` only errors if the system clock is set before
    // 1970; in that (practically impossible) case we fall back to 0 rather than
    // panic. Callers use this only for a `savedAt` timestamp, so a 0 is harmless
    // metadata, not a correctness hazard (RUST-9).
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn ensure_local_structure(cfg: &WorkspaceConfig) -> Result<(), String> {
    // Only the references binary store is needed on disk; everything structured
    // lives in SQLite. The `workspaces/` folder is created on demand when a
    // `.figx` export is actually written.
    fs::create_dir_all(references_dir(cfg)).map_err(|e| e.to_string())?;
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
) -> Result<tauri::ipc::Response, String> {
    let cfg = read_config(&app);
    let data = read_reference_blob(&cfg, &id, &ext)?;
    // Raw bytes over IPC (ArrayBuffer on the JS side). Avoids base64 encode here
    // and a synchronous main-thread atob() decode in the renderer.
    Ok(tauri::ipc::Response::new(data))
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
) -> Result<tauri::ipc::Response, String> {
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
    Ok(tauri::ipc::Response::new(data))
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

#[derive(Deserialize)]
pub struct StackFileInput {
    pub file_name: String,
    pub data_b64: String,
}

// Writes an entire stack (all crop PNGs + data.json) in a single IPC call,
// replacing the previous stack folder. Collapses the old O(cuts) round-trips
// into one, and stages the write so it is atomic-ish: the whole stack is built
// in a temp dir and swapped in only after every file succeeds, so a mid-batch
// failure (bad input, disk full) leaves the previous stack intact (BLD-2).
#[tauri::command]
fn write_reference_stack_batch(
    app: tauri::AppHandle,
    id: String,
    files: Vec<StackFileInput>,
    data_json: String,
) -> Result<(), String> {
    let cfg = read_config(&app);
    ensure_local_structure(&cfg)?;
    let id = safe_path_segment(&id, "reference id")?;
    let ref_dir = reference_dir(&cfg, &id);
    let stack_dir = ref_dir.join("stack");
    let tmp_dir = ref_dir.join("stack.tmp");

    // Validate names + decode every payload before touching the filesystem, so a
    // bad file name or base64 string can't leave a half-written stack.
    let mut decoded: Vec<(String, Vec<u8>)> = Vec::with_capacity(files.len());
    for file in &files {
        let file_name = safe_path_segment(&file.file_name, "stack file name")?;
        let data = BASE64.decode(&file.data_b64).map_err(|e| e.to_string())?;
        decoded.push((file_name, data));
    }

    // Stage the full stack in a fresh temp dir.
    let _ = fs::remove_dir_all(&tmp_dir);
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    for (file_name, data) in &decoded {
        fs::write(tmp_dir.join(file_name), data).map_err(|e| e.to_string())?;
    }
    fs::write(tmp_dir.join("data.json"), &data_json).map_err(|e| e.to_string())?;

    // Swap it in: only now is the existing stack removed, then the staged dir is
    // moved into place. On a failed rename, clean up the temp dir rather than
    // leaving it behind.
    let _ = fs::remove_dir_all(&stack_dir);
    fs::rename(&tmp_dir, &stack_dir).map_err(|e| {
        let _ = fs::remove_dir_all(&tmp_dir);
        e.to_string()
    })
}

/* ---------- Video frame extraction (ffmpeg sidecar) ---------- */

#[derive(Serialize, Clone, Debug)]
pub struct ExtractedFrame {
    pub file: String,
    pub index: u32,
    pub timestamp_ms: u64,
    pub w: u32,
    pub h: u32,
}

fn reference_original_path(cfg: &WorkspaceConfig, id: &str, ext: &str) -> Option<PathBuf> {
    let ext = safe_extension(ext);
    let candidates = [
        reference_dir(cfg, id).join(format!("original.{}", ext)),
        references_dir(cfg).join(format!("{}.{}", id, ext)),
        legacy_reference_dir(cfg, id).join(format!("original.{}", ext)),
        legacy_references_dir(cfg).join(format!("{}.{}", id, ext)),
    ];
    candidates.into_iter().find(|path| path.exists())
}

// Resolve ffmpeg: the bundled sidecar next to the app executable first, then a
// system ffmpeg on PATH (Homebrew etc.) as a dev/no-sidecar fallback.
fn resolve_ffmpeg() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["ffmpeg", "ffmpeg.exe"] {
                let candidate = dir.join(name);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }
    for candidate in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"] {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Some(path);
        }
    }
    if let Ok(output) = std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg("command -v ffmpeg")
        .output()
    {
        if output.status.success() {
            let resolved = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !resolved.is_empty() {
                return Some(PathBuf::from(resolved));
            }
        }
    }
    None
}

#[tauri::command]
fn ffmpeg_available() -> bool {
    resolve_ffmpeg().is_some()
}

#[tauri::command]
async fn extract_video_frames(
    app: tauri::AppHandle,
    id: String,
    ext: String,
    fps: f32,
    max_frames: u32,
    max_width: u32,
) -> Result<Vec<ExtractedFrame>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_video_frames_blocking(&app, &id, &ext, fps, max_frames, max_width)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn extract_video_frames_blocking(
    app: &tauri::AppHandle,
    id: &str,
    ext: &str,
    fps: f32,
    max_frames: u32,
    max_width: u32,
) -> Result<Vec<ExtractedFrame>, String> {
    let cfg = read_config(app);
    ensure_local_structure(&cfg)?;
    let id = safe_path_segment(id, "reference id")?;
    let src = reference_original_path(&cfg, &id, ext).ok_or("video file not found")?;
    let ffmpeg = resolve_ffmpeg().ok_or("ffmpeg is not available")?;

    let fps = if fps.is_finite() && fps > 0.0 { fps } else { 1.5 };
    let max_frames = max_frames.clamp(1, 1000);
    let max_width = max_width.clamp(64, 4096);

    let frames_dir = reference_dir(&cfg, &id).join("frames");
    let _ = fs::remove_dir_all(&frames_dir);
    fs::create_dir_all(&frames_dir).map_err(|e| e.to_string())?;

    let vf = format!("fps={:.4},scale='min({},iw)':-2", fps, max_width);
    let pattern = frames_dir.join("frame-%06d.jpg");
    let status = std::process::Command::new(&ffmpeg)
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(&src)
        .arg("-vf")
        .arg(&vf)
        .arg("-frames:v")
        .arg(max_frames.to_string())
        .arg("-q:v")
        .arg("4")
        .arg(&pattern)
        .status()
        .map_err(|e| format!("ffmpeg failed to start: {e}"))?;
    if !status.success() {
        return Err("ffmpeg failed to extract frames".to_string());
    }

    let mut paths: Vec<PathBuf> = fs::read_dir(&frames_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().and_then(|x| x.to_str()) == Some("jpg"))
        .collect();
    paths.sort();

    let frames = paths
        .iter()
        .enumerate()
        .filter_map(|(index, path)| {
            let file = path.file_name()?.to_string_lossy().into_owned();
            let (w, h) = image::image_dimensions(path).unwrap_or((0, 0));
            let timestamp_ms = ((index as f64) / (fps as f64) * 1000.0) as u64;
            Some(ExtractedFrame {
                file,
                index: index as u32,
                timestamp_ms,
                w,
                h,
            })
        })
        .collect();
    Ok(frames)
}

// Extract a single full-resolution frame at a timestamp as a PNG (raw bytes).
#[tauri::command]
async fn extract_video_frame_full(
    app: tauri::AppHandle,
    id: String,
    ext: String,
    timestamp_ms: u64,
) -> Result<tauri::ipc::Response, String> {
    let data = tauri::async_runtime::spawn_blocking(move || {
        let cfg = read_config(&app);
        let id = safe_path_segment(&id, "reference id")?;
        let src = reference_original_path(&cfg, &id, &ext).ok_or("video file not found")?;
        let ffmpeg = resolve_ffmpeg().ok_or("ffmpeg is not available")?;
        let frames_dir = reference_dir(&cfg, &id).join("frames");
        fs::create_dir_all(&frames_dir).map_err(|e| e.to_string())?;
        let out = frames_dir.join(format!("full-{}.png", timestamp_ms));
        let seconds = format!("{:.3}", timestamp_ms as f64 / 1000.0);
        let status = std::process::Command::new(&ffmpeg)
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error")
            .arg("-ss")
            .arg(&seconds)
            .arg("-i")
            .arg(&src)
            .arg("-frames:v")
            .arg("1")
            .arg("-y")
            .arg(&out)
            .status()
            .map_err(|e| format!("ffmpeg failed to start: {e}"))?;
        if !status.success() {
            return Err("ffmpeg failed to extract frame".to_string());
        }
        let data = fs::read(&out).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(&out);
        Ok::<Vec<u8>, String>(data)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(data))
}

#[tauri::command]
fn read_reference_frame(
    app: tauri::AppHandle,
    id: String,
    file_name: String,
) -> Result<tauri::ipc::Response, String> {
    let cfg = read_config(&app);
    let id = safe_path_segment(&id, "reference id")?;
    let file_name = safe_path_segment(&file_name, "frame file name")?;
    let path = reference_dir(&cfg, &id).join("frames").join(&file_name);
    if !path.exists() {
        return Err("frame not found".to_string());
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(data))
}

#[tauri::command]
fn delete_reference_frames(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let cfg = read_config(&app);
    let id = safe_path_segment(&id, "reference id")?;
    let frames_dir = reference_dir(&cfg, &id).join("frames");
    if frames_dir.exists() {
        let _ = fs::remove_dir_all(frames_dir);
    }
    Ok(())
}

// Explicit, user-triggered export of a single project to a `.figx` file. Writes
// only the one archive (it does not touch the workspace meta), so exporting a
// project never disturbs the others.
#[tauri::command]
fn export_figx_project(
    app: tauri::AppHandle,
    project: FigxProjectInput,
) -> Result<String, String> {
    let cfg = read_config(&app);
    // Create the workspace folder on demand — only an actual export materializes it.
    let target_dir = workspace_dir(&cfg);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let filename = figx_filename(&project.project_id, &project.project_name);
    let path = target_dir.join(&filename);
    remove_stale_project_files(&target_dir, &project.project_id, &filename);

    let entries = project_archive_entries(&cfg, &project)?;
    write_zip_file(&path, &entries)?;

    Ok(path.to_string_lossy().into_owned())
}

// Per-element export (Inspector → Export panel). Opens a native "Save As…"
// dialog and writes the produced bytes; returns the written path, or None when
// the user cancels. Distinct from `.figx` project export (which targets the
// workspace folder): this is a user-chosen destination for one element's image/
// SVG/HTML output.
#[tauri::command]
async fn save_export_file(
    suggested_name: String,
    data: Vec<u8>,
) -> Result<Option<String>, String> {
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new()
            .set_title("Export")
            .set_file_name(&suggested_name);
        if let Some(ext) = Path::new(&suggested_name).extension().and_then(|e| e.to_str()) {
            dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
        }
        dialog.save_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    match chosen {
        Some(path) => {
            fs::write(&path, &data).map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

// Saves a batched export (multiple entries, or an HTML bundle) as a single
// `.zip`, reusing the store-only zip writer. Returns the written path, or None
// when the user cancels.
#[tauri::command]
async fn save_export_archive(
    suggested_name: String,
    entries: Vec<ExportArchiveEntry>,
) -> Result<Option<String>, String> {
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new()
            .set_title("Export")
            .set_file_name(&suggested_name)
            .add_filter("ZIP", &["zip"])
            .save_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    match chosen {
        Some(path) => {
            let zip_entries: Vec<ZipEntry> = entries
                .into_iter()
                .map(|entry| ZipEntry {
                    name: entry.name,
                    data: entry.data,
                })
                .collect();
            write_zip_file(&path, &zip_entries)?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

// Removes any exported `.figx` file for a deleted project. A no-op if the
// project was never exported (the workspace folder may not even exist).
#[tauri::command]
fn delete_figx_project(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let cfg = read_config(&app);
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
    Ok(())
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

fn push_u16(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
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
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Open the single pooled SQLite connection and run migrations once.
            migrate_legacy_sqlite(app.handle())?;
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
            db::db_apply,
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
            write_reference_stack_batch,
            ffmpeg_available,
            extract_video_frames,
            extract_video_frame_full,
            read_reference_frame,
            delete_reference_frames,
            export_figx_project,
            delete_figx_project,
            save_export_file,
            save_export_archive,
            models::model_is_installed,
            models::model_install,
            models::model_uninstall,
            models::run_birefnet,
            models::run_real_esrgan,
            models::run_auto_detect,
            models::run_florence2_text_check,
            models::run_text_check,
            models::run_font_detect,
            models::run_craft,
            models::run_lama,
            models::extract_colors,
            eyedropper::pick_screen_color,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
