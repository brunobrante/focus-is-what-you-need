// Android device presets (Pixel + Galaxy families).
//
// Screen sizes are typical logical CSS-px viewports for each model. Android
// phones use a centered (Pixel) or near-centered (Galaxy) punch-hole camera and
// thin, near-even bezels.

import { evenBezel, type DevicePreset } from "./deviceTypes";

const PIXEL_FRAME_COLOR = "#202124";
const GALAXY_FRAME_COLOR = "#15151A";

export const ANDROID_DEVICES: DevicePreset[] = [
  {
    id: "pixel-8-pro",
    label: "Pixel 8 Pro",
    platform: "android",
    screen: { width: 412, height: 892 },
    bezel: evenBezel(14),
    screenRadius: 40,
    frameRadius: 54,
    frameColor: PIXEL_FRAME_COLOR,
    cutout: { kind: "punch-hole", height: 20, offsetTop: 13, align: 0.5 },
    homeIndicator: true,
    homeButton: false,
    buttons: [
      { side: "right", offset: 150, length: 64, kind: "power" },
      { side: "right", offset: 226, length: 96, kind: "volume" },
    ],
  },
  {
    id: "pixel-8",
    label: "Pixel 8",
    platform: "android",
    screen: { width: 412, height: 870 },
    bezel: evenBezel(15),
    screenRadius: 38,
    frameRadius: 53,
    frameColor: PIXEL_FRAME_COLOR,
    cutout: { kind: "punch-hole", height: 19, offsetTop: 13, align: 0.5 },
    homeIndicator: true,
    homeButton: false,
    buttons: [
      { side: "right", offset: 150, length: 60, kind: "power" },
      { side: "right", offset: 222, length: 92, kind: "volume" },
    ],
  },
  {
    id: "pixel-7",
    label: "Pixel 7",
    platform: "android",
    screen: { width: 412, height: 915 },
    bezel: evenBezel(15),
    screenRadius: 36,
    frameRadius: 51,
    frameColor: "#2B2A29",
    cutout: { kind: "punch-hole", height: 19, offsetTop: 13, align: 0.5 },
    homeIndicator: true,
    homeButton: false,
    buttons: [
      { side: "right", offset: 158, length: 60, kind: "power" },
      { side: "right", offset: 230, length: 92, kind: "volume" },
    ],
  },
  {
    id: "galaxy-s23-ultra",
    label: "Galaxy S23 Ultra",
    platform: "android",
    screen: { width: 384, height: 824 },
    bezel: evenBezel(11),
    screenRadius: 26,
    frameRadius: 38,
    frameColor: GALAXY_FRAME_COLOR,
    cutout: { kind: "punch-hole", height: 18, offsetTop: 12, align: 0.5 },
    homeIndicator: true,
    homeButton: false,
    buttons: [
      { side: "right", offset: 168, length: 58, kind: "power" },
      { side: "right", offset: 238, length: 90, kind: "volume" },
    ],
  },
  {
    id: "galaxy-s23",
    label: "Galaxy S23",
    platform: "android",
    screen: { width: 360, height: 780 },
    bezel: evenBezel(11),
    screenRadius: 28,
    frameRadius: 40,
    frameColor: GALAXY_FRAME_COLOR,
    cutout: { kind: "punch-hole", height: 17, offsetTop: 12, align: 0.5 },
    homeIndicator: true,
    homeButton: false,
    buttons: [
      { side: "right", offset: 158, length: 54, kind: "power" },
      { side: "right", offset: 224, length: 86, kind: "volume" },
    ],
  },
  {
    id: "android-compact",
    label: "Android (compact)",
    platform: "android",
    screen: { width: 360, height: 800 },
    bezel: evenBezel(14),
    screenRadius: 30,
    frameRadius: 44,
    frameColor: "#1A1A1D",
    cutout: { kind: "punch-hole", height: 18, offsetTop: 13, align: 0.5 },
    homeIndicator: true,
    homeButton: false,
    buttons: [
      { side: "right", offset: 150, length: 56, kind: "power" },
      { side: "right", offset: 220, length: 88, kind: "volume" },
    ],
  },
];
