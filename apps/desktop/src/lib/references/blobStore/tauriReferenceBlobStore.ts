import { invoke } from "@tauri-apps/api/core";
import { mimeFromExt } from "../mediaTypes";
import { blobToBase64 } from "./codec";
import type {
  ExtractedFrame,
  ReferenceBlobStore,
  StackBatchFile,
  VideoFrameOptions,
} from "./types";

/**
 * Desktop adapter. Binaries are written to / read from the workspace folder on
 * disk through the Rust commands in `src-tauri/src/lib.rs`. This is a 1:1 move
 * of the `invoke()` calls that used to live in `referenceStorage.ts`.
 */
export function createTauriReferenceBlobStore(): ReferenceBlobStore {
  return {
    async writeOriginal(id, ext, blob) {
      const dataB64 = await blobToBase64(blob);
      await invoke("write_reference_file", { id, ext, dataB64 });
    },

    async readOriginal(id, ext) {
      try {
        // Command returns raw bytes (ArrayBuffer) — no base64, no main-thread atob().
        const buffer = await invoke<ArrayBuffer>("read_reference_file", { id, ext });
        return new Blob([buffer], { type: mimeFromExt(ext) });
      } catch {
        return null;
      }
    },

    async deleteOriginal(id) {
      await invoke("delete_reference_file", { id }).catch(() => {});
    },

    async writeStackFile(id, fileName, blob) {
      const dataB64 = await blobToBase64(blob);
      await invoke("write_reference_stack_file", { id, fileName, dataB64 });
    },

    async readStackFile(id, fileName, mimeType) {
      try {
        const buffer = await invoke<ArrayBuffer>("read_reference_stack_file", { id, fileName });
        return new Blob([buffer], { type: mimeType });
      } catch {
        return null;
      }
    },

    async writeStackBatch(id, files: StackBatchFile[], dataJson) {
      await invoke("write_reference_stack_batch", {
        id,
        files: files.map((file) => ({ file_name: file.fileName, data_b64: file.dataB64 })),
        dataJson,
      });
    },

    async writeStackData(id, dataJson) {
      await invoke("write_reference_stack_data", { id, content: dataJson });
    },

    async readStackData(id) {
      try {
        return await invoke<string>("read_reference_stack_data", { id });
      } catch {
        return null;
      }
    },

    async deleteStack(id) {
      await invoke("delete_reference_stack", { id }).catch(() => {});
    },

    async ffmpegAvailable() {
      try {
        return await invoke<boolean>("ffmpeg_available");
      } catch {
        return false;
      }
    },

    async extractVideoFrames(id, ext, options?: VideoFrameOptions) {
      return invoke<ExtractedFrame[]>("extract_video_frames", {
        id,
        ext,
        fps: options?.fps ?? 1.5,
        maxFrames: options?.maxFrames ?? 240,
        maxWidth: options?.maxWidth ?? 480,
      });
    },

    async extractVideoFrameFull(id, ext, timestampMs) {
      try {
        const buffer = await invoke<ArrayBuffer>("extract_video_frame_full", {
          id,
          ext,
          timestampMs,
        });
        return new Blob([buffer], { type: "image/png" });
      } catch {
        return null;
      }
    },

    async readFrame(id, fileName) {
      try {
        const buffer = await invoke<ArrayBuffer>("read_reference_frame", { id, fileName });
        return new Blob([buffer], { type: "image/jpeg" });
      } catch {
        return null;
      }
    },

    async deleteFrames(id) {
      await invoke("delete_reference_frames", { id }).catch(() => {});
    },
  };
}
