import { resolveGlobalSettings } from "@/domain/settings/resolve";
import type {
  DeepPartial,
  GlobalSettings,
  SettingsRow,
  TextDetectionModelId,
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

/** Choose which text detector (DBNet or CRAFT) the Builder runs. */
export async function setTextDetectionModel(
  textDetectionModel: TextDetectionModelId,
): Promise<GlobalSettings> {
  return updateGlobalSettings((settings) => ({
    ...settings,
    textDetectionModel,
  }));
}

/** Flip the installed flag for a processing feature after install/uninstall. */
export async function setProcessingFeatureInstalled(
  feature: keyof GlobalSettings["processingFeatures"],
  installed: boolean,
): Promise<GlobalSettings> {
  return updateGlobalSettings((settings) => ({
    ...settings,
    processingFeatures: {
      ...settings.processingFeatures,
      [feature]: { ...settings.processingFeatures[feature], installed },
    },
  }));
}
