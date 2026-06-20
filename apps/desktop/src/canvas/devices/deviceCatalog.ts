// The device catalog: the single list every device picker and mockup reads from.
//
// iOS and Android presets live in their own files; this module joins them, fixes
// the default, and exposes lookup + grouping helpers.

import { ANDROID_DEVICES } from "./androidDevices";
import { IOS_DEVICES } from "./iosDevices";
import type { DevicePlatform, DevicePreset } from "./deviceTypes";

export const DEVICE_PRESETS: DevicePreset[] = [...IOS_DEVICES, ...ANDROID_DEVICES];

/** Default device shown the first time a frame is enabled. */
export const DEFAULT_DEVICE_ID = "iphone-15";

export const PLATFORM_LABEL: Record<DevicePlatform, string> = {
  ios: "iPhone",
  android: "Android",
};

export const PLATFORM_ORDER: DevicePlatform[] = ["ios", "android"];

const DEVICE_BY_ID: Record<string, DevicePreset> = Object.fromEntries(
  DEVICE_PRESETS.map((device) => [device.id, device]),
);

/** Look up a preset by id, falling back to the default device. */
export function getDevicePreset(id: string | undefined | null): DevicePreset {
  if (id && DEVICE_BY_ID[id]) return DEVICE_BY_ID[id];
  return DEVICE_BY_ID[DEFAULT_DEVICE_ID] ?? DEVICE_PRESETS[0];
}

/** Presets grouped by platform, in display order. */
export function devicesByPlatform(): Array<{ platform: DevicePlatform; label: string; devices: DevicePreset[] }> {
  return PLATFORM_ORDER.map((platform) => ({
    platform,
    label: PLATFORM_LABEL[platform],
    devices: DEVICE_PRESETS.filter((device) => device.platform === platform),
  }));
}
