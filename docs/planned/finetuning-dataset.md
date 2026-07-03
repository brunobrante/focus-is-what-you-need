# Fine-tuning Dataset

## What it is

A way to capture, inside the Builder, the data needed to **fine-tune the
auto-detect models** (OmniParser v1/v2, UI-DETR, and any future detector). Every
auto-detect run already produces model predictions that the user then corrects
(move / resize / add / delete) in the review boxes. Today those corrections
evaporate on save. This feature turns each corrected run into a labeled training
sample and lets the user export a standard detection dataset.

The Builder's review-box UI is, in effect, already a labeling tool — this only
adds persistence and an export.

## Source of truth: the exported folder, not the DB

Training happens **outside** the app (ultralytics / rfdetr, GPU + Python). So the
durable artifact is the **exported dataset folder on disk** (YOLO/COCO). The
in-app table is only a **staging buffer** for labeling before export.

This split matters because of the repo's nuke-and-reseed rule: any
`SCHEMA_VERSION` bump wipes the DB. If the dataset lived only in the DB, a future
bump would delete collected labels. By treating the export as durable, a reseed
only loses un-exported staging. (It intentionally inverts the usual "DB is the
source of truth" stance — justified because the consumer is an external trainer.)

## Design decisions

1. **Normalized coordinates.** Boxes are stored in `[0, 1]` relative to the
   subject image, not pixels. Model- and resolution-independent, survives
   re-export. The `DetectedRegion` returned by `runAutoDetect` is *already*
   normalized (it's `useAutoDetect` that multiplies by `cw/ch`), so predictions
   can be stored raw; ground-truth boxes divide by `activeSubject.w/h`.
2. **Image as an asset, never duplicated in the row.** The image the model saw is
   `activeSubject.url` (a path or a transient data URL). Capture =
   `urlToBytes(url)` → `putAsset(bytes, { blobKey, mimeType, width, height })`
   (`src/application/persistence/assetStore.ts`); the row stores only the
   `blobKey`, mirroring `thumbnails.repo`. Optional dedupe via `contentHash`.
3. **Predictions + ground truth, both.** Keeping the raw model output alongside
   the accepted set lets the trainer derive false positives (predicted, deleted),
   missed objects (drawn, not predicted), and position corrections (moved) —
   without storing an explicit diff.
4. **`complete` flag.** A sample is only valid training data if *every* element in
   the image was labeled; partially-labeled images teach the model that real
   objects are background. The flag is set by an explicit user affirmation.

## Data model

One row per labeling session (one auto-detect run on one image). Arrays are
embedded in the row — boxes are small and always read together, so no separate
box table.

```ts
// src/lib/storage/schema.ts
export type DetectBox = {
  x: number; y: number; w: number; h: number; // normalized 0..1 to the image
  label: string;            // "" for class-agnostic detectors
  confidence?: number;      // predictions only
};

export type DetectSampleRow = {
  id: string;
  createdAt: number; updatedAt: number;
  // provenance — which model/config produced the predictions
  modelId: string; modelHash: string | null;
  runResolution: number | null; scoreThreshold: number | null;
  // image (asset store)
  imageBlobKey: string; imageWidth: number; imageHeight: number; imageMime: string;
  subjectKind: "original" | "stack" | "component"; subjectId: string;
  // data (normalized to the image)
  predictions: DetectBox[];  // raw model output at run time
  groundTruth: DetectBox[];  // final human-accepted boxes
  // labeling quality / dataset split
  complete: boolean;
  split: "train" | "val";
};
```

**Scope (open question):** whether samples are per-project (`projectId` on the
row) or global/workspace. Default proposal: global, since a UI-element detector
generalizes across projects — but a `projectId` field is cheap to add if
per-project curation is wanted.

## Storage plumbing (real files to touch)

| Layer   | File | Change |
|---------|------|--------|
| Table key | `src/lib/storage/storeKeys.ts` | add `detectSamples` to `TABLES` |
| Row type  | `src/lib/storage/schema.ts` | add `DetectSampleRow` / `DetectBox`; bump `SCHEMA_VERSION` |
| Seed      | `src/lib/storage/seed.ts` | `replaceTable(TABLES.detectSamples, [], silent)` so a reseed clears it |
| Repo      | `src/lib/storage/repos/detectSamples.repo.ts` | `putDetectSample` (`putRecord`), `listDetectSamples` (`listTable`), `removeDetectSample` |
| Capture   | `src/application/dataset/captureSample.ts` | subject → `putAsset` + build the row |
| Export    | `src/application/dataset/exportDataset.ts` + `src-tauri/src/dataset.rs` | read `complete` samples, write `images/` + `labels/*.txt` + `data.yaml` via a Tauri command |

## Capture points in the Builder

1. **On run** (`src/generate/hooks/useAutoDetect.ts`): stash the raw
   `DetectedRegion[]` in a ref (`runPredictionsRef`) — predictions must *not*
   follow the user's later edits to the review boxes.
2. **Explicit "Save to dataset" action** in the review toolbar (next to Cancel /
   Save all): snapshots image → asset, `groundTruth` = current review boxes
   (normalized), `predictions` = `runPredictionsRef`, plus a **"complete"**
   toggle. Deliberate, so runs aren't saved as noise.

## Export format

YOLO by default (simplest to feed to ultralytics and rfdetr):

```
dataset/
  images/{sampleId}.png
  labels/{sampleId}.txt     # one line per box: "<classId> <cx> <cy> <w> <h>"  (already normalized)
  data.yaml                 # names: [...], train/val splits
```

Class-agnostic detectors emit a single class `0` ("element"); when labels exist
(e.g. Florence-2 captions) distinct labels map to class indices listed in
`data.yaml`. Written to disk on an explicit user action, mirroring the `.figx`
export path (Tauri `invoke` → Rust writes the folder). COCO JSON can be a second
exporter later.

## Fine-tuning lifecycle (end to end)

1. **Collect** — run auto-detect across many screens, correct the boxes, "Save to
   dataset" (staging in the DB).
2. **Export** — write the YOLO folder to disk (the durable dataset).
3. **Train offline** — `yolo train` (OmniParser) / rfdetr train, starting from the
   current weights, on the exported dataset. GPU + Python.
4. **Convert** — export the fine-tuned weights to ONNX and drop them in the app's
   models folder (`scripts/convert_models.py` already does this last step).
5. **Compare** — auto-detect now has several selectable models, so the fine-tune
   can be A/B'd against the baseline on the same screen.

## What it does not do

- Does not auto-save every run — only the explicit "Save to dataset" action.
- Does not train in-app — training is an external, offline step.
- Does not duplicate image bytes into records — images live in the asset store,
  referenced by `blobKey`.
- Does not treat the DB as the durable dataset — the exported folder is.

## Suggested build order (incremental)

1. Table + schema + repo + capture-on-run (predictions only, no UI yet).
2. "Save to dataset" toolbar action + `complete` toggle (ground truth).
3. YOLO export (use case + Rust command).
4. A small dataset manager (list / delete / split / export) in Settings or the
   Builder.
