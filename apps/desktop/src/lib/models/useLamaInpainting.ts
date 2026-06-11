import { useCallback, useEffect, useRef, useState } from "react";
import { bytesToPngDataUrl, runLama, urlToBytes } from "./modelCommands";

export type LamaStatus = "idle" | "masking" | "running" | "done" | "error";

export type LamaInpainting = {
  status: LamaStatus;
  /** Inpainted result once `status === "done"`; null until then. */
  resultUrl: string | null;
  /** Overlay canvas the user paints the removal mask onto. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Enters mask-drawing mode and activates the brush on `canvasRef`. */
  startMasking: () => void;
  /** Reads the painted mask, runs LaMa, and lands on `"done"` / `"error"`. */
  confirmMask: () => void;
  /** Discards the mask and returns to `"idle"`. */
  cancel: () => void;
  /** Clears the result and returns to `"idle"`. */
  reset: () => void;
};

// Brush radius in screen pixels. The on-canvas radius is scaled from this so the
// brush feels the same size regardless of how the canvas is displayed.
export const LAMA_BRUSH_RADIUS = 20;
// Visible paint colour while masking; the actual mask is derived from coverage,
// not this colour, so the preview can be any semi-transparent tint.
const LAMA_PAINT_STYLE = "rgba(248, 113, 113, 0.5)";

/**
 * Per-cut LaMa "remove element" state. Drives one cut card's mask-drawing and
 * inference flow: paint over what to remove, confirm to run LaMa, and surface
 * the inpainted result. The mask is a plain overlay `<canvas>` — independent of
 * the main canvas editor.
 */
export function useLamaInpainting(imageUrl: string): LamaInpainting {
  const [status, setStatus] = useState<LamaStatus>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Guards against a stale resolve overwriting a newer run (e.g. cancel mid-run).
  const runRef = useRef(0);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startMasking = useCallback(() => {
    runRef.current += 1;
    setResultUrl(null);
    setStatus("masking");
  }, []);

  const cancel = useCallback(() => {
    runRef.current += 1;
    clearCanvas();
    setStatus("idle");
  }, [clearCanvas]);

  const reset = useCallback(() => {
    runRef.current += 1;
    clearCanvas();
    setResultUrl(null);
    setStatus("idle");
  }, [clearCanvas]);

  const confirmMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const runId = runRef.current + 1;
    runRef.current = runId;
    setStatus("running");

    // Derive a clean black/white mask from painted coverage (alpha), so the
    // visible preview colour never leaks into the mask the model receives.
    const { width, height } = canvas;
    const painted = ctx.getImageData(0, 0, width, height);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) {
      setStatus("error");
      return;
    }
    const mask = maskCtx.createImageData(width, height);
    for (let i = 0; i < painted.data.length; i += 4) {
      const value = painted.data[i + 3] > 10 ? 255 : 0;
      mask.data[i] = value;
      mask.data[i + 1] = value;
      mask.data[i + 2] = value;
      mask.data[i + 3] = 255;
    }
    maskCtx.putImageData(mask, 0, 0);

    maskCanvas.toBlob((blob) => {
      void (async () => {
        try {
          if (!blob) throw new Error("failed to read mask canvas");
          const maskBytes = new Uint8Array(await blob.arrayBuffer());
          const imageBytes = await urlToBytes(imageUrl);
          const output = await runLama(imageBytes, maskBytes);
          if (runRef.current !== runId) return;
          setResultUrl(bytesToPngDataUrl(output));
          setStatus("done");
        } catch (error) {
          if (runRef.current !== runId) return;
          console.error("LaMa inpainting failed", error);
          setStatus("error");
        }
      })();
    }, "image/png");
  }, [imageUrl]);

  // Brush: paint semi-transparent circles onto the overlay while masking.
  useEffect(() => {
    if (status !== "masking") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let painting = false;

    const paint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      ctx.fillStyle = LAMA_PAINT_STYLE;
      ctx.beginPath();
      ctx.arc(x, y, LAMA_BRUSH_RADIUS * scaleX, 0, Math.PI * 2);
      ctx.fill();
    };

    const onDown = (event: PointerEvent) => {
      painting = true;
      canvas.setPointerCapture(event.pointerId);
      paint(event);
    };
    const onMove = (event: PointerEvent) => {
      if (painting) paint(event);
    };
    const onUp = (event: PointerEvent) => {
      painting = false;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer may already be released; ignore.
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [status]);

  return { status, resultUrl, canvasRef, startMasking, confirmMask, cancel, reset };
}
