import { resolveGlobalSettings } from "@/domain/settings/resolve";
import type {
  DeepPartial,
  GlobalSettings,
  ProcessingFeatureKey,
  SettingsRow,
} from "@/domain/settings/types";
import { SETTINGS_SCHEMA_VERSION } from "@/domain/settings/defaults";
import { now } from "@/lib/storage/ids";
import { TABLES, getRecordById, putRecord } from "@/lib/storage/store";

const KEY = TABLES.settings;
const GLOBAL_SETTINGS_ID = "global";

export async function getGlobalSettingsRow(): Promise<SettingsRow | null> {
  return getRecordById<SettingsRow>(KEY, GLOBAL_SETTINGS_ID);
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const row = await getGlobalSettingsRow();
  return resolveGlobalSettings(row?.overrides ?? null);
}

export function putGlobalSettings(settings: GlobalSettings): void {
  const t = now();
  const row: SettingsRow = {
    id: GLOBAL_SETTINGS_ID,
    scope: "global",
    projectId: null,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    overrides: settings as DeepPartial<GlobalSettings>,
    createdAt: t,
    updatedAt: t,
  };
  putRecord(KEY, row);
}

export async function updateGlobalSettings(
  updater: (settings: GlobalSettings) => GlobalSettings,
): Promise<GlobalSettings> {
  const current = await getGlobalSettings();
  const next = resolveGlobalSettings(updater(current));
  putGlobalSettings(next);
  return next;
}

/** Toggle whether new projects inherit the workspace design by default. */
export async function setShareWithProjectsByDefault(
  shareWithProjectsByDefault: boolean,
): Promise<GlobalSettings> {
  return updateGlobalSettings((settings) => ({
    ...settings,
    systemDesign: { ...settings.systemDesign, shareWithProjectsByDefault },
  }));
}

/** Toggle automatic regeneration of project card thumbnails. */
export async function setAutoGenerateProjectThumbnails(
  autoGenerate: boolean,
): Promise<GlobalSettings> {
  return updateGlobalSettings((settings) => ({
    ...settings,
    projectThumbnails: { ...settings.projectThumbnails, autoGenerate },
  }));
}

/** Record (or clear) a catalog model id as downloaded to disk. */
export async function setModelInstalled(
  modelId: string,
  installed: boolean,
): Promise<GlobalSettings> {
  return updateGlobalSettings((settings) => {
    const ids = new Set(settings.processing.installedModelIds);
    if (installed) ids.add(modelId);
    else ids.delete(modelId);
    return {
      ...settings,
      processing: { ...settings.processing, installedModelIds: [...ids] },
    };
  });
}

/** Enable or disable a processing feature (only meaningful once installed). */
export async function setFeatureEnabled(
  feature: ProcessingFeatureKey,
  enabled: boolean,
): Promise<GlobalSettings> {
  return updateFeature(feature, (f) => ({ ...f, enabled }));
}

/** Choose which installed model a feature runs. */
export async function setFeatureActiveModel(
  feature: ProcessingFeatureKey,
  activeModelId: string | null,
): Promise<GlobalSettings> {
  return updateFeature(feature, (f) => ({ ...f, activeModelId }));
}

function updateFeature(
  feature: ProcessingFeatureKey,
  updater: (
    f: GlobalSettings["processing"]["features"][ProcessingFeatureKey],
  ) => GlobalSettings["processing"]["features"][ProcessingFeatureKey],
): Promise<GlobalSettings> {
  return updateGlobalSettings((settings) => ({
    ...settings,
    processing: {
      ...settings.processing,
      features: {
        ...settings.processing.features,
        [feature]: updater(settings.processing.features[feature]),
      },
    },
  }));
}
