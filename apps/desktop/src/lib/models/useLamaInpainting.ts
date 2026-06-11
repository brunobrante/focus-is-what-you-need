import { useCallback, useEffect, useRef, useState } from "react";

export type LamaMaskStatus = "idle" | "masking";

export type LamaInpainting = {
  status: LamaMaskStatus;
  /** Overlay canvas the user paints the removal mask onto. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Enters mask-drawing mode and activates the brush on `canvasRef`. */
  startMasking: () => void;
  /** Discards the painted mask and returns to `"idle"`. */
  cancel: () => void;
  /**
   * Reads the painted region and returns a black/white mask PNG (white = remove)
   * sized to the canvas. Returns null when nothing was painted or there is no
   * canvas to read. Does not change `status` — the caller drives inference and
   * decides when to leave masking mode.
   */
  readMask: () => Promise<Uint8Array | null>;
};

// Brush radius in screen pixels. The on-canvas radius is scaled from this so the
// brush feels the same size regardless of how the canvas is displayed (zoom).
export const LAMA_BRUSH_RADIUS = 20;
// Visible paint colour while masking; the actual mask is derived from coverage,
// not this colour, so the preview can be any semi-transparent tint.
const LAMA_PAINT_STYLE = "rgba(248, 113, 113, 0.5)";

/**
 * Mask-drawing state for the LaMa "remove element" tool. It owns only the brush
 * interaction and mask extraction; the caller runs LaMa and stores the result.
 * The mask is a plain overlay `<canvas>`, independent of the main canvas editor.
 */
export function useLamaInpainting(): LamaInpainting {
  const [status, setStatus] = useState<LamaMaskStatus>("idle");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startMasking = useCallback(() => {
    setStatus("masking");
  }, []);

  const cancel = useCallback(() => {
    clearCanvas();
    setStatus("idle");
  }, [clearCanvas]);

  const readMask = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const { width, height } = canvas;
    const painted = ctx.getImageData(0, 0, width, height);
    // Derive a clean black/white mask from painted coverage (alpha), so the
    // visible preview colour never leaks into the mask the model receives.
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return null;
    const mask = maskCtx.createImageData(width, height);
    let anyPainted = false;
    for (let i = 0; i < painted.data.length; i += 4) {
      const value = painted.data[i + 3] > 10 ? 255 : 0;
      if (value === 255) anyPainted = true;
      mask.data[i] = value;
      mask.data[i + 1] = value;
      mask.data[i + 2] = value;
      mask.data[i + 3] = 255;
    }
    if (!anyPainted) return null;
    maskCtx.putImageData(mask, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      maskCanvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  }, []);

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
      event.stopPropagation();
      painting = true;
      canvas.setPointerCapture(event.pointerId);
      paint(event);
    };
    const onMove = (event: PointerEvent) => {
      if (painting) {
        event.stopPropagation();
        paint(event);
      }
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

  return { status, canvasRef, startMasking, cancel, readMask };
}
