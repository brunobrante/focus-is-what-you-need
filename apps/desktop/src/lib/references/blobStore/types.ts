// Binary storage port for the References / Builder features.
//
// Reference catalog *metadata* already flows through the structured persistence
// port (SQLite on desktop, IndexedDB on web). The binary payloads — original
// media, stack crop PNGs, the stack `data.json`, and extracted video frames —
// used to bypass that abstraction with direct `invoke()` calls, which only work
// inside Tauri. This port mirrors the persistence-port pattern so the same
// binaries can live on disk (desktop) or in IndexedDB (browser).

export type StackBatchFile = { fileName: string; dataB64: string };

export type ExtractedFrame = {
  file: string;
  index: number;
  timestamp_ms: number;
  w: number;
  h: number;
};

export type VideoFrameOptions = {
  fps?: number;
  maxFrames?: number;
  maxWidth?: number;
};

export interface ReferenceBlobStore {
  /* ---------- Original media (image / video / figx) ---------- */
  writeOriginal(id: string, ext: string, blob: Blob): Promise<void>;
  readOriginal(id: string, ext: string): Promise<Blob | null>;
  /** Removes the entire reference (original + stack + frames), matching the
   *  desktop semantics of deleting the `references/{id}` directory. */
  deleteOriginal(id: string): Promise<void>;

  /* ---------- Stack crops + metadata ---------- */
  writeStackFile(id: string, fileName: string, blob: Blob): Promise<void>;
  readStackFile(id: string, fileName: string, mimeType: string): Promise<Blob | null>;
  writeStackBatch(id: string, files: StackBatchFile[], dataJson: string): Promise<void>;
  writeStackData(id: string, dataJson: string): Promise<void>;
  readStackData(id: string): Promise<string | null>;
  deleteStack(id: string): Promise<void>;

  /* ---------- Video frames (ffmpeg) ----------
   * Desktop-only. The web/memory adapters degrade gracefully: ffmpeg is
   * reported unavailable and frame reads return null, so video references
   * simply skip frame extraction in the browser. */
  ffmpegAvailable(): Promise<boolean>;
  extractVideoFrames(id: string, ext: string, options?: VideoFrameOptions): Promise<ExtractedFrame[]>;
  extractVideoFrameFull(id: string, ext: string, timestampMs: number): Promise<Blob | null>;
  readFrame(id: string, fileName: string): Promise<Blob | null>;
  deleteFrames(id: string): Promise<void>;
}
