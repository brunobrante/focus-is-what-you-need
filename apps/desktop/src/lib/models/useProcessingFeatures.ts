import { useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import {
  setFeatureActiveModel,
  setFeatureEnabled,
  setModelInstalled,
} from "@/lib/storage/repos/settings.repo";
import type { ProcessingFeatureKey } from "@/domain/settings/types";
import {
  FEATURE_KEYS,
  FEATURES,
  MODEL_CATALOG,
  catalogEntry,
  modelsForFeature,
  type ModelCatalogEntry,
} from "./modelCatalog";
import {
  MODEL_PROGRESS_EVENT,
  modelInstall,
  modelUninstall,
  type ModelProgressEvent,
} from "./modelCommands";

// One downloadable model's live state plus its actions.
export type ModelControls = ModelCatalogEntry & {
  installed: boolean;
  installing: boolean;
  /** Download progress in the [0, 1] range. */
  progress: number;
  /** Name of the file currently downloading, for multi-file packages. */
  currentFile: string;
  /** Whether this model is the active one for its feature. */
  active: boolean;
  /** Start downloading the model. */
  install: () => void;
  /** Remove the model (also cancels an in-flight download). */
  uninstall: () => void;
  /** Make this model the active one for its feature. */
  setActive: () => void;
};

// One feature's resolved state plus its enable toggle.
export type FeatureControls = {
  key: ProcessingFeatureKey;
  enabled: boolean;
  /** Catalog models for this feature that are installed. */
  installedModels: ModelCatalogEntry[];
  /** Active model id (the stored one if installed, else the first installed). */
  activeModelId: string | null;
  /** A feature can only be enabled once it has an installed model. */
  canEnable: boolean;
  /** The feature is enabled and has an installed model to run. */
  operational: boolean;
  setEnabled: (enabled: boolean) => void;
};

export type ProcessingState = {
  features: Record<ProcessingFeatureKey, FeatureControls>;
  models: Record<string, ModelControls>;
};

type ModelMap<T> = Record<string, T>;

function modelMap<T>(value: T): ModelMap<T> {
  return MODEL_CATALOG.reduce((acc, m) => {
    acc[m.modelId] = value;
    return acc;
  }, {} as ModelMap<T>);
}

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

/** The stored active model if it is installed, else the first installed model. */
function resolveActiveModelId(
  installedModels: ModelCatalogEntry[],
  storedActive: string | null,
): string | null {
  if (storedActive && installedModels.some((m) => m.modelId === storedActive)) {
    return storedActive;
  }
  return installedModels[0]?.modelId ?? null;
}

/**
 * Drives the on-device processing models: per-model install/uninstall with live
 * progress, and per-feature enable + active-model state. Installed flags and
 * feature config are persisted via the settings repo; download progress is
 * session-local.
 */
export function useProcessingFeatures(): ProcessingState {
  const { settings } = useGlobalSettings();
  const persisted = settings.processing;
  const installedSet = new Set(persisted.installedModelIds);
  const [installing, setInstalling] = useState<ModelMap<boolean>>(() => modelMap(false));
  const [progress, setProgress] = useState<ModelMap<number>>(() => modelMap(0));
  const [currentFile, setCurrentFile] = useState<ModelMap<string>>(() => modelMap(""));

  const install = useCallback(async (modelId: string) => {
    const entry = catalogEntry(modelId);
    if (!entry) return;
    setInstalling((prev) => ({ ...prev, [modelId]: true }));
    setProgress((prev) => ({ ...prev, [modelId]: 0 }));
    setCurrentFile((prev) => ({ ...prev, [modelId]: "" }));

    const unlisten = await listen<ModelProgressEvent>(MODEL_PROGRESS_EVENT, (event) => {
      if (event.payload.id !== modelId) return;
      const { downloaded_bytes, total_bytes, file_index, file_name } = event.payload;
      const fileRatio = total_bytes > 0 ? downloaded_bytes / total_bytes : 0;
      // Multi-file packages fold per-file progress into one overall bar.
      const overall = entry.files ? florence2Overall(file_index, fileRatio) : fileRatio;
      setProgress((prev) => ({ ...prev, [modelId]: Math.min(1, Math.max(0, overall)) }));
      if (file_name) setCurrentFile((prev) => ({ ...prev, [modelId]: file_name }));
    });

    try {
      await modelInstall(modelId);
      await setModelInstalled(modelId, true);
      // First model installed for a feature becomes its active one, so the
      // feature is usable as soon as the switch is flipped on.
      const featureActive = settings.processing.features[entry.feature].activeModelId;
      if (!featureActive) await setFeatureActiveModel(entry.feature, modelId);
      setProgress((prev) => ({ ...prev, [modelId]: 1 }));
    } catch (error) {
      // A cancel (uninstall mid-download) lands here too — leave it not installed.
      console.error(`Failed to install model "${modelId}"`, error);
    } finally {
      unlisten();
      setInstalling((prev) => ({ ...prev, [modelId]: false }));
      setCurrentFile((prev) => ({ ...prev, [modelId]: "" }));
    }
  }, [settings]);

  const uninstall = useCallback(async (modelId: string) => {
    const entry = catalogEntry(modelId);
    try {
      await modelUninstall(modelId);
    } catch (error) {
      console.error(`Failed to uninstall model "${modelId}"`, error);
    }
    await setModelInstalled(modelId, false);
    if (entry) {
      const feature = settings.processing.features[entry.feature];
      const remaining = modelsForFeature(entry.feature).filter(
        (m) => m.modelId !== modelId && installedSet.has(m.modelId),
      );
      // If the active model was removed, fall back to a remaining one (or none).
      if (feature.activeModelId === modelId) {
        await setFeatureActiveModel(entry.feature, remaining[0]?.modelId ?? null);
      }
      // Disabling the last model also disables the feature.
      if (remaining.length === 0 && feature.enabled) {
        await setFeatureEnabled(entry.feature, false);
      }
    }
    // Doubles as a cancel: clears any in-flight progress UI for this model.
    setInstalling((prev) => ({ ...prev, [modelId]: false }));
    setProgress((prev) => ({ ...prev, [modelId]: 0 }));
    setCurrentFile((prev) => ({ ...prev, [modelId]: "" }));
  }, [settings, installedSet]);

  const features = FEATURE_KEYS.reduce((acc, key) => {
    const meta = FEATURES.find((f) => f.key === key);
    const installedModels = modelsForFeature(key).filter((m) => installedSet.has(m.modelId));
    const activeModelId = resolveActiveModelId(
      installedModels,
      persisted.features[key].activeModelId,
    );
    const canEnable = meta?.modelFree ? true : installedModels.length > 0;
    const enabled = persisted.features[key].enabled && canEnable;
    acc[key] = {
      key,
      enabled,
      installedModels,
      activeModelId,
      canEnable,
      operational: enabled && (meta?.modelFree ? true : activeModelId !== null),
      setEnabled: (next: boolean) => {
        if (next && !canEnable) return;
        void setFeatureEnabled(key, next);
      },
    };
    return acc;
  }, {} as Record<ProcessingFeatureKey, FeatureControls>);

  const models = MODEL_CATALOG.reduce((acc, entry) => {
    const active = features[entry.feature].activeModelId === entry.modelId;
    acc[entry.modelId] = {
      ...entry,
      installed: installedSet.has(entry.modelId),
      installing: installing[entry.modelId],
      progress: progress[entry.modelId],
      currentFile: currentFile[entry.modelId],
      active,
      install: () => void install(entry.modelId),
      uninstall: () => void uninstall(entry.modelId),
      setActive: () => void setFeatureActiveModel(entry.feature, entry.modelId),
    };
    return acc;
  }, {} as Record<string, ModelControls>);

  return { features, models };
}
