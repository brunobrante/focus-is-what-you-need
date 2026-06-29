import { useCallback, useRef, useState } from "react";

import { runSamSegment, urlToBytes } from "@/lib/models/modelCommands";
import type { ActiveSubject, CropBox } from "../types";
import { traceObjectContour, type Point } from "../engine/contour";

// A decoded SAM mask: one byte per pixel (white = object) at the subject image's
// resolution, i.e. in subject-pixel space — the same space as `selectionCrop`.
export type SegmentationMask = {
  data: Uint8Array;
  width: number;
  height: number;
};

// The result of segmenting one crop: the object's outline as a closed polygon in
// subject-pixel coordinates, plus the mask it was traced from (kept for the
// silhouette cut on save).
export type CropSegmentation = {
  contour: Point[];
  mask: SegmentationMask;
};

// Decodes a PNG mask (as returned by `run_sam_segment`) into a single-channel
// grayscale buffer via an offscreen canvas. The R channel carries the mask.
async function decodeMask(bytes: Uint8Array): Promise<SegmentationMask> {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("mask decode failed"));
      img.src = url;
    });
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i += 1) gray[i] = data[i * 4];
    return { data: gray, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Runs object segmentation (SlimSAM / SAM ViT-B) for the "Adjust crop" action:
 * given the crop rectangle in subject coordinates, it prompts SAM with that box,
 * decodes the returned mask, and traces the object's silhouette into a polygon
 * the overlay can preview. Stale runs are dropped — only the latest `segment`
 * call updates state (a token guards against out-of-order completions).
 */
export function useCropSegmentation({ activeSubject }: { activeSubject: ActiveSubject }) {
  const [segmenting, setSegmenting] = useState(false);
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [segmentation, setSegmentation] = useState<CropSegmentation | null>(null);
  const runToken = useRef(0);

  const clearSegmentation = useCallback(() => {
    runToken.current += 1; // invalidate any in-flight run
    setSegmentation(null);
    setSegmentError(null);
    setSegmenting(false);
  }, []);

  const segment = useCallback(
    async (modelId: string | null, subjectBox: CropBox): Promise<CropSegmentation | null> => {
      if (!modelId) {
        setSegmentError("Install a segmentation model in Settings first");
        return null;
      }
      const token = runToken.current + 1;
      runToken.current = token;
      setSegmenting(true);
      setSegmentError(null);
      try {
        const bytes = await urlToBytes(activeSubject.url);
        const maskBytes = await runSamSegment(modelId, bytes, {
          x: subjectBox.x,
          y: subjectBox.y,
          w: subjectBox.w,
          h: subjectBox.h,
        });
        const mask = await decodeMask(maskBytes);
        const contour = traceObjectContour(mask.data, mask.width, mask.height);
        if (token !== runToken.current) return null; // superseded
        if (!contour) {
          setSegmentError("No object found in the selection");
          setSegmentation(null);
          return null;
        }
        const result: CropSegmentation = { contour, mask };
        setSegmentation(result);
        return result;
      } catch (error) {
        if (token === runToken.current) {
          console.error("[tools] crop segmentation failed", error);
          setSegmentError("Adjust crop failed — see console for details");
        }
        return null;
      } finally {
        if (token === runToken.current) setSegmenting(false);
      }
    },
    [activeSubject.url],
  );

  return { segmenting, segmentError, segmentation, segment, clearSegmentation };
}
