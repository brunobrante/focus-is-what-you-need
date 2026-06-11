import { useCallback, useRef, useState } from "react";
import { runFlorence2TextCheck } from "./modelCommands";

export type CraftStatus = "idle" | "running" | "done" | "error";

export type CraftCheck = {
  status: CraftStatus;
  /** Detection result once `status === "done"`; null until then. */
  isText: boolean | null;
  /** Runs CRAFT on the given cut image bytes and records the result. */
  check: (imageBytes: Uint8Array) => void;
  /** Clears the result back to the idle state. */
  reset: () => void;
};

/**
 * Per-card CRAFT text-detection state. One instance drives one cut card's
 * "Is text?" button: `check()` runs the model and flips `isText` on completion,
 * landing on `"error"` if inference fails.
 */
export function useCraftCheck(): CraftCheck {
  const [status, setStatus] = useState<CraftStatus>("idle");
  const [isText, setIsText] = useState<boolean | null>(null);
  // Guards against a stale resolve overwriting a newer run (e.g. "Check again").
  const runRef = useRef(0);

  const check = useCallback((imageBytes: Uint8Array) => {
    const runId = runRef.current + 1;
    runRef.current = runId;
    setStatus("running");
    setIsText(null);
    runFlorence2TextCheck(imageBytes)
      .then((result) => {
        if (runRef.current !== runId) return;
        setIsText(result);
        setStatus("done");
      })
      .catch((error) => {
        if (runRef.current !== runId) return;
        console.error("CRAFT text detection failed", error);
        setStatus("error");
      });
  }, []);

  const reset = useCallback(() => {
    runRef.current += 1;
    setStatus("idle");
    setIsText(null);
  }, []);

  return { status, isText, check, reset };
}
