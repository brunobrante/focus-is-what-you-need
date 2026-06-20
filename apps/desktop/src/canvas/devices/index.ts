// Device viewport simulation — public surface.
//
// Wrap a screen's content in a realistic iPhone / Android body for previews.
// See deviceTypes.ts for the model and DeviceMockup.tsx for the renderer.

export { DeviceMockup } from "./DeviceMockup";
export {
  DEVICE_PRESETS,
  DEFAULT_DEVICE_ID,
  PLATFORM_LABEL,
  PLATFORM_ORDER,
  getDevicePreset,
  devicesByPlatform,
} from "./deviceCatalog";
export {
  deviceOuterSize,
  deviceResolutionLabel,
  evenBezel,
  type DevicePreset,
  type DevicePlatform,
  type DeviceBezel,
  type DeviceCutout,
  type DeviceCutoutKind,
  type DeviceSideButton,
} from "./deviceTypes";
export { IOS_DEVICES } from "./iosDevices";
export { ANDROID_DEVICES } from "./androidDevices";
