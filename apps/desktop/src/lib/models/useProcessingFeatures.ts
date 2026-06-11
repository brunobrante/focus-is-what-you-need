import { useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { setProcessingFeatureInstalled } from "@/lib/storage/repos/settings.repo";
import type { ProcessingFeatureKey } from "@/domain/settings/types";
import {
  MODEL_ID,
  MODEL_PROGRESS_EVENT,
  modelInstall,
  modelUninstall,
  type ModelProgressEvent,
} from "./modelCommands";

export type ProcessingFeatureControls = {
  installed: boolean;
  installing: boolean;
  /** Download progress in the [0, 1] range. */
  progress: number;
  /** Name of the file currently downloading, for multi-file packages. */
  currentFile: string;
  install: () => void;
  uninstall: () => void;
};

export type ProcessingFeatures = Record<ProcessingFeatureKey, ProcessingFeatureControls>;

const KEYS: ProcessingFeatureKey[] = ["birefnet", "realEsrgan", "florence2", "craft", "lama"];

type FlagMap = Record<ProcessingFeatureKey, boolean>;
type NumberMap = Record<ProcessingFeatureKey, number>;
type StringMap = Record<ProcessingFeatureKey, string>;

const NO_FLAGS: FlagMap = {
  birefnet: false,
  realEsrgan: false,
  florence2: false,
  craft: false,
  lama: false,
};
const NO_PROGRESS: NumberMap = {
  birefnet: 0,
  realEsrgan: 0,
  florence2: 0,
  craft: 0,
  lama: 0,
};
const NO_FILES: StringMap = {
  birefnet: "",
  realEsrgan: "",
  florence2: "",
  craft: "",
  lama: "",
};

// Florence-2's five files map onto one overall bar, weighted by their
// approximate sizes (vision ~230, embed ~130, encoder ~270, decoder ~600 MB;
// the tokenizer is negligible and only covers the tail).
const FLORENCE2_FILE_RANGES: Array<[number, number]> = [
  [0, 0.19],
  [0.19, 0.29],
  [0.29, 0.51],
  [0.51, 0.999],
  [0.999, 1],
];

function florence2Overall(fileIndex: number, fileRatio: number): number {
  const [lo, hi] = FLORENCE2_FILE_RANGES[fileIndex] ?? [0, 1];
  return lo + (hi - lo) * fileRatio;
}

/**
 * Reads the persisted `processingFeatures` settings and drives install /
 * uninstall of the underlying ONNX models. `install()` streams `model://progress`
 * events into `progress`, then flips the persisted `installed` flag on success.
 */
export function useProcessingFeatures(): ProcessingFeatures {
  const { settings } = useGlobalSettings();
  const persisted = settings.processingFeatures;
  const [installing, setInstalling] = useState<FlagMap>(NO_FLAGS);
  const [progress, setProgress] = useState<NumberMap>(NO_PROGRESS);
  const [currentFile, setCurrentFile] = useState<StringMap>(NO_FILES);

  const install = useCallback(async (key: ProcessingFeatureKey) => {
    const id = MODEL_ID[key];
    setInstalling((prev) => ({ ...prev, [key]: true }));
    setProgress((prev) => ({ ...prev, [key]: 0 }));
    setCurrentFile((prev) => ({ ...prev, [key]: "" }));

    const unlisten = await listen<ModelProgressEvent>(MODEL_PROGRESS_EVENT, (event) => {
      if (event.payload.id !== id) return;
      const { downloaded_bytes, total_bytes, file_index, file_name } = event.payload;
      const fileRatio = total_bytes > 0 ? downloaded_bytes / total_bytes : 0;
      // Multi-file packages fold per-file progress into one overall bar.
      const overall =
        key === "florence2" ? florence2Overall(file_index, fileRatio) : fileRatio;
      setProgress((prev) => ({ ...prev, [key]: Math.min(1, Math.max(0, overall)) }));
      if (file_name) setCurrentFile((prev) => ({ ...prev, [key]: file_name }));
    });

    try {
      await modelInstall(id);
      await setProcessingFeatureInstalled(key, true);
      setProgress((prev) => ({ ...prev, [key]: 1 }));
    } catch (error) {
      // A cancel (uninstall mid-download) lands here too — leave installed false.
      console.error(`Failed to install model "${id}"`, error);
    } finally {
      unlisten();
      setInstalling((prev) => ({ ...prev, [key]: false }));
      setCurrentFile((prev) => ({ ...prev, [key]: "" }));
    }
  }, []);

  const uninstall = useCallback(async (key: ProcessingFeatureKey) => {
    const id = MODEL_ID[key];
    try {
      await modelUninstall(id);
    } catch (error) {
      console.error(`Failed to uninstall model "${id}"`, error);
    }
    await setProcessingFeatureInstalled(key, false);
    // Doubles as a cancel: clears any in-flight progress UI for this feature.
    setInstalling((prev) => ({ ...prev, [key]: false }));
    setProgress((prev) => ({ ...prev, [key]: 0 }));
    setCurrentFile((prev) => ({ ...prev, [key]: "" }));
  }, []);

  return KEYS.reduce((acc, key) => {
    acc[key] = {
      installed: persisted[key].installed,
      installing: installing[key],
      progress: progress[key],
      currentFile: currentFile[key],
      install: () => void install(key),
      uninstall: () => void uninstall(key),
    };
    return acc;
  }, {} as ProcessingFeatures);
}
