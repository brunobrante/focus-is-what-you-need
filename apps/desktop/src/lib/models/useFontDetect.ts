import { useCallback, useRef, useState } from "react";
import { runFontDetect, type FontPrediction } from "./modelCommands";

export type FontDetectStatus = "idle" | "running" | "done" | "error";

export type FontDetect = {
  status: FontDetectStatus;
  /** Top font-family guesses once `status === "done"`, most confident first. */
  predictions: FontPrediction[] | null;
  /** Runs the font detector on the given cut image bytes. */
  detect: (imageBytes: Uint8Array) => void;
  /** Clears the result back to the idle state. */
  reset: () => void;
};

/**
 * Per-card font-recognition state. One instance drives one cut card's "Font"
 * button: `detect()` runs the EfficientNet-B3 font classifier and fills
 * `predictions` (top guesses) on completion, landing on `"error"` if inference
 * fails. There is a single font model, so no model id is needed.
 */
export function useFontDetect(): FontDetect {
  const [status, setStatus] = useState<FontDetectStatus>("idle");
  const [predictions, setPredictions] = useState<FontPrediction[] | null>(null);
  // Guards against a stale resolve overwriting a newer run (e.g. "Detect again").
  const runRef = useRef(0);

  const detect = useCallback((imageBytes: Uint8Array) => {
    const runId = runRef.current + 1;
    runRef.current = runId;
    setStatus("running");
    setPredictions(null);
    runFontDetect(imageBytes)
      .then((result) => {
        if (runRef.current !== runId) return;
        setPredictions(result);
        setStatus("done");
      })
      .catch((error) => {
        if (runRef.current !== runId) return;
        console.error("Font detection failed", error);
        setStatus("error");
      });
  }, []);

  const reset = useCallback(() => {
    runRef.current += 1;
    setStatus("idle");
    setPredictions(null);
  }, []);

  return { status, predictions, detect, reset };
}
