import { invoke } from "@tauri-apps/api/core";

// Payload streamed during a download via the `model://progress` event. The
// per-file fields only matter for multi-file packages; single-file models
// always report `file_index: 0`.
export type ModelProgressEvent = {
  id: string;
  file_index: number;
  file_name: string;
  downloaded_bytes: number;
  total_bytes: number;
};

export const MODEL_PROGRESS_EVENT = "model://progress";

// A region proposed by Florence-2. Coordinates are normalized (0.0–1.0)
// relative to the image; the caller scales them to pixel space.
export type DetectedRegion = {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
};

export function modelIsInstalled(id: string): Promise<boolean> {
  return invoke<boolean>("model_is_installed", { id });
}

export function modelInstall(id: string): Promise<void> {
  return invoke("model_install", { id });
}

export function modelUninstall(id: string): Promise<void> {
  return invoke("model_uninstall", { id });
}

export async function runBirefnet(imageBytes: Uint8Array): Promise<Uint8Array> {
  const out = await invoke<number[]>("run_birefnet", { imageBytes: Array.from(imageBytes) });
  return new Uint8Array(out);
}

export async function runRealEsrgan(imageBytes: Uint8Array): Promise<Uint8Array> {
  const out = await invoke<number[]>("run_real_esrgan", { imageBytes: Array.from(imageBytes) });
  return new Uint8Array(out);
}

export function runFlorence2(imageBytes: Uint8Array): Promise<DetectedRegion[]> {
  return invoke<DetectedRegion[]>("run_florence2", { imageBytes: Array.from(imageBytes) });
}

// Runs the active text detector (a DBNet variant or CRAFT) on a cut's image.
// The backend dispatches on `modelId`. Returns true when text is detected.
export function runTextCheck(
  modelId: string,
  imageBytes: Uint8Array,
): Promise<boolean> {
  return invoke<boolean>("run_text_check", {
    modelId,
    imageBytes: Array.from(imageBytes),
  });
}

// Runs LaMa inpainting on a cut. `maskBytes` is a PNG grayscale mask where
// white marks the region to remove; returns the inpainted PNG at the cut's
// original resolution.
export async function runLama(
  imageBytes: Uint8Array,
  maskBytes: Uint8Array,
): Promise<Uint8Array> {
  const out = await invoke<number[]>("run_lama", {
    imageBytes: Array.from(imageBytes),
    maskBytes: Array.from(maskBytes),
  });
  return new Uint8Array(out);
}

// --- image <-> bytes helpers ----------------------------------------------

// Reads the raw bytes of any image URL (data:, blob:, object, or asset URL).
// More robust than decoding base64 by hand, which only works for data: URLs.
export async function urlToBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export function bytesToPngDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:image/png;base64,${btoa(binary)}`;
}
