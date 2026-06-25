import type { ExportBackground } from "./types";

// Raster export without `foreignObject`: the element is authored as a real SVG
// (vector primitives, never serialized HTML), loaded into an <img>, and drawn
// onto a 2D canvas sized to the node's true size × scale. The browser
// re-rasterizes the SVG at that resolution — a clean supersample (crisp vectors
// and text), so all scales honour Law 4 (snapshot at true intrinsic size).
//
// This is the webview-complete path. A native WKWebView.takeSnapshot pipeline
// would capture full HTML/CSS fidelity (backdrop-filter, complex gradients) and
// is the documented follow-up; here fidelity matches the SVG render model.

const QUALITY = 0.92;

async function loadSvgImage(svg: string): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return { image, revoke: () => URL.revokeObjectURL(url) };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Failed to encode ${mime}`))),
      mime,
      quality,
    );
  });
}

/**
 * Rasterize an SVG string to encoded image bytes.
 * - `transparent` keeps alpha (PNG/WebP). JPEG has no alpha, so it is always
 *   flattened over the background color (default white).
 * - `color` / `flatten` composite over the chosen color before drawing.
 */
export async function rasterFromSvg(input: {
  svg: string;
  width: number;
  height: number;
  scale: number;
  mime: string;
  background: ExportBackground;
}): Promise<Uint8Array> {
  const targetWidth = Math.max(1, Math.round(input.width * input.scale));
  const targetHeight = Math.max(1, Math.round(input.height * input.scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const isJpeg = input.mime === "image/jpeg";
  const opaque = isJpeg || input.background.mode === "color" || input.background.mode === "flatten";
  if (opaque) {
    ctx.fillStyle = input.background.color || "#FFFFFF";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  const { image, revoke } = await loadSvgImage(input.svg);
  try {
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  } finally {
    revoke();
  }

  const blob = await canvasToBlob(canvas, input.mime, QUALITY);
  return new Uint8Array(await blob.arrayBuffer());
}
