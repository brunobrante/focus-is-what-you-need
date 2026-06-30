import { useCallback, useRef, useState, type RefObject } from "react";

import { runSamSegment, urlToBytes } from "@/lib/models/modelCommands";
import { CLASSIC_CV_MODEL_ID } from "@/lib/models/modelCatalog";
import type { CropBox } from "../types";
import { canvasToDataUrl, waitForImage } from "../engine/image";
import { segmentByContrast } from "../engine/classicSegment";
import { traceObjectContour, type Point } from "../engine/contour";

// A decoded SAM mask: one byte per pixel (white = object), sized to the crop
// region it was run on. Pixel (0,0) is the top-left of the selection rectangle.
export type SegmentationMask = {
  data: Uint8Array;
  width: number;
  height: number;
};

// The result of segmenting one crop: the object's outline as a closed polygon in
// subject-pixel coordinates (offset back onto the full subject), plus the crop-
// local mask and the subject box it was computed for — both kept for the
// silhouette cut on save.
export type CropSegmentation = {
  contour: Point[];
  mask: SegmentationMask;
  box: CropBox;
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
 * Runs object segmentation (SlimSAM / SAM ViT-B) for the "Adjust crop" action.
 * It works strictly inside the user's selection: the crop rectangle is
 * rasterized to its own image and SAM is prompted with (almost) that whole box,
 * so the silhouette never reaches outside the square. The returned contour is
 * offset back onto the full subject for the overlay. Stale runs are dropped — a
 * token guards against out-of-order completions.
 */
export function useCropSegmentation({
  imgRef,
}: {
  imgRef: RefObject<HTMLImageElement | null>;
}) {
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
      const img = imgRef.current;
      if (!img) {
        setSegmentError("Open a stack before adjusting the crop");
        return null;
      }
      const token = runToken.current + 1;
      runToken.current = token;
      setSegmenting(true);
      setSegmentError(null);
      try {
        await waitForImage(img).catch(() => {});

        // Rasterize just the selected rectangle at its subject resolution, so the
        // mask maps 1:1 back onto the subject with a plain (x, y) offset.
        const cw = Math.max(1, Math.round(subjectBox.w));
        const ch = Math.max(1, Math.round(subjectBox.h));
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, subjectBox.x, subjectBox.y, subjectBox.w, subjectBox.h, 0, 0, cw, ch);

        let mask: SegmentationMask;
        if (modelId === CLASSIC_CV_MODEL_ID) {
          // Built-in classic CV: contrast-from-background, runs in-app.
          const { data } = ctx.getImageData(0, 0, cw, ch);
          const m = segmentByContrast(data, cw, ch);
          if (!m) throw new Error("classic segmentation failed");
          mask = { data: m, width: cw, height: ch };
        } else {
          // SAM is prompted with a positive point at the crop's centre (the
          // object the user framed sits there); the backend ignores the box.
          const cropBytes = await urlToBytes(await canvasToDataUrl(canvas, "image/png"));
          const maskBytes = await runSamSegment(modelId, cropBytes, { x: 0, y: 0, w: cw, h: ch });
          mask = await decodeMask(maskBytes);
        }
        const local = traceObjectContour(mask.data, mask.width, mask.height);
        if (token !== runToken.current) return null; // superseded
        if (!local) {
          setSegmentError("No object found in the selection");
          setSegmentation(null);
          return null;
        }
        // Crop-local contour → subject coordinates.
        const contour = local.map((p) => ({ x: p.x + subjectBox.x, y: p.y + subjectBox.y }));
        const result: CropSegmentation = { contour, mask, box: subjectBox };
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
    [imgRef],
  );

  return { segmenting, segmentError, segmentation, segment, clearSegmentation };
}
