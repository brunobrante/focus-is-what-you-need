//! Optional on-device AI processing models (background removal + upscale).
//!
//! Each model is a single ONNX file stored under `$APP_DATA/models/<id>.onnx`.
//! Models are downloaded on demand from HuggingFace and run via ONNX Runtime
//! (the `ort` crate). Nothing here is bundled with the app — a model only
//! exists once the user explicitly installs it from Settings.

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use image::{DynamicImage, GenericImageView, GrayImage, ImageFormat, Luma, Rgb, RgbImage, Rgba, RgbaImage};
use ndarray::{Array3, Array4};
use ort::session::{Session, SessionInputValue};
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
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
const OMNIPARSER_ID: &str = "omniparser-icon-detect";
const FONT_CLASSIFY_ID: &str = "font-classify";
const BIREFNET_SIZE: u32 = 1024;
const PROGRESS_EVENT: &str = "model://progress";

// Font detector (Storia AI font-classify, EfficientNet-B3, ~64 MB). A multi-file
// package: the ONNX model plus two YAML sidecars stored together under
// `$APP_DATA/models/font-classify/`. `model_config.yaml` carries the input `size`
// and the ordered `classnames` (3,473 font names); inference letterboxes the cut
// to that square with WHITE padding (the training `ResizeWithPad`), ImageNet-
// normalizes, runs the net, then softmax + argmax over the class list. The
// predicted class name (e.g. "Roboto-Regular") is the font.
const FONT_CLASSIFY_MODEL_FILE: &str = "model.onnx";
const FONT_CLASSIFY_MAPPING_FILE: &str = "fonts_mapping.yaml";
const FONT_CLASSIFY_CONFIG_FILE: &str = "model_config.yaml";
const FONT_CLASSIFY_MODEL_URL: &str =
    "https://huggingface.co/storia/font-classify-onnx/resolve/main/model.onnx";
const FONT_CLASSIFY_MAPPING_URL: &str =
    "https://huggingface.co/storia/font-classify-onnx/resolve/main/fonts_mapping.yaml";
const FONT_CLASSIFY_CONFIG_URL: &str =
    "https://huggingface.co/storia/font-classify-onnx/resolve/main/model_config.yaml";
// ResizeWithPad pads with white; matches the model's training pre-processing.
const FONT_CLASSIFY_PAD: u8 = 255;
const FONT_CLASSIFY_TOP_K: usize = 3;

// OmniParser icon detector: a single YOLOv8 ONNX (~58 MB) that proposes UI
// icon/element bounding boxes from a screenshot. Pre-processing per its
// preprocessor_config.json: rescale 1/255, no ImageNet normalization, letterbox
// to a 640 square. Output 0 is the YOLOv8 head [1, 5, N] (cx, cy, w, h, score in
// 640-input pixel space); we threshold, un-letterbox, normalize, then NMS.
const OMNIPARSER_URL: &str =
    "https://huggingface.co/onnx-community/OmniParser-icon_detect/resolve/main/onnx/model.onnx";
const OMNIPARSER_SIZE: u32 = 640;
// The icon detector emits low confidences; keep the floor permissive and rely on
// NMS + the detection cap to control noise.
const OMNIPARSER_SCORE_THRESHOLD: f32 = 0.05;
const OMNIPARSER_IOU_THRESHOLD: f32 = 0.45;
const OMNIPARSER_MAX_DETECTIONS: usize = 200;
// Neutral gray pad used when letterboxing to a square (standard YOLO value).
const OMNIPARSER_PAD: u8 = 114;

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
// together under `$APP_DATA/models/florence2/` (the per-package subfolder that
// `model_storage_dir` allocates for any multi-file model) and downloaded
// sequentially.
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

// --- SAM (Segment Anything, multi-file packages) -------------------------
//
// Object segmentation for the "Adjust crop" action: given the user's crop
// rectangle as a box prompt, SAM returns a tight mask of the object so the cut
// can follow its silhouette instead of a plain rectangle. Two interchangeable
// models share ONE inference path (the transformers.js SAM ONNX contract) — the
// user picks which to run:
//   - SlimSAM (~40 MB): a distilled, lightweight SAM. Fast on CPU.
//   - SAM ViT-B (~375 MB): the full ViT-B backbone. Higher quality, slower.
// Each ships as two files under `$APP_DATA/models/<id>/`:
//   - vision_encoder.onnx: `pixel_values` [1,3,1024,1024] -> `image_embeddings`
//     and `image_positional_embeddings`, both [1,256,64,64]. Pre-processing is
//     the same as Florence-2's vision tower (resize longest side to 1024,
//     ImageNet-normalize) plus a bottom-right zero pad to the 1024 square.
//   - prompt_encoder_mask_decoder.onnx: the two embeddings + a point prompt
//     (`input_points` [1,1,N,2] f32, `input_labels` [1,1,N] i64) -> `iou_scores`
//     [1,1,3] and `pred_masks` [1,1,3,256,256] (3 low-res logit candidates; we
//     keep the highest-IoU one). A box prompt is encoded as its two corner
//     points labeled 2 (top-left) and 3 (bottom-right).
const SLIMSAM_ID: &str = "slimsam";
const SAM_VIT_B_ID: &str = "sam-vit-base";
const SAM_ENCODER_FILE: &str = "vision_encoder.onnx";
const SAM_DECODER_FILE: &str = "prompt_encoder_mask_decoder.onnx";
const SLIMSAM_ENCODER_URL: &str =
    "https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder.onnx";
const SLIMSAM_DECODER_URL: &str =
    "https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/prompt_encoder_mask_decoder.onnx";
const SAM_VIT_B_ENCODER_URL: &str =
    "https://huggingface.co/Xenova/sam-vit-base/resolve/main/onnx/vision_encoder.onnx";
const SAM_VIT_B_DECODER_URL: &str =
    "https://huggingface.co/Xenova/sam-vit-base/resolve/main/onnx/prompt_encoder_mask_decoder.onnx";
// SAM operates on a fixed 1024 input; the mask decoder emits 256x256 low-res logits.
const SAM_INPUT_SIZE: u32 = 1024;

/// Per-channel normalization for an image → NCHW tensor fill.
#[derive(Clone, Copy)]
enum NchwNorm {
    /// Rescale to `[0, 1]` (`v / 255`).
    Div255,
    /// Rescale then ImageNet-normalize (`(v/255 - mean) / std`).
    ImageNet,
}

impl NchwNorm {
    #[inline]
    fn apply(self, value: u8, channel: usize) -> f32 {
        let v = value as f32 / 255.0;
        match self {
            NchwNorm::Div255 => v,
            NchwNorm::ImageNet => (v - IMAGENET_MEAN[channel]) / IMAGENET_STD[channel],
        }
    }
}

/// Writes an RGB image into a pre-allocated NCHW `[1, 3, H, W]` tensor at the
/// `(pad_x, pad_y)` offset, applying `norm` per channel. This replaces the
/// per-model copies of the same fill loop — the blocks differed only in the
/// normalization and the letterbox offset, which are now parameters.
///
/// The tensor is written through its contiguous backing slice with computed
/// flat offsets, avoiding ndarray's per-axis stride math + bounds checks on
/// every pixel write (RUST-5). `input` is always standard (C) layout here — it
/// comes straight from `Array4::zeros` / `from_elem`.
fn fill_nchw_rgb(input: &mut Array4<f32>, img: &RgbImage, pad_x: u32, pad_y: u32, norm: NchwNorm) {
    let (_, _, height, width) = input.dim();
    let plane = height * width;
    let (pad_x, pad_y) = (pad_x as usize, pad_y as usize);
    let buf = input
        .as_slice_mut()
        .expect("NCHW tensor must be standard contiguous layout");
    let (w, h) = img.dimensions();
    for y in 0..h as usize {
        let row = (pad_y + y) * width + pad_x;
        for x in 0..w as usize {
            let px = img.get_pixel(x as u32, y as u32);
            let idx = row + x;
            for c in 0..3 {
                buf[c * plane + idx] = norm.apply(px[c], c);
            }
        }
    }
}

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
        OMNIPARSER_ID => Ok(vec![ModelFile {
            name: "omniparser-icon-detect.onnx",
            url: OMNIPARSER_URL,
        }]),
        SLIMSAM_ID => Ok(vec![
            ModelFile { name: SAM_ENCODER_FILE, url: SLIMSAM_ENCODER_URL },
            ModelFile { name: SAM_DECODER_FILE, url: SLIMSAM_DECODER_URL },
        ]),
        SAM_VIT_B_ID => Ok(vec![
            ModelFile { name: SAM_ENCODER_FILE, url: SAM_VIT_B_ENCODER_URL },
            ModelFile { name: SAM_DECODER_FILE, url: SAM_VIT_B_DECODER_URL },
        ]),
        FONT_CLASSIFY_ID => Ok(vec![
            ModelFile { name: FONT_CLASSIFY_MODEL_FILE, url: FONT_CLASSIFY_MODEL_URL },
            ModelFile { name: FONT_CLASSIFY_MAPPING_FILE, url: FONT_CLASSIFY_MAPPING_URL },
            ModelFile { name: FONT_CLASSIFY_CONFIG_FILE, url: FONT_CLASSIFY_CONFIG_URL },
        ]),
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
/// (e.g. `models/birefnet.onnx`); multi-file packages get their own subfolder
/// named by id (e.g. `models/florence2/`, `models/font-classify/`).
fn model_storage_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let base = models_dir(app)?;
    let multi_file = model_file_specs(id).map(|specs| specs.len() > 1).unwrap_or(false);
    Ok(if multi_file { base.join(id) } else { base })
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
    // Reject a second concurrent install of the same id rather than let it
    // interleave into the shared `.part` file and publish a corrupt model (M11).
    // The guard releases the slot on drop, including on early-return or panic.
    let sessions = app.state::<ModelSessions>();
    let _install_guard = sessions
        .begin_install(&id)
        .ok_or_else(|| format!("model \"{id}\" is already installing"))?;

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
pub async fn model_uninstall(app: AppHandle, id: String) -> Result<(), String> {
    // Drop any cached sessions first so they cannot outlive the deleted files (RUST-8).
    app.state::<ModelSessions>().invalidate(&id);
    // remove_dir_all of a model folder can be ~700 MB — off the main thread (H4).
    tauri::async_runtime::spawn_blocking(move || {
        let dir = model_storage_dir(&app, &id)?;
        let specs = model_file_specs(&id)?;
        if specs.len() > 1 {
            // Multi-file package (its own folder): drop the whole folder, which also
            // cancels an in-flight download.
            if dir.exists() {
                fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
            }
            return Ok(());
        }
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
    })
    .await
    .map_err(|e| e.to_string())?
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
pub async fn run_birefnet(app: AppHandle, image_bytes: Vec<u8>) -> Result<tauri::ipc::Response, String> {
    // Return the processed image as raw bytes (ArrayBuffer on the JS side) rather
    // than a JSON number array, which ~4x'd a multi-MB result over IPC (M12).
    let out = tauri::async_runtime::spawn_blocking(move || birefnet_blocking(&app, image_bytes))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(out))
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
    fill_nchw_rgb(&mut input, &resized, 0, 0, NchwNorm::Div255);

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
pub async fn run_real_esrgan(app: AppHandle, image_bytes: Vec<u8>) -> Result<tauri::ipc::Response, String> {
    // Upscaled output is *larger* than the input; ship it as raw bytes, not a
    // JSON number array (M12).
    let out = tauri::async_runtime::spawn_blocking(move || real_esrgan_blocking(&app, image_bytes))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(out))
}

fn real_esrgan_blocking(app: &AppHandle, image_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();

    // Pre-process: normalize to [0, 1], NCHW layout at the source resolution.
    let mut input = Array4::<f32>::zeros((1, 3, h as usize, w as usize));
    fill_nchw_rgb(&mut input, &rgb, 0, 0, NchwNorm::Div255);

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
    fill_nchw_rgb(&mut input, &resized, 0, 0, NchwNorm::ImageNet);

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
    fill_nchw_rgb(&mut input, &resized, 0, 0, NchwNorm::ImageNet);

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

// --- Color detector (model-free) ------------------------------------------

#[derive(Serialize)]
pub struct ColorEntry {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub count: u32,
}

/// Extracts all colors from an image, quantized to 4 bits per channel (16
/// levels per channel, ~4096 possible buckets). Returns entries sorted by
/// pixel count descending so the dominant color is first.
#[tauri::command]
pub async fn extract_colors(image_bytes: Vec<u8>) -> Result<Vec<ColorEntry>, String> {
    // Full image decode + a per-pixel histogram over an arbitrarily large
    // screenshot — run it on the blocking pool, not the main thread (H4).
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
        let rgb = img.to_rgb8();
        let mut counts: HashMap<(u8, u8, u8), u32> = HashMap::new();
        for px in rgb.pixels() {
            let key = (px[0] & 0xF0, px[1] & 0xF0, px[2] & 0xF0);
            *counts.entry(key).or_insert(0) += 1;
        }
        let mut entries: Vec<ColorEntry> = counts
            .into_iter()
            .map(|((r, g, b), count)| ColorEntry { r, g, b, count })
            .collect();
        entries.sort_by(|a, b| b.count.cmp(&a.count));
        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- LaMa inpainting (remove element) -------------------------------------

#[tauri::command]
pub async fn run_lama(
    app: AppHandle,
    image_bytes: Vec<u8>,
    mask_bytes: Vec<u8>,
) -> Result<tauri::ipc::Response, String> {
    // Inpainted full-res image back as raw bytes, not a JSON number array (M12).
    let out = tauri::async_runtime::spawn_blocking(move || lama_blocking(&app, image_bytes, mask_bytes))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(out))
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
    fill_nchw_rgb(&mut image_input, &resized, 0, 0, NchwNorm::ImageNet);

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

/// Crop-region proposals for a screenshot, dispatched to the chosen auto-detect
/// model. The active model id is owned by the frontend (the `autoDetect` feature's
/// active model), so the same command serves whichever detector the user picked.
/// Returns regions with normalized (0.0–1.0) coordinates.
#[tauri::command]
pub async fn run_auto_detect(
    app: AppHandle,
    model_id: String,
    image_bytes: Vec<u8>,
) -> Result<Vec<DetectedRegion>, String> {
    tauri::async_runtime::spawn_blocking(move || match model_id.as_str() {
        OMNIPARSER_ID => omniparser_blocking(&app, image_bytes),
        FLORENCE2_ID => florence2_blocking(&app, image_bytes),
        other => Err(format!("unknown auto-detect model: {other}")),
    })
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

// --- OmniParser icon detector (YOLOv8) ------------------------------------

fn omniparser_blocking(app: &AppHandle, image_bytes: Vec<u8>) -> Result<Vec<DetectedRegion>, String> {
    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let (orig_w, orig_h) = img.dimensions();
    if orig_w == 0 || orig_h == 0 {
        return Ok(Vec::new());
    }
    let rgb = img.to_rgb8();

    // Letterbox into a SIZE x SIZE square, preserving aspect with gray padding.
    let size = OMNIPARSER_SIZE;
    let scale = (size as f32 / orig_w as f32).min(size as f32 / orig_h as f32);
    let new_w = ((orig_w as f32 * scale).round() as u32).clamp(1, size);
    let new_h = ((orig_h as f32 * scale).round() as u32).clamp(1, size);
    let pad_x = (size - new_w) / 2;
    let pad_y = (size - new_h) / 2;
    let resized =
        image::imageops::resize(&rgb, new_w, new_h, image::imageops::FilterType::Triangle);

    // Rescale 1/255, no ImageNet normalization. Fill with the (rescaled) pad
    // color, then overlay the resized image at its offset.
    let pad_value = OMNIPARSER_PAD as f32 / 255.0;
    let mut input = Array4::<f32>::from_elem((1, 3, size as usize, size as usize), pad_value);
    fill_nchw_rgb(&mut input, &resized, pad_x, pad_y, NchwNorm::Div255);

    let mut session = load_session(app, OMNIPARSER_ID)?;
    let input_name = session.inputs()[0].name().to_string();
    let tensor = Tensor::from_array(input).map_err(|e| e.to_string())?;
    let outputs = session
        .run(ort::inputs![input_name.as_str() => tensor])
        .map_err(|e| e.to_string())?;

    // Output 0 is the YOLOv8 head: [1, 5, N] (or [1, N, 5]); 5 = cx, cy, w, h,
    // score for the single "icon" class, in 640-input pixel space.
    let out = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?;
    let shape = out.shape().to_vec();
    if shape.len() != 3 || shape[0] != 1 {
        return Err(format!("unexpected OmniParser output shape: {shape:?}"));
    }
    let (attr_first, attr, anchors) = if shape[1] == 5 {
        (true, shape[1], shape[2])
    } else if shape[2] == 5 {
        (false, shape[2], shape[1])
    } else {
        return Err(format!("unexpected OmniParser output shape: {shape:?}"));
    };
    let data: Vec<f32> = out.iter().copied().collect();
    let at = |a: usize, n: usize| -> f32 {
        if attr_first {
            data[a * anchors + n]
        } else {
            data[n * attr + a]
        }
    };

    let inv_scale = 1.0 / scale;
    let mut candidates: Vec<DetectedRegion> = Vec::new();
    for n in 0..anchors {
        let score = at(4, n);
        if score <= OMNIPARSER_SCORE_THRESHOLD {
            continue;
        }
        let cx = at(0, n);
        let cy = at(1, n);
        let bw = at(2, n);
        let bh = at(3, n);
        // 640-space center box → xyxy → drop letterbox padding → original pixels.
        let x0 = (((cx - bw / 2.0) - pad_x as f32) * inv_scale).clamp(0.0, orig_w as f32);
        let y0 = (((cy - bh / 2.0) - pad_y as f32) * inv_scale).clamp(0.0, orig_h as f32);
        let x1 = (((cx + bw / 2.0) - pad_x as f32) * inv_scale).clamp(0.0, orig_w as f32);
        let y1 = (((cy + bh / 2.0) - pad_y as f32) * inv_scale).clamp(0.0, orig_h as f32);
        let w = x1 - x0;
        let h = y1 - y0;
        if w < 1.0 || h < 1.0 {
            continue;
        }
        candidates.push(DetectedRegion {
            label: String::new(),
            x: x0 / orig_w as f32,
            y: y0 / orig_h as f32,
            w: w / orig_w as f32,
            h: h / orig_h as f32,
            confidence: score,
        });
    }

    Ok(nms(candidates, OMNIPARSER_IOU_THRESHOLD, OMNIPARSER_MAX_DETECTIONS))
}

/// Intersection-over-union of two normalized regions.
fn iou(a: &DetectedRegion, b: &DetectedRegion) -> f32 {
    let ix1 = a.x.max(b.x);
    let iy1 = a.y.max(b.y);
    let ix2 = (a.x + a.w).min(b.x + b.w);
    let iy2 = (a.y + a.h).min(b.y + b.h);
    let iw = (ix2 - ix1).max(0.0);
    let ih = (iy2 - iy1).max(0.0);
    let inter = iw * ih;
    let union = a.w * a.h + b.w * b.h - inter;
    if union <= 0.0 {
        0.0
    } else {
        inter / union
    }
}

/// Greedy non-max suppression: keep the highest-confidence boxes, dropping any
/// that overlap an already-kept box beyond `iou_threshold`. Caps the output.
fn nms(mut boxes: Vec<DetectedRegion>, iou_threshold: f32, max_out: usize) -> Vec<DetectedRegion> {
    boxes.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut kept: Vec<DetectedRegion> = Vec::new();
    for cand in boxes {
        if kept.len() >= max_out {
            break;
        }
        if kept.iter().any(|k| iou(k, &cand) > iou_threshold) {
            continue;
        }
        kept.push(cand);
    }
    kept
}

// --- SAM object segmentation ----------------------------------------------

/// The active SAM model's two ONNX sessions, kept alive between calls (RUST-8).
struct SamSessions {
    /// Which catalog model these sessions belong to (`slimsam` / `sam-vit-base`).
    model_id: String,
    encoder: Session,
    decoder: Session,
}

/// The crop rectangle, in the input image's pixel space, used as SAM's box prompt.
#[derive(Deserialize)]
pub struct SamBox {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// Segments the object inside `bbox` using the chosen SAM model and returns a
/// PNG grayscale mask (white = object) at the input image's resolution. The
/// frontend traces the mask into a contour preview and, on save, uses it as the
/// cut's alpha. `model_id` selects SlimSAM or SAM ViT-B (same inference path).
#[tauri::command]
pub async fn run_sam_segment(
    app: AppHandle,
    model_id: String,
    image_bytes: Vec<u8>,
    bbox: SamBox,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || sam_segment_blocking(&app, &model_id, image_bytes, bbox))
        .await
        .map_err(|e| e.to_string())?
}

fn sam_segment_blocking(
    app: &AppHandle,
    model_id: &str,
    image_bytes: Vec<u8>,
    bbox: SamBox,
) -> Result<Vec<u8>, String> {
    if model_id != SLIMSAM_ID && model_id != SAM_VIT_B_ID {
        return Err(format!("unknown segmentation model: {model_id}"));
    }
    let dir = model_storage_dir(app, model_id)?;
    // Reuse the install spec as the single source of truth for the file list so
    // the presence-check can't silently desync from install (RUST-10).
    for file in model_file_specs(model_id)? {
        if !dir.join(file.name).exists() {
            return Err(format!("model \"{model_id}\" is not installed"));
        }
    }

    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let (orig_w, orig_h) = img.dimensions();
    if orig_w == 0 || orig_h == 0 {
        return Err("empty image".to_string());
    }
    let rgb = img.to_rgb8();

    // Pre-process: resize the longest side to 1024 (preserving aspect), then sit
    // the image at the top-left of a 1024 square zero-padded at bottom/right.
    let size = SAM_INPUT_SIZE;
    let scale = size as f32 / orig_w.max(orig_h) as f32;
    let new_w = ((orig_w as f32 * scale).round() as u32).clamp(1, size);
    let new_h = ((orig_h as f32 * scale).round() as u32).clamp(1, size);
    let resized =
        image::imageops::resize(&rgb, new_w, new_h, image::imageops::FilterType::Triangle);
    let mut pixels = Array4::<f32>::zeros((1, 3, size as usize, size as usize));
    fill_nchw_rgb(&mut pixels, &resized, 0, 0, NchwNorm::ImageNet);

    // Pull the cached sessions (RUST-8), (re)loading them when the model changed.
    let state = app.state::<ModelSessions>();
    let mut guard = state.sam.lock().unwrap_or_else(|e| e.into_inner());
    if guard.as_ref().map(|s| s.model_id != model_id).unwrap_or(true) {
        *guard = Some(SamSessions {
            model_id: model_id.to_string(),
            encoder: load_package_session(&dir, SAM_ENCODER_FILE)?,
            decoder: load_package_session(&dir, SAM_DECODER_FILE)?,
        });
    }
    let SamSessions { encoder, decoder, .. } = guard.as_mut().unwrap();

    // 1. Vision encoder: image -> image_embeddings + image_positional_embeddings,
    //    both [1, 256, 64, 64]. Own them so the decoder can take them by value.
    let (image_embeddings, image_positional_embeddings) = {
        let enc_in = encoder.inputs()[0].name().to_string();
        let pixel_tensor = Tensor::from_array(pixels).map_err(|e| e.to_string())?;
        let enc_out = encoder
            .run(ort::inputs![enc_in.as_str() => pixel_tensor])
            .map_err(|e| e.to_string())?;
        // The SAM encoder is expected to return [image_embeddings, positional];
        // a model whose output layout differs would panic on the bare index, so
        // check the count and return an error instead (L4).
        if enc_out.len() < 2 {
            return Err(format!(
                "SAM encoder produced {} outputs, expected at least 2",
                enc_out.len()
            ));
        }
        let emb = enc_out[0].try_extract_array::<f32>().map_err(|e| e.to_string())?.to_owned();
        let pos = enc_out[1].try_extract_array::<f32>().map_err(|e| e.to_string())?.to_owned();
        (emb, pos)
    };

    // 2. A single positive point at the box centre, in the 1024 input space. The
    //    object the user framed sits there, and a point prompt segments THAT
    //    object — a box prompt instead makes SAM return the whole enclosing
    //    region (e.g. the card/panel the object sits on), filling the rectangle.
    let px = (bbox.x + bbox.w / 2.0) * scale;
    let py = (bbox.y + bbox.h / 2.0) * scale;
    let points = Array4::<f32>::from_shape_vec((1, 1, 1, 2), vec![px, py])
        .map_err(|e| e.to_string())?;
    let labels = Array3::<i64>::from_shape_vec((1, 1, 1), vec![1]).map_err(|e| e.to_string())?;

    // 3. Mask decoder: embeddings + prompt -> iou_scores [1,1,3] and pred_masks
    //    [1,1,3,256,256] (three low-res logit candidates).
    let dec_out = decoder
        .run(ort::inputs![
            "input_points" => Tensor::from_array(points).map_err(|e| e.to_string())?,
            "input_labels" => Tensor::from_array(labels).map_err(|e| e.to_string())?,
            "image_embeddings" => Tensor::from_array(image_embeddings).map_err(|e| e.to_string())?,
            "image_positional_embeddings" => Tensor::from_array(image_positional_embeddings).map_err(|e| e.to_string())?,
        ])
        .map_err(|e| e.to_string())?;

    let iou = dec_out[0].try_extract_array::<f32>().map_err(|e| e.to_string())?;
    let iou_scores: Vec<f32> = iou.iter().copied().collect();

    let masks = dec_out[1].try_extract_array::<f32>().map_err(|e| e.to_string())?;
    let mshape = masks.shape();
    if mshape.len() < 2 {
        return Err(format!("unexpected SAM mask shape: {mshape:?}"));
    }
    let mh = mshape[mshape.len() - 2];
    let mw = mshape[mshape.len() - 1];
    let mdata: Vec<f32> = masks.iter().copied().collect();
    let plane = (mh * mw).max(1);
    let count = iou_scores.len().min(mdata.len() / plane).max(1);

    // SAM returns several candidates at different granularities around the prompt
    // point. A point on a button's label segments the glyph (tiny, high IoU); the
    // user wants the object they framed. So drop the trivial near-full mask (the
    // whole crop / background) and pick the LARGEST remaining object by area —
    // not the highest IoU. Fall back to max IoU if every candidate fills the crop.
    let mut best = 0usize;
    let mut best_fg: i64 = -1;
    for k in 0..count {
        let low = &mdata[k * plane..k * plane + plane];
        let fg = low.iter().filter(|&&v| v > 0.0).count();
        if fg as f32 / plane as f32 >= 0.97 {
            continue; // near-full mask: the whole crop, not an object inside it
        }
        if (fg as i64) > best_fg {
            best_fg = fg as i64;
            best = k;
        }
    }
    if best_fg < 0 {
        // Every candidate (almost) fills the crop — fall back to the highest IoU.
        let mut best_iou = f32::MIN;
        for k in 0..count {
            let iou_k = iou_scores.get(k).copied().unwrap_or(f32::MIN);
            if iou_k > best_iou {
                best_iou = iou_k;
                best = k;
            }
        }
    }
    let low = &mdata[best * plane..best * plane + plane];

    // 4. Map each original-image pixel back to the low-res logit grid: the grid
    //    covers the 1024 padded input, so a pixel `p` lands at `p * scale * mw/1024`.
    //    Bilinear-sample, then threshold logit > 0 -> object. One pass folds the
    //    upsample, the letterbox crop, and the resize-to-original together.
    let fx = scale * (mw as f32 / size as f32);
    let fy = scale * (mh as f32 / size as f32);
    let mut mask = GrayImage::new(orig_w, orig_h);
    for oy in 0..orig_h {
        for ox in 0..orig_w {
            let v = sample_bilinear(low, mw, mh, ox as f32 * fx, oy as f32 * fy);
            mask.put_pixel(ox, oy, Luma([if v > 0.0 { 255 } else { 0 }]));
        }
    }
    encode_png(DynamicImage::ImageLuma8(mask))
}

/// Bilinear sample of a row-major `w`×`h` f32 grid at fractional `(fx, fy)`,
/// clamping to the grid edges.
fn sample_bilinear(grid: &[f32], w: usize, h: usize, fx: f32, fy: f32) -> f32 {
    if w == 0 || h == 0 {
        return 0.0;
    }
    let x = fx.clamp(0.0, (w - 1) as f32);
    let y = fy.clamp(0.0, (h - 1) as f32);
    let x0 = x.floor() as usize;
    let y0 = y.floor() as usize;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);
    let dx = x - x0 as f32;
    let dy = y - y0 as f32;
    let v00 = grid[y0 * w + x0];
    let v10 = grid[y0 * w + x1];
    let v01 = grid[y1 * w + x0];
    let v11 = grid[y1 * w + x1];
    let top = v00 + (v10 - v00) * dx;
    let bot = v01 + (v11 - v01) * dx;
    top + (bot - top) * dy
}

// --- Font detector (EfficientNet-B3) --------------------------------------

/// One predicted font and its softmax probability.
#[derive(Clone, Serialize)]
pub struct FontPrediction {
    pub name: String,
    pub confidence: f32,
}

#[tauri::command]
pub async fn run_font_detect(
    app: AppHandle,
    image_bytes: Vec<u8>,
) -> Result<Vec<FontPrediction>, String> {
    tauri::async_runtime::spawn_blocking(move || font_detect_blocking(&app, image_bytes))
        .await
        .map_err(|e| e.to_string())?
}

struct FontConfig {
    size: u32,
    classnames: Vec<String>,
}

/// Parses the font model's `model_config.yaml`. The file is a flat document with
/// a `classnames:` block list (3,473 unquoted names, some containing `[`/`]`/`,`)
/// and a trailing `size:` scalar — simple and fixed, so a line scanner is enough
/// and avoids pulling in a YAML dependency.
fn parse_font_config(text: &str) -> Result<FontConfig, String> {
    let mut size: Option<u32> = None;
    let mut classnames: Vec<String> = Vec::new();
    let mut in_classnames = false;
    for line in text.lines() {
        if in_classnames {
            if let Some(rest) = line.strip_prefix("- ") {
                classnames.push(rest.trim().to_string());
                continue;
            }
            in_classnames = false;
        }
        let trimmed = line.trim_start();
        if trimmed == "classnames:" {
            in_classnames = true;
        } else if let Some(rest) = trimmed.strip_prefix("size:") {
            size = rest.trim().parse::<u32>().ok();
        }
    }
    let size = size.filter(|&s| s > 0).ok_or("font config missing size")?;
    if classnames.is_empty() {
        return Err("font config has no classnames".to_string());
    }
    Ok(FontConfig { size, classnames })
}

fn load_font_session(app: &AppHandle) -> Result<Session, String> {
    let path = model_storage_dir(app, FONT_CLASSIFY_ID)?.join(FONT_CLASSIFY_MODEL_FILE);
    if !path.exists() {
        return Err("model \"font-classify\" is not installed".to_string());
    }
    Session::builder()
        .map_err(|e| e.to_string())?
        .commit_from_file(&path)
        .map_err(|e| e.to_string())
}

fn font_detect_blocking(app: &AppHandle, image_bytes: Vec<u8>) -> Result<Vec<FontPrediction>, String> {
    let dir = model_storage_dir(app, FONT_CLASSIFY_ID)?;
    let config_text = fs::read_to_string(dir.join(FONT_CLASSIFY_CONFIG_FILE))
        .map_err(|e| format!("failed to read font model config: {e}"))?;
    let config = parse_font_config(&config_text)?;
    let size = config.size;

    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let mut rgb = img.to_rgb8();
    // CutMax(1024): training crops to the top-left 1024 square if larger. Cuts are
    // usually small, so this is normally a no-op.
    let (w0, h0) = rgb.dimensions();
    if w0 > 1024 || h0 > 1024 {
        rgb = image::imageops::crop(&mut rgb, 0, 0, w0.min(1024), h0.min(1024)).to_image();
    }
    let (ow, oh) = rgb.dimensions();
    if ow == 0 || oh == 0 {
        return Err("empty image".to_string());
    }

    // ResizeWithPad: letterbox to size x size, centered, WHITE padding.
    let scale = (size as f32 / ow as f32).min(size as f32 / oh as f32);
    let nw = ((ow as f32 * scale).round() as u32).clamp(1, size);
    let nh = ((oh as f32 * scale).round() as u32).clamp(1, size);
    let pad_x = (size - nw) / 2;
    let pad_y = (size - nh) / 2;
    let resized = image::imageops::resize(&rgb, nw, nh, image::imageops::FilterType::Triangle);

    // Pre-fill with the normalized white pad, then overlay the resized cut.
    let mut input = Array4::<f32>::zeros((1, 3, size as usize, size as usize));
    let pad = FONT_CLASSIFY_PAD as f32 / 255.0;
    for c in 0..3 {
        let normalized_pad = (pad - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
        for y in 0..size as usize {
            for x in 0..size as usize {
                input[[0, c, y, x]] = normalized_pad;
            }
        }
    }
    fill_nchw_rgb(&mut input, &resized, pad_x, pad_y, NchwNorm::ImageNet);

    let mut session = load_font_session(app)?;
    let input_name = session.inputs()[0].name().to_string();
    let tensor = Tensor::from_array(input).map_err(|e| e.to_string())?;
    let outputs = session
        .run(ort::inputs![input_name.as_str() => tensor])
        .map_err(|e| e.to_string())?;

    // Output 0 is [1, num_classes] logits → softmax → top-K class names.
    let logits: Vec<f32> = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| e.to_string())?
        .iter()
        .copied()
        .collect();
    let n = logits.len().min(config.classnames.len());
    if n == 0 {
        return Err("font model produced no logits".to_string());
    }
    let max = logits[..n].iter().copied().fold(f32::MIN, f32::max);
    let exps: Vec<f32> = logits[..n].iter().map(|&v| (v - max).exp()).collect();
    let sum: f32 = exps.iter().sum();

    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| {
        logits[b]
            .partial_cmp(&logits[a])
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let predictions = order
        .into_iter()
        .take(FONT_CLASSIFY_TOP_K)
        .map(|i| FontPrediction {
            name: config.classnames[i].clone(),
            confidence: if sum > 0.0 { exps[i] / sum } else { 0.0 },
        })
        .collect();
    Ok(predictions)
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
    // Keyed by the two merge symbols joined with a NUL separator (`a\0b`). NUL
    // never appears in GPT-2 byte-encoded symbols, so it disambiguates the pair
    // while letting `bpe()` look up with a single reused `&str` buffer — no
    // per-pair tuple/String clones (RUST-7).
    merge_ranks: HashMap<String, usize>,
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
        let mut merge_ranks: HashMap<String, usize> = HashMap::new();
        if let Some(merges) = value
            .get("model")
            .and_then(|m| m.get("merges"))
            .and_then(|v| v.as_array())
        {
            for (rank, merge) in merges.iter().enumerate() {
                let key = match merge {
                    serde_json::Value::String(s) => {
                        let mut it = s.splitn(2, ' ');
                        match (it.next(), it.next()) {
                            (Some(a), Some(b)) => Some(format!("{a}\u{0}{b}")),
                            _ => None,
                        }
                    }
                    serde_json::Value::Array(parts) => {
                        match (parts.first().and_then(|v| v.as_str()), parts.get(1).and_then(|v| v.as_str())) {
                            (Some(a), Some(b)) => Some(format!("{a}\u{0}{b}")),
                            _ => None,
                        }
                    }
                    _ => None,
                };
                if let Some(key) = key {
                    merge_ranks.entry(key).or_insert(rank);
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
        // Reused across every pair lookup so the scan allocates nothing (RUST-7).
        let mut key = String::new();
        loop {
            let mut best_rank = usize::MAX;
            let mut best_index: Option<usize> = None;
            for i in 0..symbols.len() - 1 {
                key.clear();
                key.push_str(&symbols[i]);
                key.push('\u{0}');
                key.push_str(&symbols[i + 1]);
                if let Some(&rank) = self.merge_ranks.get(key.as_str()) {
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

/// Loads one ONNX session from a multi-file package directory (`dir/file`).
/// Shared by the Florence-2 and SAM packages, whose files live in a subfolder.
fn load_package_session(dir: &Path, file: &str) -> Result<Session, String> {
    Session::builder()
        .map_err(|e| e.to_string())?
        .commit_from_file(dir.join(file))
        .map_err(|e| e.to_string())
}

/// The four Florence-2 ONNX sessions, kept alive between calls.
struct Florence2Sessions {
    vision: Session,
    embed: Session,
    encoder: Session,
    decoder: Session,
}

/// RUST-8: cached ONNX sessions held in `tauri::State` so inference does not
/// re-parse/JIT hundreds of MB of immutable model graphs from disk on every call.
/// `Session::run` takes `&mut self`, so the cache needs interior mutability — the
/// group lives behind a `Mutex` (also serializing concurrent Florence-2 runs, which
/// must not share a session anyway). Invalidated on `model_uninstall`, where the
/// backing files are removed.
#[derive(Default)]
pub struct ModelSessions {
    florence2: Mutex<Option<Florence2Sessions>>,
    // The active SAM model's encoder + decoder. Only one segmentation model is
    // cached at a time (the user switches between SlimSAM and SAM ViT-B); the
    // tagged id lets a run detect a model change and reload.
    sam: Mutex<Option<SamSessions>>,
    // Model ids with an install currently in flight. Two concurrent installs of
    // the same id would stream interleaved bytes into the shared `.part` file and
    // the winning rename would publish a corrupt model, so installs of a given id
    // are made mutually exclusive (M11).
    installing: Mutex<HashSet<String>>,
}

/// RAII slot for an in-flight install: releasing the id on drop guarantees a
/// failed or panicking install can't leave the id permanently marked busy.
struct InstallGuard<'a> {
    sessions: &'a ModelSessions,
    id: String,
}

impl Drop for InstallGuard<'_> {
    fn drop(&mut self) {
        self.sessions
            .installing
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.id);
    }
}

impl ModelSessions {
    /// Claim an exclusive install slot for `id`, or `None` if one is already held.
    fn begin_install(&self, id: &str) -> Option<InstallGuard<'_>> {
        let mut guard = self.installing.lock().unwrap_or_else(|e| e.into_inner());
        if !guard.insert(id.to_string()) {
            return None;
        }
        Some(InstallGuard { sessions: self, id: id.to_string() })
    }

    /// Drop any cached sessions for `id` (after the model is uninstalled/replaced).
    fn invalidate(&self, id: &str) {
        if id == FLORENCE2_ID {
            *self.florence2.lock().unwrap_or_else(|e| e.into_inner()) = None;
        }
        if id == SLIMSAM_ID || id == SAM_VIT_B_ID {
            let mut guard = self.sam.lock().unwrap_or_else(|e| e.into_inner());
            if guard.as_ref().is_some_and(|s| s.model_id == id) {
                *guard = None;
            }
        }
    }
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
    // Reuse the install spec as the single source of truth for the file list so
    // adding/renaming a Florence-2 file can't silently desync install vs the
    // inference presence-check (RUST-10).
    for file in model_file_specs(FLORENCE2_ID)? {
        if !dir.join(file.name).exists() {
            return Err("model \"florence2\" is not installed".to_string());
        }
    }

    let tokenizer = SimpleTokenizer::from_file(&dir.join(FLORENCE2_TOKENIZER_FILE))?;

    // Pull the cached sessions (RUST-8), lazily loading them on the first call. The
    // guard is held for the whole pipeline — Florence-2 runs are inherently
    // sequential and a session cannot be shared across them anyway.
    let state = app.state::<ModelSessions>();
    let mut guard = state
        .florence2
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(Florence2Sessions {
            vision: load_package_session(&dir, FLORENCE2_VISION_FILE)?,
            embed: load_package_session(&dir, FLORENCE2_EMBED_FILE)?,
            encoder: load_package_session(&dir, FLORENCE2_ENCODER_FILE)?,
            decoder: load_package_session(&dir, FLORENCE2_DECODER_FILE)?,
        });
    }
    let Florence2Sessions { vision, embed, encoder, decoder } = guard.as_mut().unwrap();

    // 1. Pre-process the image: resize to 768x768, ImageNet-normalize, NCHW.
    let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
    let rgb = img.to_rgb8();
    let size = FLORENCE2_INPUT_SIZE;
    let resized =
        image::imageops::resize(&rgb, size, size, image::imageops::FilterType::Triangle);
    let mut pixels = Array4::<f32>::zeros((1, 3, size as usize, size as usize));
    fill_nchw_rgb(&mut pixels, &resized, 0, 0, NchwNorm::ImageNet);

    // 2. Vision encoder: image -> visual feature embeddings [1, Ni, D].
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
    let decoder_inputs: Vec<String> =
        decoder.inputs().iter().map(|o| o.name().to_string()).collect();

    let mut input_ids: Vec<i64> = vec![FLORENCE2_DECODER_START];
    let mut generated: Vec<i64> = Vec::new();
    for _ in 0..FLORENCE2_MAX_NEW_TOKENS {
        // The merged decoder consumes pre-embedded tokens (`inputs_embeds`), so
        // the growing decoder sequence is run through embed_tokens each step.
        let decoder_embeds = florence2_embed(embed, &embed_input, &input_ids)?;
        let next = florence2_decode_step(
            decoder,
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
    // Guard the subtraction: a zero-length sequence would underflow and panic (L4).
    let last = shape[1]
        .checked_sub(1)
        .ok_or_else(|| "decoder produced a zero-length sequence".to_string())?;
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
