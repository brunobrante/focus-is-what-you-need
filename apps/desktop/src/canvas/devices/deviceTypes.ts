// Device viewport simulation — shared types.
//
// A DevicePreset describes the physical chrome of a phone (bezel, corner radius,
// camera cutout, side buttons) so the preview can wrap a screen's content in a
// realistic mockup. All chrome metrics are authored in the device's *reference*
// screen-pixel space (relative to `screen.width`/`screen.height`); the renderer
// scales them by `renderedScreenWidth / screen.width`, so a mockup stays correct
// whether it wraps content shown at intrinsic size or scaled down to fit.

export type DevicePlatform = "ios" | "android";

/** The camera / sensor cutout style at the top of the screen. */
export type DeviceCutoutKind = "none" | "notch" | "dynamic-island" | "punch-hole";

export type DeviceCutout = {
  kind: DeviceCutoutKind;
  /** Cutout width in reference screen-px (ignored for "none"). */
  width?: number;
  /** Cutout height in reference screen-px. For "punch-hole" this is its diameter. */
  height?: number;
  /** Distance from the top edge of the screen, in reference screen-px. 0 = attached. */
  offsetTop?: number;
  /**
   * Horizontal placement of the cutout, 0..1 across the screen width.
   * 0.5 = centered (default). Used by punch-holes that sit off-center.
   */
  align?: number;
};

/** A decorative side button rendered on the device body (power, volume, …). */
export type DeviceSideButton = {
  side: "left" | "right";
  /** Distance from the top of the device body, in reference screen-px. */
  offset: number;
  /** Button length down the edge, in reference screen-px. */
  length: number;
  kind?: "power" | "volume" | "action";
};

/** Even bezel thickness, or per-edge thickness, in reference screen-px. */
export type DeviceBezel = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type DevicePreset = {
  id: string;
  label: string;
  platform: DevicePlatform;
  /** Logical screen resolution in CSS px (the canvas/screen content size). */
  screen: { width: number; height: number };
  /** Bezel thickness around the screen, in reference screen-px. */
  bezel: DeviceBezel;
  /** Inner screen corner radius, in reference screen-px. */
  screenRadius: number;
  /** Outer device-body corner radius, in reference screen-px. */
  frameRadius: number;
  /** Device body color. */
  frameColor: string;
  cutout: DeviceCutout;
  /** iOS home-indicator gesture pill at the bottom of the screen. */
  homeIndicator: boolean;
  /** Classic round physical home button in the bottom bezel (e.g. iPhone SE). */
  homeButton: boolean;
  /** Earpiece speaker slit in the top bezel (older, button-based phones). */
  earpiece?: boolean;
  buttons: DeviceSideButton[];
};

/** Helper: build an even bezel from a single thickness. */
export function evenBezel(thickness: number): DeviceBezel {
  return { top: thickness, right: thickness, bottom: thickness, left: thickness };
}

/** Outer (bezel-inclusive) size of a device body for a given rendered screen size. */
export function deviceOuterSize(
  device: DevicePreset,
  screenWidth: number,
  screenHeight: number,
): { width: number; height: number; scale: number } {
  const scale = screenWidth / device.screen.width;
  return {
    width: screenWidth + (device.bezel.left + device.bezel.right) * scale,
    height: screenHeight + (device.bezel.top + device.bezel.bottom) * scale,
    scale,
  };
}

/** Format a device's resolution for menus, e.g. "390 × 844". */
export function deviceResolutionLabel(device: DevicePreset): string {
  return `${device.screen.width} × ${device.screen.height}`;
}
