import { invoke } from "@tauri-apps/api/core";
import type { ExportFile } from "@/lib/canvas/export/types";

// Thin wrappers over the Rust export-save commands. The backend opens a native
// "Save As…" dialog (rfd) and writes the bytes; it returns the written path, or
// null when the user cancels. Binary travels as a number[] (the same convention
// as the model runners — see lib/models/modelCommands.ts).

/** Save a single produced file. Returns the written path, or null if cancelled. */
export function saveExportFile(suggestedName: string, bytes: Uint8Array): Promise<string | null> {
  return invoke<string | null>("save_export_file", {
    suggestedName,
    data: Array.from(bytes),
  });
}

/** Save a batch as a single `.zip`. Returns the written path, or null if cancelled. */
export function saveExportArchive(suggestedName: string, files: ExportFile[]): Promise<string | null> {
  return invoke<string | null>("save_export_archive", {
    suggestedName,
    entries: files.map((file) => ({ name: file.name, data: Array.from(file.bytes) })),
  });
}
