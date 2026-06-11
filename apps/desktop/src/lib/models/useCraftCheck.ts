import { useCallback, useRef, useState } from "react";
import { runTextCheck } from "./modelCommands";

export type CraftStatus = "idle" | "running" | "done" | "error";

export type CraftCheck = {
  status: CraftStatus;
  /** Detection result once `status === "done"`; null until then. */
  isText: boolean | null;
  /** Runs the active text detector on the given cut image bytes. */
  check: (imageBytes: Uint8Array) => void;
  /** Clears the result back to the idle state. */
  reset: () => void;
};

/**
 * Per-card text-detection state. One instance drives one cut card's "Is text?"
 * button, running whichever text detector (`modelId`) the user has selected:
 * `check()` runs the model and flips `isText` on completion, landing on
 * `"error"` if inference fails.
 */
export function useCraftCheck(modelId: string): CraftCheck {
  const [status, setStatus] = useState<CraftStatus>("idle");
  const [isText, setIsText] = useState<boolean | null>(null);
  // Guards against a stale resolve overwriting a newer run (e.g. "Check again").
  const runRef = useRef(0);

  const check = useCallback(
    (imageBytes: Uint8Array) => {
      const runId = runRef.current + 1;
      runRef.current = runId;
      setStatus("running");
      setIsText(null);
      runTextCheck(modelId, imageBytes)
        .then((result) => {
          if (runRef.current !== runId) return;
          setIsText(result);
          setStatus("done");
        })
        .catch((error) => {
          if (runRef.current !== runId) return;
          console.error("Text detection failed", error);
          setStatus("error");
        });
    },
    [modelId],
  );

  const reset = useCallback(() => {
    runRef.current += 1;
    setStatus("idle");
    setIsText(null);
  }, []);

  return { status, isText, check, reset };
}
