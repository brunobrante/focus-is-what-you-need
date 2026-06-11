//! Optional on-device AI processing models (background removal + upscale).
//!
//! Each model is a single ONNX file stored under `$APP_DATA/models/<id>.onnx`.
//! Models are downloaded on demand from HuggingFace and run via ONNX Runtime
//! (the `ort` crate). Nothing here is bundled with the app — a model only
//! exists once the user explicitly installs it from Settings.

use std::borrow::Cow;
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

use image::{DynamicImage, GenericImageView, GrayImage, ImageFormat, Luma, Rgb, RgbImage, Rgba, RgbaImage};
use ndarray::Array4;
use ort::session::{Session, SessionInputValue};
use ort::value::Tensor;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Window};

// fp32 ONNX exports with input layouts that match the pre-processing below:
// BiRefNet lite expects a fixed 1024x1024 input; realesr-general-x4v3 accepts a
// dynamic input and upscales it 4x.
const BIREFNET_URL: &str =
    "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx";
const REAL_ESRGAN_URL: &str =
    "https://huggingface.co/Samo629/real-esrgan-onnx/resolve/main/realesr-general-x4v3.onnx";

const BIREFNET_ID: &str = "birefnet";
const REAL_ESRGAN_ID: &str = "real-esrgan";
const FLORENCE2_ID: &str = "florence2";
const CRAFT_ID: &str = "craft";
const DBNET_RESNET34_ID: &str = "dbnet-resnet34";
const DBNET_RESNET50_ID: &str = "dbnet-resnet50";
const DBNET_MOBILENET_ID: &str = "dbnet-mobilenet-v3-large";
const LAMA_ID: &str = "lama";
const BIREFNET_SIZE: u32 = 1024;
const PROGRESS_EVENT: &str = "model://progress";

// LaMa inpainting: a single fp32 ONNX file (~208 MB). It removes a painted
// selection from a cut by reconstructing the masked region from its surroundings.
// Input is a fixed 512x512 NCHW image plus a 512x512 single-channel mask
// (1 = remove, 0 = keep); output 0 is the inpainted [1, 3, 512, 512] image.
const LAMA_URL: &str =
    "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx";
const LAMA_SIZE: u32 = 512;
// Mask pixels above this (out of 255) count as "remove" when compositing.
const LAMA_MASK_THRESHOLD: u8 = 127;

// CRAFT text detector: a single ONNX file (craft_mlt_25k, fp32, ~80 MB, opset
// 17, MIT). The region score map it produces is thresholded to a yes/no "does
// this cut contain text" answer. Input is NCHW, ImageNet-normalized, with each
// dimension a multiple of 32; output 0 is the [1, H/2, W/2, 2] score map.
const CRAFT_URL: &str =
    "https://huggingface.co/inference4j/craft-mlt-25k/resolve/main/model.onnx";
// Longest-side cap and the multiple the input dimensions are rounded to.
const CRAFT_MAX_SIDE: u32 = 1280;
const CRAFT_SIZE_MULTIPLE: u32 = 32;
// A region score above this anywhere in the map counts as "text detected".
const CRAFT_TEXT_THRESHOLD: f32 = 0.3;

// DBNet text detectors (OnnxTR exports, fp32). Lighter/faster alternatives to
// CRAFT for the same yes/no "does this cut contain text" answer, offered as three
// backbones the user can pick from. (OnnxTR publishes no ResNet18 export.) All
// share one contract: a fixed 1024x1024 NCHW input, ImageNet-normalized; output 0
// is the [1, 1, 1024, 1024] probability map. Text is present when the peak
// probability crosses the threshold.
const DBNET_RESNET34_URL: &str =
    "https://huggingface.co/Felix92/onnxtr-db-resnet34/resolve/main/model.onnx";
const DBNET_RESNET50_URL: &str =
    "https://huggingface.co/Felix92/onnxtr-db-resnet50/resolve/main/model.onnx";
const DBNET_MOBILENET_URL: &str =
    "https://huggingface.co/Felix92/onnxtr-db-mobilenet-v3-large/resolve/main/model.onnx";
const DBNET_SIZE: u32 = 1024;
const DBNET_TEXT_THRESHOLD: f32 = 0.3;

// --- Florence-2 (multi-file package) -------------------------------------
//
// Florence-2 ships as three files rather than one ONNX. They are stored
// together under `$APP_DATA/models/florence2/` and downloaded sequentially.
const FLORENCE2_DIR: &str = "florence2";
const FLORENCE2_VISION_FILE: &str = "vision_encoder.onnx";
const FLORENCE2_EMBED_FILE: &str = "embed_tokens.onnx";
const FLORENCE2_ENCODER_FILE: &str = "encoder_model.onnx";
const FLORENCE2_DECODER_FILE: &str = "decoder_model_merged.onnx";
const FLORENCE2_TOKENIZER_FILE: &str = "tokenizer.json";
const FLORENCE2_VISION_URL: &str =
    "https://huggingface.co/onnx-community/Florence-2-base/resolve/main/onnx/vision_encoder.onnx";
const FLORENCE2_EMBED_URL: &str =
    "https://huggingface.co/onnx-community/Florence-2-base/resolve/main/onnx/embed_tokens.onnx";
const FLORENCE2_ENCODER_URL: &str =
    "https://huggingface.co/onnx-community/Florence-2-base/resolve/main/onnx/encoder_model.onnx";
const FLORENCE2_DECODER_URL: &str =
    "https://huggingface.co/onnx-community/Florence-2-base/resolve/main/onnx/decoder_model_merged.onnx";
const FLORENCE2_TOKENIZER_URL: &str =
    "https://huggingface.co/onnx-community/Florence-2-base/resolve/main/tokenizer.json";

// Florence-2-base geometry (BART-style decoder), used to build the empty
// past-key-value tensors that the merged decoder's no-cache branch expects.
const FLORENCE2_NUM_HEADS: usize = 12;
const FLORENCE2_HEAD_DIM: usize = 64;
const FLORENCE2_INPUT_SIZE: u32 = 768;
// The dense-region-caption task prompt expands to this text, which is BPE-encoded
// and embedded just like Florence-2's own processor does.
const FLORENCE2_TASK_TEXT: &str = "Locate the objects in the image, with their descriptions.";
// OCR task prompt: returns plain text found in the image.
const FLORENCE2_OCR_TASK_TEXT: &str = "What is the text in the image?";
const FLORENCE2_BOS: i64 = 0;
const FLORENCE2_EOS: i64 = 2;
const FLORENCE2_DECODER_START: i64 = 2;
const FLORENCE2_MAX_NEW_TOKENS: usize = 512;
// Florence-2 quantizes coordinates into 1000 location bins (`<loc_0>`..`<loc_999>`).
const FLORENCE2_LOC_BINS: f32 = 1000.0;
// ImageNet normalization (Florence-2 vision pre-processing).
const IMAGENET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const IMAGENET_STD: [f32; 3] = [0.229, 0.224, 0.225];

/// One downloadable file inside a model package. Single-file models have one
/// entry; Florence-2 has three.
struct ModelFile {
    name: &'static str,
    url: &'static str,
}

fn model_file_specs(id: &str) -> Result<Vec<ModelFile>, String> {
    match id {
        BIREFNET_ID => Ok(vec![ModelFile { name: "birefnet.onnx", url: BIREFNET_URL }]),
        REAL_ESRGAN_ID => Ok(vec![ModelFile { name: "real-esrgan.onnx", url: REAL_ESRGAN_URL }]),
        CRAFT_ID => Ok(vec![ModelFile { name: "craft.onnx", url: CRAFT_URL }]),
        DBNET_RESNET34_ID => Ok(vec![ModelFile { name: "dbnet-resnet34.onnx", url: DBNET_RESNET34_URL }]),
        DBNET_RESNET50_ID => Ok(vec![ModelFile { name: "dbnet-resnet50.onnx", url: DBNET_RESNET50_URL }]),
        DBNET_MOBILENET_ID => Ok(vec![ModelFile { name: "dbnet-mobilenet-v3-large.onnx", url: DBNET_MOBILENET_URL }]),
        LAMA_ID => Ok(vec![ModelFile { name: "lama.onnx", url: LAMA_URL }]),
        FLORENCE2_ID => Ok(vec![
            ModelFile { name: FLORENCE2_VISION_FILE, url: FLORENCE2_VISION_URL },
            ModelFile { name: FLORENCE2_EMBED_FILE, url: FLORENCE2_EMBED_URL },
            ModelFile { name: FLORENCE2_ENCODER_FILE, url: FLORENCE2_ENCODER_URL },
            ModelFile { name: FLORENCE2_DECODER_FILE, url: FLORENCE2_DECODER_URL },
            ModelFile { name: FLORENCE2_TOKENIZER_FILE, url: FLORENCE2_TOKENIZER_URL },
        ]),
        other => Err(format!("unknown model id: {other}")),
    }
}

/// Where a model's files live. Single-file models sit directly in `models/`
/// (e.g. `models/birefnet.onnx`); Florence-2 gets its own `models/florence2/`.
fn model_storage_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let base = models_dir(app)?;
    Ok(if id == FLORENCE2_ID { base.join(FLORENCE2_DIR) } else { base })
}

// --- paths ----------------------------------------------------------------

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn model_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(format!("{id}.onnx")))
}

// --- install / uninstall --------------------------------------------------

#[tauri::command]
pub fn model_is_installed(app: AppHandle, id: &str) -> bool {
    let (Ok(specs), Ok(dir)) = (model_file_specs(id), model_storage_dir(&app, id)) else {
        return false;
    };
    // A package counts as installed only when every one of its files is present.
    specs.iter().all(|file| dir.join(file.name).exists())
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    id: String,
    // Per-file fields so a multi-file package (Florence-2) can report which of
    // its files is downloading. Single-file models always report index 0.
    file_index: u32,
    file_name: String,
    downloaded_bytes: u64,
    total_bytes: u64,
}

#[tauri::command]
pub async fn model_install(app: AppHandle, window: Window, id: String) -> Result<(), String> {
    let specs = model_file_specs(&id)?;
    let dir = model_storage_dir(&app, &id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();
    // Sequential, not parallel: one file at a time with its own progress stream.
    for (index, file) in specs.iter().enumerate() {
        let final_path = dir.join(file.name);
        let part_path = dir.join(format!("{}.part", file.name));
        download_file(
            &client,
            file.url,
            &final_path,
            &part_path,
            &window,
            &id,
            index as u32,
            file.name,
        )
        .await?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn download_file(
    client: &reqwest::Client,
    url: &str,
    final_path: &PathBuf,
    part_path: &PathBuf,
    window: &Window,
    id: &str,
    file_index: u32,
    file_name: &str,
) -> Result<(), String> {
    let mut response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("download failed: HTTP {}", response.status()));
    }
    let total_bytes = response.content_length().unwrap_or(0);

    // Stream to a `.part` file and rename on success, so a crash or a cancel
    // (which deletes the `.part`) never leaves a truncated file behind.
    let mut file = fs::File::create(part_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let _ = window.emit(
        PROGRESS_EVENT,
        DownloadProgress {
            id: id.to_string(),
            file_index,
            file_name: file_name.to_string(),
            downloaded_bytes: 0,
            total_bytes,
        },
    );
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let _ = window.emit(
            PROGRESS_EVENT,
            DownloadProgress {
                id: id.to_string(),
                file_index,
                file_name: file_name.to_string(),
                downloaded_bytes: downloaded,
                total_bytes,
            },
        );
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(part_path, final_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn model_uninstall(app: AppHandle, id: &str) -> Result<(), String> {
    let dir = model_storage_dir(&app, id)?;
    if id == FLORENCE2_ID {
        // Multi-file package: drop the whole folder (also cancels a download).
        if dir.exists() {
            fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let specs = model_file_specs(id)?;
    for file in specs {
        let final_path = dir.join(file.name);
        if final_path.exists() {
            fs::remove_file(&final_path).map_err(|e| e.to_string())?;
        }
        // Also clears an in-flight download (acts as a cancel).
        let part_path = dir.join(format!("{}.part", file.name));
        if part_path.exists() {
            let _ = fs::remove_file(&part_path);
        }
    }
    Ok(())
}

// --- inference ------------------------------------------------------------

fn load_session(app: &AppHandle, id: &str) -> Result<Session, String> {
    let path = model_path(app, id)?;
    if !path.exists() {
        return Err(format!("model \"{id}\" is not installed"));
    }
    Session::builder()
        .map_err(|e| e.to_string())?
        .commit_from_file(&path)
        .map_err(|e| e.to_string())
}

fn encode_png(img: DynamicImage) -> Result<Vec<u8>, String> {
    let mut buffer = Cursor::new(Vec::new());
    img.write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(buffer.into_inner())
}

#[tauri::command]
pub async fn run_birefnet(app: AppHandle, image_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || birefnet_blocking(&app, image_bytes))
        .await
        .map_err(|e| e.to_string())?
}

fn birefnet_blocking(app: &AppHandle, image_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let (orig_w, orig_h) = img.dimensions();
    let rgb = img.to_rgb8();

    // Pre-process: resize to 1024x1024, normalize to [0, 1], NCHW layout.
    let size = BIREFNET_SIZE;
    let resized =
        image::imageops::resize(&rgb, size, size, image::imageops::FilterType::Triangle);
    let mut input = Array4::<f32>::zeros((1, 3, size as usize, size as usize));
    for y in 0..size {
        for x in 0..size {
            let px = resized.get_pixel(x, y);
            input[[0, 0, y as usize, x as usize]] = px[0] as f32 / 255.0;
            input[[0, 1, y as usize, x as usize]] = px[1] as f32 / 255.0;
            input[[0, 2, y as usize, x as usize]] = px[2] as f32 / 255.0;
        }
    }

    let mut session = load_session(app, BIREFNET_ID)?;
    let input_name = session.inputs()[0].name().to_string();
    let tensor = Tensor::from_array(input).map_err(|e| e.to_string())?;
    let outputs = session
        .run(ort::inputs![input_name.as_str() => tensor])
        .map_err(|e| e.to_string())?;
    let mask = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let shape = mask.shape();
    let mh = shape[shape.len() - 2];
    let mw = shape[shape.len() - 1];

    // BiRefNet ONNX exports vary: some emit probabilities in [0, 1], others raw
    // logits. Only apply a sigmoid when values fall outside [0, 1].
    let needs_sigmoid = mask.iter().any(|&v| !(0.0..=1.0).contains(&v));
    let mut mask_img = GrayImage::new(mw as u32, mh as u32);
    for y in 0..mh {
        for x in 0..mw {
            let raw = mask[[0, 0, y, x]];
            let alpha: f32 = if needs_sigmoid { 1.0 / (1.0 + (-raw).exp()) } else { raw };
            mask_img.put_pixel(
                x as u32,
                y as u32,
                Luma([(alpha.clamp(0.0, 1.0) * 255.0) as u8]),
            );
        }
    }

    // Post-process: resize the mask back to the original size and apply as alpha.
    let mask_full =
        image::imageops::resize(&mask_img, orig_w, orig_h, image::imageops::FilterType::Triangle);
    let mut out = RgbaImage::new(orig_w, orig_h);
    for y in 0..orig_h {
        for x in 0..orig_w {
            let px = rgb.get_pixel(x, y);
            let alpha = mask_full.get_pixel(x, y)[0];
            out.put_pixel(x, y, Rgba([px[0], px[1], px[2], alpha]));
        }
    }
    encode_png(DynamicImage::ImageRgba8(out))
}

#[tauri::command]
pub async fn run_real_esrgan(app: AppHandle, image_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || real_esrgan_blocking(&app, image_bytes))
        .await
        .map_err(|e| e.to_string())?
}

fn real_esrgan_blocking(app: &AppHandle, image_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();

    // Pre-process: normalize to [0, 1], NCHW layout at the source resolution.
    let mut input = Array4::<f32>::zeros((1, 3, h as usize, w as usize));
    for y in 0..h {
        for x in 0..w {
            let px = rgb.get_pixel(x, y);
            input[[0, 0, y as usize, x as usize]] = px[0] as f32 / 255.0;
            input[[0, 1, y as usize, x as usize]] = px[1] as f32 / 255.0;
            input[[0, 2, y as usize, x as usize]] = px[2] as f32 / 255.0;
        }
    }

    let mut session = load_session(app, REAL_ESRGAN_ID)?;
    let input_name = session.inputs()[0].name().to_string();
    let tensor = Tensor::from_array(input).map_err(|e| e.to_string())?;
    let outputs = session
        .run(ort::inputs![input_name.as_str() => tensor])
        .map_err(|e| e.to_string())?;
    let result = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let shape = result.shape();
    let oh = shape[shape.len() - 2];
    let ow = shape[shape.len() - 1];

    // Post-process: clamp to [0, 1] and write out a 4x-resolution RGB PNG.
    let mut out = RgbImage::new(ow as u32, oh as u32);
    for y in 0..oh {
        for x in 0..ow {
            let r = (result[[0, 0, y, x]].clamp(0.0, 1.0) * 255.0) as u8;
            let g = (result[[0, 1, y, x]].clamp(0.0, 1.0) * 255.0) as u8;
            let b = (result[[0, 2, y, x]].clamp(0.0, 1.0) * 255.0) as u8;
            out.put_pixel(x as u32, y as u32, Rgb([r, g, b]));
        }
    }
    encode_png(DynamicImage::ImageRgb8(out))
}

// --- text detection (CRAFT / DBNet) ---------------------------------------

/// Yes/no text detection for a cut, dispatched to the chosen model. The active
/// model id is owned by the frontend (the `textDetectionModel` setting), so the
/// same command serves whichever text detector the user has selected.
#[tauri::command]
pub async fn run_text_check(
    app: AppHandle,
    model_id: String,
    image_bytes: Vec<u8>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if model_id == CRAFT_ID {
            craft_blocking(&app, image_bytes)
        } else if model_id.starts_with("dbnet") {
            // All DBNet backbones share the same pre/post-processing; the id only
            // selects which ONNX session to load.
            dbnet_blocking(&app, &model_id, image_bytes)
        } else {
            Err(format!("unknown text-detection model: {model_id}"))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_craft(app: AppHandle, image_bytes: Vec<u8>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || craft_blocking(&app, image_bytes))
        .await
        .map_err(|e| e.to_string())?
}

fn dbnet_blocking(app: &AppHandle, model_id: &str, image_bytes: Vec<u8>) -> Result<bool, String> {
    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let rgb = img.to_rgb8();

    // Pre-process: resize to a fixed 1024x1024, ImageNet-normalize, NCHW.
    let size = DBNET_SIZE;
    let resized =
        image::imageops::resize(&rgb, size, size, image::imageops::FilterType::Triangle);
    let mut input = Array4::<f32>::zeros((1, 3, size as usize, size as usize));
    for y in 0..size {
        for x in 0..size {
            let px = resized.get_pixel(x, y);
            for c in 0..3 {
                let value = px[c] as f32 / 255.0;
                input[[0, c, y as usize, x as usize]] = (value - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
            }
        }
    }

    let mut session = load_session(app, model_id)?;
    let input_name = session.inputs()[0].name().to_string();
    let tensor = Tensor::from_array(input).map_err(|e| e.to_string())?;
    let outputs = session
        .run(ort::inputs![input_name.as_str() => tensor])
        .map_err(|e| e.to_string())?;

    // Output 0 is the [1, 1, 1024, 1024] probability map. Some exports emit raw
    // logits instead, so apply a sigmoid only when values fall outside [0, 1].
    let prob = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let needs_sigmoid = prob.iter().any(|&v| !(0.0..=1.0).contains(&v));
    let mut max_prob = f32::MIN;
    for &raw in prob.iter() {
        let value = if needs_sigmoid { 1.0 / (1.0 + (-raw).exp()) } else { raw };
        if value > max_prob {
            max_prob = value;
        }
    }

    Ok(max_prob > DBNET_TEXT_THRESHOLD)
}

/// Rounds `value` up to the nearest multiple of `multiple`, never returning 0.
fn round_up_to_multiple(value: u32, multiple: u32) -> u32 {
    let rounded = value.saturating_add(multiple - 1) / multiple * multiple;
    rounded.max(multiple)
}

fn craft_blocking(app: &AppHandle, image_bytes: Vec<u8>) -> Result<bool, String> {
    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let rgb = img.to_rgb8();
    let (w0, h0) = rgb.dimensions();

    // Pre-process: fit within CRAFT_MAX_SIDE on the longest side, then round each
    // dimension to a multiple of 32 (CRAFT's feature pyramid requires this).
    let longest = w0.max(h0).max(1) as f32;
    let scale = (CRAFT_MAX_SIDE as f32 / longest).min(1.0);
    let target_w = round_up_to_multiple((w0 as f32 * scale).round() as u32, CRAFT_SIZE_MULTIPLE);
    let target_h = round_up_to_multiple((h0 as f32 * scale).round() as u32, CRAFT_SIZE_MULTIPLE);
    let resized = image::imageops::resize(
        &rgb,
        target_w,
        target_h,
        image::imageops::FilterType::Triangle,
    );

    // ImageNet normalization, NCHW [1, 3, H, W].
    let mut input = Array4::<f32>::zeros((1, 3, target_h as usize, target_w as usize));
    for y in 0..target_h {
        for x in 0..target_w {
            let px = resized.get_pixel(x, y);
            for c in 0..3 {
                let value = px[c] as f32 / 255.0;
                input[[0, c, y as usize, x as usize]] = (value - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
            }
        }
    }

    let mut session = load_session(app, CRAFT_ID)?;
    let input_name = session.inputs()[0].name().to_string();
    let tensor = Tensor::from_array(input).map_err(|e| e.to_string())?;
    let outputs = session
        .run(ort::inputs![input_name.as_str() => tensor])
        .map_err(|e| e.to_string())?;

    // CRAFT's first output is the score map [1, H/2, W/2, 2]: channel 0 is the
    // region (character) score, channel 1 the affinity score. Text is present
    // when the peak region score crosses the threshold.
    let scores = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let shape = scores.shape();
    let mut max_region = f32::MIN;
    if shape.len() == 4 && shape[3] == 2 {
        let h = shape[1];
        let w = shape[2];
        for y in 0..h {
            for x in 0..w {
                let value = scores[[0, y, x, 0]];
                if value > max_region {
                    max_region = value;
                }
            }
        }
    } else {
        // Unexpected layout: fall back to the global maximum of the first output.
        for &value in scores.iter() {
            if value > max_region {
                max_region = value;
            }
        }
    }

    Ok(max_region > CRAFT_TEXT_THRESHOLD)
}

// --- LaMa inpainting (remove element) -------------------------------------

#[tauri::command]
pub async fn run_lama(
    app: AppHandle,
    image_bytes: Vec<u8>,
    mask_bytes: Vec<u8>,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || lama_blocking(&app, image_bytes, mask_bytes))
        .await
        .map_err(|e| e.to_string())?
}

/// Resolves which of LaMa's two inputs is the RGB image and which is the mask.
/// Matching by name keeps us robust to whichever order the export declares them
/// in; falls back to (image, mask) declaration order when names are unlabeled.
fn resolve_lama_input_names(names: &[String]) -> Result<(String, String), String> {
    if names.len() < 2 {
        return Err(format!("LaMa expects 2 inputs, found {}", names.len()));
    }
    match names.iter().find(|n| n.to_lowercase().contains("mask")) {
        Some(mask_name) => {
            let image_name = names
                .iter()
                .find(|n| *n != mask_name)
                .cloned()
                .ok_or_else(|| "could not resolve LaMa image input".to_string())?;
            Ok((image_name, mask_name.clone()))
        }
        None => Ok((names[0].clone(), names[1].clone())),
    }
}

fn lama_blocking(
    app: &AppHandle,
    image_bytes: Vec<u8>,
    mask_bytes: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let (orig_w, orig_h) = img.dimensions();
    let rgb = img.to_rgb8();

    let mask_img = image::load_from_memory(&mask_bytes).map_err(|e| e.to_string())?;
    let mask_gray = mask_img.to_luma8();

    // Pre-process: both inputs are resized to LaMa's fixed 512x512.
    let size = LAMA_SIZE;
    let resized = image::imageops::resize(&rgb, size, size, image::imageops::FilterType::Triangle);
    let resized_mask =
        image::imageops::resize(&mask_gray, size, size, image::imageops::FilterType::Triangle);

    // Image tensor: ImageNet-normalized NCHW [1, 3, 512, 512].
    let mut image_input = Array4::<f32>::zeros((1, 3, size as usize, size as usize));
    for y in 0..size {
        for x in 0..size {
            let px = resized.get_pixel(x, y);
            for c in 0..3 {
                let value = px[c] as f32 / 255.0;
                image_input[[0, c, y as usize, x as usize]] =
                    (value - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
            }
        }
    }

    // Mask tensor: [1, 1, 512, 512] in [0, 1] (white = remove).
    let mut mask_input = Array4::<f32>::zeros((1, 1, size as usize, size as usize));
    for y in 0..size {
        for x in 0..size {
            mask_input[[0, 0, y as usize, x as usize]] =
                resized_mask.get_pixel(x, y)[0] as f32 / 255.0;
        }
    }

    let mut session = load_session(app, LAMA_ID)?;
    let input_names: Vec<String> =
        session.inputs().iter().map(|i| i.name().to_string()).collect();
    let (image_name, mask_name) = resolve_lama_input_names(&input_names)?;

    let image_tensor = Tensor::from_array(image_input).map_err(|e| e.to_string())?;
    let mask_tensor = Tensor::from_array(mask_input).map_err(|e| e.to_string())?;
    let outputs = session
        .run(ort::inputs![
            image_name.as_str() => image_tensor,
            mask_name.as_str() => mask_tensor
        ])
        .map_err(|e| e.to_string())?;

    // Output [1, 3, 512, 512]: reverse the ImageNet normalization back to RGB.
    let result = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let shape = result.shape();
    let oh = shape[shape.len() - 2];
    let ow = shape[shape.len() - 1];
    let mut inpainted = RgbImage::new(ow as u32, oh as u32);
    for y in 0..oh {
        for x in 0..ow {
            let mut px = [0u8; 3];
            for c in 0..3 {
                let denorm = (result[[0, c, y, x]] * IMAGENET_STD[c] + IMAGENET_MEAN[c])
                    .clamp(0.0, 1.0);
                px[c] = (denorm * 255.0) as u8;
            }
            inpainted.put_pixel(x as u32, y as u32, Rgb(px));
        }
    }

    // Resize the inpainted result back to the cut's original resolution.
    let inpainted_full = image::imageops::resize(
        &inpainted,
        orig_w,
        orig_h,
        image::imageops::FilterType::Triangle,
    );

    // Composite at full resolution: inpainted pixels where the mask is white,
    // original pixels where it is black. The mask is matched to the original
    // size first, since the painted mask may arrive at the display resolution.
    let mask_full = if mask_gray.dimensions() == (orig_w, orig_h) {
        mask_gray
    } else {
        image::imageops::resize(
            &mask_gray,
            orig_w,
            orig_h,
            image::imageops::FilterType::Triangle,
        )
    };
    let mut out = RgbImage::new(orig_w, orig_h);
    for y in 0..orig_h {
        for x in 0..orig_w {
            let pixel = if mask_full.get_pixel(x, y)[0] > LAMA_MASK_THRESHOLD {
                *inpainted_full.get_pixel(x, y)
            } else {
                let o = rgb.get_pixel(x, y);
                Rgb([o[0], o[1], o[2]])
            };
            out.put_pixel(x, y, pixel);
        }
    }
    encode_png(DynamicImage::ImageRgb8(out))
}

// --- Florence-2 auto-detect -----------------------------------------------

/// A region proposed by Florence-2. Coordinates are normalized to the input
/// image (0.0–1.0); the frontend multiplies by the image's pixel size.
#[derive(Clone, Serialize)]
pub struct DetectedRegion {
    pub label: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub confidence: f32,
}

#[tauri::command]
pub async fn run_florence2(
    app: AppHandle,
    image_bytes: Vec<u8>,
) -> Result<Vec<DetectedRegion>, String> {
    tauri::async_runtime::spawn_blocking(move || florence2_blocking(&app, image_bytes))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_florence2_text_check(
    app: AppHandle,
    image_bytes: Vec<u8>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || florence2_text_check_blocking(&app, image_bytes))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum CharClass {
    Letter,
    Number,
    Other,
    Space,
}

fn char_class(ch: char) -> CharClass {
    if ch.is_whitespace() {
        CharClass::Space
    } else if ch.is_alphabetic() {
        CharClass::Letter
    } else if ch.is_numeric() {
        CharClass::Number
    } else {
        CharClass::Other
    }
}

/// Byte-level BPE tokenizer for Florence-2's `tokenizer.json` (BART/RoBERTa
/// style). Implements the three operations the pipeline needs — `encode` (the
/// task prompt → ids), `token_to_id`, and `decode` — without a native tokenizer
/// dependency. Encoding uses a hand-rolled GPT-2-style pre-tokenizer (the `regex`
/// crate can't express the original lookahead pattern) plus the merge ranks.
struct SimpleTokenizer {
    id_to_token: HashMap<i64, String>,
    token_to_id: HashMap<String, i64>,
    merge_ranks: HashMap<(String, String), usize>,
    byte_encoder: HashMap<u8, char>,
    byte_decoder: HashMap<char, u8>,
}

impl SimpleTokenizer {
    fn from_file(path: &Path) -> Result<Self, String> {
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let value: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let mut id_to_token: HashMap<i64, String> = HashMap::new();
        let mut token_to_id: HashMap<String, i64> = HashMap::new();

        if let Some(vocab) = value
            .get("model")
            .and_then(|m| m.get("vocab"))
            .and_then(|v| v.as_object())
        {
            for (token, id) in vocab {
                if let Some(id) = id.as_i64() {
                    id_to_token.insert(id, token.clone());
                    token_to_id.insert(token.clone(), id);
                }
            }
        }
        // Added tokens (BOS/EOS, the task tokens, and `<loc_N>`) override the
        // base vocab and carry their literal content.
        if let Some(added) = value.get("added_tokens").and_then(|v| v.as_array()) {
            for entry in added {
                if let (Some(id), Some(content)) =
                    (entry.get("id").and_then(|v| v.as_i64()), entry.get("content").and_then(|v| v.as_str()))
                {
                    id_to_token.insert(id, content.to_string());
                    token_to_id.insert(content.to_string(), id);
                }
            }
        }

        // Merge ranks. The json stores merges either as "A B" strings or as
        // ["A", "B"] pairs depending on the export version.
        let mut merge_ranks: HashMap<(String, String), usize> = HashMap::new();
        if let Some(merges) = value
            .get("model")
            .and_then(|m| m.get("merges"))
            .and_then(|v| v.as_array())
        {
            for (rank, merge) in merges.iter().enumerate() {
                let pair = match merge {
                    serde_json::Value::String(s) => {
                        let mut it = s.splitn(2, ' ');
                        match (it.next(), it.next()) {
                            (Some(a), Some(b)) => Some((a.to_string(), b.to_string())),
                            _ => None,
                        }
                    }
                    serde_json::Value::Array(parts) => {
                        match (parts.first().and_then(|v| v.as_str()), parts.get(1).and_then(|v| v.as_str())) {
                            (Some(a), Some(b)) => Some((a.to_string(), b.to_string())),
                            _ => None,
                        }
                    }
                    _ => None,
                };
                if let Some(pair) = pair {
                    merge_ranks.entry(pair).or_insert(rank);
                }
            }
        }

        let (byte_encoder, byte_decoder) = build_byte_tables();
        Ok(Self { id_to_token, token_to_id, merge_ranks, byte_encoder, byte_decoder })
    }

    #[allow(dead_code)]
    fn token_to_id(&self, token: &str) -> Option<i64> {
        self.token_to_id.get(token).copied()
    }

    /// Encode plain text into token ids (no special tokens; the caller adds
    /// BOS/EOS). Pre-tokenizes GPT-2 style, byte-encodes each chunk, then applies
    /// BPE merges.
    fn encode(&self, text: &str) -> Vec<i64> {
        let mut ids: Vec<i64> = Vec::new();
        for chunk in gpt2_pre_tokenize(text) {
            let mut byte_str = String::new();
            for byte in chunk.bytes() {
                if let Some(&ch) = self.byte_encoder.get(&byte) {
                    byte_str.push(ch);
                }
            }
            ids.extend(self.bpe(&byte_str));
        }
        ids
    }

    /// Apply BPE merges to one byte-level-encoded chunk and map to vocab ids.
    fn bpe(&self, chunk: &str) -> Vec<i64> {
        let mut symbols: Vec<String> = chunk.chars().map(|c| c.to_string()).collect();
        if symbols.is_empty() {
            return Vec::new();
        }
        loop {
            let mut best_rank = usize::MAX;
            let mut best_index: Option<usize> = None;
            for i in 0..symbols.len() - 1 {
                let pair = (symbols[i].clone(), symbols[i + 1].clone());
                if let Some(&rank) = self.merge_ranks.get(&pair) {
                    if rank < best_rank {
                        best_rank = rank;
                        best_index = Some(i);
                    }
                }
            }
            let Some(index) = best_index else { break };
            let merged = format!("{}{}", symbols[index], symbols[index + 1]);
            symbols.splice(index..index + 2, [merged]);
        }
        symbols
            .iter()
            .filter_map(|symbol| self.token_to_id.get(symbol).copied())
            .collect()
    }

    fn decode(&self, ids: &[i64]) -> String {
        let mut joined = String::new();
        for id in ids {
            if let Some(token) = self.id_to_token.get(id) {
                joined.push_str(token);
            }
        }
        // Reverse the GPT-2 byte-level alphabet back to raw bytes. The added
        // tokens (`<loc_N>`, `<s>`, …) are pure ASCII and map through unchanged.
        let mut bytes: Vec<u8> = Vec::with_capacity(joined.len());
        for ch in joined.chars() {
            if let Some(&byte) = self.byte_decoder.get(&ch) {
                bytes.push(byte);
            } else {
                let mut buf = [0u8; 4];
                bytes.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
            }
        }
        String::from_utf8_lossy(&bytes).into_owned()
    }
}

/// Approximates the GPT-2 pre-tokenizer: a single optional leading space binds to
/// the following run of same-class characters (letters / digits / punctuation),
/// and runs of whitespace stand alone. Good enough for the fixed task prompts
/// (contraction handling is omitted as the prompts contain none).
fn gpt2_pre_tokenize(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut chunks: Vec<String> = Vec::new();
    let mut i = 0;
    while i < n {
        let start = i;
        if chars[i] == ' ' && i + 1 < n && !chars[i + 1].is_whitespace() {
            // single leading space + the following same-class run
            let mut j = i + 1;
            let class = char_class(chars[j]);
            j += 1;
            while j < n && char_class(chars[j]) == class {
                j += 1;
            }
            chunks.push(chars[start..j].iter().collect());
            i = j;
        } else if chars[i].is_whitespace() {
            let mut j = i;
            while j < n && chars[j].is_whitespace() {
                j += 1;
            }
            chunks.push(chars[start..j].iter().collect());
            i = j;
        } else {
            let class = char_class(chars[i]);
            let mut j = i;
            while j < n && char_class(chars[j]) == class {
                j += 1;
            }
            chunks.push(chars[start..j].iter().collect());
            i = j;
        }
    }
    chunks
}

/// The GPT-2 / BART `bytes_to_unicode` table: `(byte -> alphabet char)` for
/// encoding and `(alphabet char -> byte)` for decoding.
fn build_byte_tables() -> (HashMap<u8, char>, HashMap<char, u8>) {
    let mut bytes: Vec<u32> = Vec::new();
    for b in 0x21u32..=0x7e {
        bytes.push(b);
    }
    for b in 0xa1u32..=0xac {
        bytes.push(b);
    }
    for b in 0xaeu32..=0xff {
        bytes.push(b);
    }
    let mut codes: Vec<u32> = bytes.clone();
    let mut n = 0u32;
    for b in 0u32..256 {
        if !bytes.contains(&b) {
            bytes.push(b);
            codes.push(256 + n);
            n += 1;
        }
    }
    let mut encoder: HashMap<u8, char> = HashMap::new();
    let mut decoder: HashMap<char, u8> = HashMap::new();
    for (byte, code) in bytes.iter().zip(codes.iter()) {
        if let Some(ch) = char::from_u32(*code) {
            encoder.insert(*byte as u8, ch);
            decoder.insert(ch, *byte as u8);
        }
    }
    (encoder, decoder)
}

fn load_florence2_session(dir: &Path, file: &str) -> Result<Session, String> {
    Session::builder()
        .map_err(|e| e.to_string())?
        .commit_from_file(dir.join(file))
        .map_err(|e| e.to_string())
}

fn florence2_blocking(app: &AppHandle, image_bytes: Vec<u8>) -> Result<Vec<DetectedRegion>, String> {
    let text = florence2_decode_text(app, image_bytes, FLORENCE2_TASK_TEXT)?;
    Ok(parse_florence_regions(&text))
}

fn florence2_text_check_blocking(app: &AppHandle, image_bytes: Vec<u8>) -> Result<bool, String> {
    let text = florence2_decode_text(app, image_bytes, FLORENCE2_OCR_TASK_TEXT)?;
    let cleaned = text.replace("<s>", "").replace("</s>", "").replace("<pad>", "");
    Ok(!cleaned.trim().is_empty())
}

fn florence2_decode_text(app: &AppHandle, image_bytes: Vec<u8>, task_text: &str) -> Result<String, String> {
    let dir = model_storage_dir(app, FLORENCE2_ID)?;
    for file in [
        FLORENCE2_VISION_FILE,
        FLORENCE2_EMBED_FILE,
        FLORENCE2_ENCODER_FILE,
        FLORENCE2_DECODER_FILE,
        FLORENCE2_TOKENIZER_FILE,
    ] {
        if !dir.join(file).exists() {
            return Err("model \"florence2\" is not installed".to_string());
        }
    }

    let tokenizer = SimpleTokenizer::from_file(&dir.join(FLORENCE2_TOKENIZER_FILE))?;

    // 1. Pre-process the image: resize to 768x768, ImageNet-normalize, NCHW.
    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let rgb = img.to_rgb8();
    let size = FLORENCE2_INPUT_SIZE;
    let resized =
        image::imageops::resize(&rgb, size, size, image::imageops::FilterType::Triangle);
    let mut pixels = Array4::<f32>::zeros((1, 3, size as usize, size as usize));
    for y in 0..size {
        for x in 0..size {
            let px = resized.get_pixel(x, y);
            for c in 0..3 {
                let value = px[c] as f32 / 255.0;
                pixels[[0, c, y as usize, x as usize]] =
                    (value - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
            }
        }
    }

    // 2. Vision encoder: image -> visual feature embeddings [1, Ni, D].
    let mut vision = load_florence2_session(&dir, FLORENCE2_VISION_FILE)?;
    let vision_input = vision.inputs()[0].name().to_string();
    let pixel_tensor = Tensor::from_array(pixels).map_err(|e| e.to_string())?;
    let vision_out = vision
        .run(ort::inputs![vision_input.as_str() => pixel_tensor])
        .map_err(|e| e.to_string())?;
    let image_features = vision_out[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let vision_shape = image_features.shape();
    if vision_shape.len() != 3 {
        return Err(format!("unexpected vision output rank: {}", vision_shape.len()));
    }
    let num_image_tokens = vision_shape[1];
    let d_model = vision_shape[2];
    let image_features: Vec<f32> = image_features.iter().copied().collect();

    // 3. Embed the task prompt tokens: `<s> ...prompt... </s>` -> [1, Nt, D].
    let mut prompt_ids: Vec<i64> = vec![FLORENCE2_BOS];
    prompt_ids.extend(tokenizer.encode(task_text));
    prompt_ids.push(FLORENCE2_EOS);
    let num_text_tokens = prompt_ids.len();
    let mut embed = load_florence2_session(&dir, FLORENCE2_EMBED_FILE)?;
    let embed_input = embed.inputs()[0].name().to_string();
    let ids_tensor = Tensor::from_array((vec![1, num_text_tokens as i64], prompt_ids))
        .map_err(|e| e.to_string())?;
    let embed_out = embed
        .run(ort::inputs![embed_input.as_str() => ids_tensor])
        .map_err(|e| e.to_string())?;
    let text_embeds = embed_out[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let text_embeds: Vec<f32> = text_embeds.iter().copied().collect();
    // Release the borrow of `embed` so it can be reused per decode step.
    drop(embed_out);

    // 4. Merge visual + text embeddings, then run the BART encoder. The merge is
    // a sequence-dim concatenation: image features first, then prompt embeds.
    let seq = num_image_tokens + num_text_tokens;
    let mut inputs_embeds: Vec<f32> = Vec::with_capacity(seq * d_model);
    inputs_embeds.extend_from_slice(&image_features);
    inputs_embeds.extend_from_slice(&text_embeds);

    let mut encoder = load_florence2_session(&dir, FLORENCE2_ENCODER_FILE)?;
    let encoder_input_names: Vec<String> =
        encoder.inputs().iter().map(|o| o.name().to_string()).collect();
    let mut encoder_inputs: Vec<(Cow<str>, SessionInputValue)> = Vec::new();
    for name in &encoder_input_names {
        let value: SessionInputValue = if name.contains("inputs_embeds") {
            Tensor::from_array((vec![1, seq as i64, d_model as i64], inputs_embeds.clone()))
                .map_err(|e| e.to_string())?
                .into()
        } else if name.contains("attention_mask") {
            Tensor::from_array((vec![1, seq as i64], vec![1i64; seq]))
                .map_err(|e| e.to_string())?
                .into()
        } else {
            continue;
        };
        encoder_inputs.push((Cow::Owned(name.clone()), value));
    }
    let encoder_out = encoder.run(encoder_inputs).map_err(|e| e.to_string())?;
    let encoder_hidden = encoder_out[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let encoder_shape = encoder_hidden.shape();
    if encoder_shape.len() != 3 {
        return Err(format!("unexpected encoder output rank: {}", encoder_shape.len()));
    }
    let encoder_seq = encoder_shape[1];
    let encoder_hidden: Vec<f32> = encoder_hidden.iter().copied().collect();

    // 5. Greedy-decode the region string from the merged decoder.
    let mut decoder = load_florence2_session(&dir, FLORENCE2_DECODER_FILE)?;
    let decoder_inputs: Vec<String> =
        decoder.inputs().iter().map(|o| o.name().to_string()).collect();

    let mut input_ids: Vec<i64> = vec![FLORENCE2_DECODER_START];
    let mut generated: Vec<i64> = Vec::new();
    for _ in 0..FLORENCE2_MAX_NEW_TOKENS {
        // The merged decoder consumes pre-embedded tokens (`inputs_embeds`), so
        // the growing decoder sequence is run through embed_tokens each step.
        let decoder_embeds = florence2_embed(&mut embed, &embed_input, &input_ids)?;
        let next = florence2_decode_step(
            &mut decoder,
            &decoder_inputs,
            &input_ids,
            &decoder_embeds,
            &encoder_hidden,
            encoder_seq,
            d_model,
        )?;
        if next == FLORENCE2_EOS {
            break;
        }
        input_ids.push(next);
        generated.push(next);
    }

    // Decode to text (keeping `<loc_*>` tokens) and return the raw string.
    Ok(tokenizer.decode(&generated))
}

/// Embeds a token sequence with the embed_tokens model, returning a flat
/// `[1, seq, d_model]` buffer.
fn florence2_embed(
    embed: &mut Session,
    input_name: &str,
    ids: &[i64],
) -> Result<Vec<f32>, String> {
    let tensor = Tensor::from_array((vec![1, ids.len() as i64], ids.to_vec()))
        .map_err(|e| e.to_string())?;
    let out = embed
        .run(ort::inputs![input_name => tensor])
        .map_err(|e| e.to_string())?;
    let array = out[0].try_extract_array::<f32>().map_err(|e| e.to_string())?;
    Ok(array.iter().copied().collect())
}

/// Runs one decoder step and returns the argmax token id of the last position.
/// The merged decoder is driven on its no-cache branch (`use_cache_branch=false`
/// with dummy past tensors), re-feeding the full pre-embedded sequence each step.
fn florence2_decode_step(
    decoder: &mut Session,
    input_names: &[String],
    input_ids: &[i64],
    decoder_embeds: &[f32],
    encoder_hidden: &[f32],
    encoder_seq: usize,
    d_model: usize,
) -> Result<i64, String> {
    let seq = input_ids.len();
    let mut inputs: Vec<(Cow<str>, SessionInputValue)> = Vec::new();

    for name in input_names {
        let value: SessionInputValue = if name == "inputs_embeds" {
            Tensor::from_array((vec![1, seq as i64, d_model as i64], decoder_embeds.to_vec()))
                .map_err(|e| e.to_string())?
                .into()
        } else if name == "input_ids" {
            Tensor::from_array((vec![1, seq as i64], input_ids.to_vec()))
                .map_err(|e| e.to_string())?
                .into()
        } else if name == "encoder_hidden_states" {
            Tensor::from_array((
                vec![1, encoder_seq as i64, d_model as i64],
                encoder_hidden.to_vec(),
            ))
            .map_err(|e| e.to_string())?
            .into()
        } else if name == "encoder_attention_mask" {
            Tensor::from_array((vec![1, encoder_seq as i64], vec![1i64; encoder_seq]))
                .map_err(|e| e.to_string())?
                .into()
        } else if name == "attention_mask" {
            Tensor::from_array((vec![1, seq as i64], vec![1i64; seq]))
                .map_err(|e| e.to_string())?
                .into()
        } else if name == "use_cache_branch" {
            Tensor::from_array((vec![1i64], vec![false]))
                .map_err(|e| e.to_string())?
                .into()
        } else if name.starts_with("past_key_values") {
            // Dummy past for the no-cache branch. Semantically this should be a
            // zero-length tensor, but ORT's native tensor constructor rejects a
            // 0 dimension. On `use_cache_branch=false` the past feeds an
            // unexecuted `If` branch and is ignored, so a length-1 zero tensor is
            // accepted and has no effect on the result.
            let len = FLORENCE2_NUM_HEADS * FLORENCE2_HEAD_DIM;
            Tensor::from_array((
                vec![1, FLORENCE2_NUM_HEADS as i64, 1, FLORENCE2_HEAD_DIM as i64],
                vec![0f32; len],
            ))
            .map_err(|e| e.to_string())?
            .into()
        } else {
            // Unknown / optional input: skip it. ORT errors out if it was required.
            continue;
        };
        inputs.push((Cow::Owned(name.clone()), value));
    }

    let outputs = decoder.run(inputs).map_err(|e| e.to_string())?;
    let logits = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let shape = logits.shape();
    if shape.len() != 3 {
        return Err(format!("unexpected decoder output rank: {}", shape.len()));
    }
    let last = shape[1] - 1;
    let vocab = shape[2];
    let mut best_id = 0i64;
    let mut best_value = f32::MIN;
    for v in 0..vocab {
        let value = logits[[0, last, v]];
        if value > best_value {
            best_value = value;
            best_id = v as i64;
        }
    }
    Ok(best_id)
}

/// Parses Florence-2's region string. Regions come as a label followed by four
/// `<loc_N>` tokens (`x1,y1,x2,y2`), each bin in `0..1000`. Returns normalized
/// boxes in the 0.0–1.0 range.
fn parse_florence_regions(text: &str) -> Vec<DetectedRegion> {
    // Strip the BART special tokens that `decode(.., false)` leaves in.
    let cleaned = text
        .replace("<s>", "")
        .replace("</s>", "")
        .replace("<pad>", "");
    let chars: Vec<char> = cleaned.chars().collect();
    let prefix: Vec<char> = "<loc_".chars().collect();
    let n = chars.len();
    let mut i = 0;
    let mut label = String::new();
    let mut locs: Vec<f32> = Vec::new();
    let mut regions: Vec<DetectedRegion> = Vec::new();

    while i < n {
        let is_loc = i + prefix.len() <= n && chars[i..i + prefix.len()] == prefix[..];
        if is_loc {
            let mut j = i + prefix.len();
            let mut num = String::new();
            while j < n && chars[j].is_ascii_digit() {
                num.push(chars[j]);
                j += 1;
            }
            if j < n && chars[j] == '>' && !num.is_empty() {
                if let Ok(bin) = num.parse::<f32>() {
                    locs.push((bin / FLORENCE2_LOC_BINS).clamp(0.0, 1.0));
                }
                i = j + 1;
                if locs.len() == 4 {
                    let (x1, y1, x2, y2) = (locs[0], locs[1], locs[2], locs[3]);
                    let x = x1.min(x2);
                    let y = y1.min(y2);
                    let w = (x2 - x1).abs();
                    let h = (y2 - y1).abs();
                    if w > 0.0 && h > 0.0 {
                        let name = label.trim();
                        regions.push(DetectedRegion {
                            label: if name.is_empty() { "Region".to_string() } else { name.to_string() },
                            x,
                            y,
                            w,
                            h,
                            confidence: 1.0,
                        });
                    }
                    label.clear();
                    locs.clear();
                }
                continue;
            }
        }
        label.push(chars[i]);
        i += 1;
    }

    regions
}
