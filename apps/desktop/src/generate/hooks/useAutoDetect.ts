import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorTool, PendingDetectionBox } from "../types";
import { AUTO_DETECT_BOX_COLORS } from "../types";
import { runAutoDetect, urlToBytes } from "@/lib/models/modelCommands";
import { randomSuffix } from "@/lib/storage/ids";
import { clamp } from "../engine/geometry";

export function useAutoDetect({
  canCrop,
  activeSubjectUrl,
  imgRef,
  setPendingDetections,
  pushDetectionHistory,
  setCurrentTool,
}: {
  canCrop: boolean;
  activeSubjectUrl: string;
  imgRef: React.RefObject<HTMLImageElement | null>;
  setPendingDetections: React.Dispatch<React.SetStateAction<PendingDetectionBox[]>>;
  pushDetectionHistory: () => void;
  setCurrentTool: React.Dispatch<React.SetStateAction<EditorTool>>;
}) {
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetectMessage, setAutoDetectMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  const flashMessage = useCallback((message: string) => {
    setAutoDetectMessage(message);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setAutoDetectMessage(null);
    }, 4000);
  }, []);

  const autoDetect = useCallback(
    async (modelId: string | null) => {
      if (autoDetecting || !canCrop) return;
      if (!modelId) {
        flashMessage("Install an auto-detect model in Settings first");
        return;
      }
      const img = imgRef.current;
      const cw = img?.clientWidth ?? 0;
      const ch = img?.clientHeight ?? 0;
      if (!cw || !ch) {
        flashMessage("Open a stack before auto-detecting");
        return;
      }
      setAutoDetecting(true);
      setAutoDetectMessage(null);
      try {
        const bytes = await urlToBytes(activeSubjectUrl);
        const regions = await runAutoDetect(modelId, bytes);
        if (regions.length === 0) {
          flashMessage("No components detected — try drawing regions manually");
          return;
        }
        // Same label => same color, cycling through the palette per unique label,
        // so the review boxes visually group repeated detections.
        const colorByLabel = new Map<string, string>();
        const boxes: PendingDetectionBox[] = regions.map((region, index) => {
          const x = clamp(region.x * cw, 0, cw);
          const y = clamp(region.y * ch, 0, ch);
          const label = region.label?.trim() || `region-${index + 1}`;
          if (!colorByLabel.has(label)) {
            colorByLabel.set(
              label,
              AUTO_DETECT_BOX_COLORS[colorByLabel.size % AUTO_DETECT_BOX_COLORS.length],
            );
          }
          return {
            id: `d-${randomSuffix()}`,
            box: {
              x,
              y,
              w: clamp(region.w * cw, 1, cw - x),
              h: clamp(region.h * ch, 1, ch - y),
            },
            label,
            color: colorByLabel.get(label) as string,
          };
        });
        // Snapshot the prior review boxes so Cmd/Ctrl+Z can undo this run.
        pushDetectionHistory();
        setPendingDetections(boxes);
        setCurrentTool("crop");
      } catch (error) {
        console.error("[tools] auto-detect failed", error);
        flashMessage("Auto-detect failed — see console for details");
      } finally {
        setAutoDetecting(false);
      }
    },
    [autoDetecting, canCrop, activeSubjectUrl, flashMessage, imgRef, pushDetectionHistory, setCurrentTool, setPendingDetections],
  );

  return { autoDetecting, autoDetectMessage, autoDetect };
}
