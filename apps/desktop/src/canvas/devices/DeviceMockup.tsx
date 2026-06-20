import type { CSSProperties, ReactNode } from "react";
import type { DevicePreset, DeviceSideButton } from "./deviceTypes";

/**
 * Wraps screen content in a realistic phone body (bezel, corner radius, camera
 * cutout, side buttons, home indicator). Chrome metrics from the preset are
 * authored in reference screen-px and scaled by `screenWidth / device.screen.width`
 * so the mockup stays proportional at any rendered size.
 *
 * Two content modes:
 *  - default ("exact"): the screen window is sized to `screenWidth × screenHeight`
 *    and the children are expected to already be that size (canvas preview).
 *  - `stretchContent`: the children (typically a thumbnail <img>) are stretched to
 *    fill the screen window (details preview).
 */
export function DeviceMockup({
  device,
  screenWidth = device.screen.width,
  screenHeight = device.screen.height,
  screenBackground,
  stretchContent = false,
  children,
}: {
  device: DevicePreset;
  screenWidth?: number;
  screenHeight?: number;
  screenBackground?: string;
  stretchContent?: boolean;
  children: ReactNode;
}) {
  const scale = screenWidth / device.screen.width;
  const s = (value: number) => value * scale;

  const { bezel, cutout } = device;
  const bodyStyle: CSSProperties = {
    boxSizing: "content-box",
    width: screenWidth,
    height: screenHeight,
    paddingTop: s(bezel.top),
    paddingRight: s(bezel.right),
    paddingBottom: s(bezel.bottom),
    paddingLeft: s(bezel.left),
    background: device.frameColor,
    borderRadius: s(device.frameRadius),
    position: "relative",
    flex: "none",
    boxShadow: [
      "inset 0 0 0 1px rgba(255,255,255,0.08)",
      "inset 0 0 0 2px rgba(0,0,0,0.6)",
      "0 30px 70px rgba(0,0,0,0.55)",
    ].join(", "),
  };

  const screenStyle: CSSProperties = {
    position: "relative",
    width: screenWidth,
    height: screenHeight,
    borderRadius: s(device.screenRadius),
    overflow: "hidden",
    background: screenBackground || "#000",
  };

  const contentStyle: CSSProperties = stretchContent
    ? { position: "absolute", inset: 0 }
    : { position: "absolute", inset: 0 };

  return (
    <div style={bodyStyle}>
      {device.buttons.map((button, index) => (
        <SideButton key={index} button={button} scale={scale} />
      ))}

      <div style={screenStyle}>
        <div
          style={contentStyle}
          className={
            stretchContent
              ? "[&_img]:!h-full [&_img]:!w-full [&_img]:!max-h-none [&_img]:!max-w-none [&_img]:!object-cover"
              : undefined
          }
        >
          {children}
        </div>

        {cutout.kind !== "none" ? <Cutout device={device} scale={scale} screenWidth={screenWidth} /> : null}
        {device.earpiece ? <Earpiece scale={scale} /> : null}
        {device.homeIndicator ? <HomeIndicator scale={scale} screenWidth={screenWidth} /> : null}
      </div>

      {device.homeButton ? <HomeButton scale={scale} bezelBottom={s(device.bezel.bottom)} /> : null}
    </div>
  );
}

// ── Camera / sensor cutout ──────────────────────────────────────────────────

function Cutout({
  device,
  scale,
  screenWidth,
}: {
  device: DevicePreset;
  scale: number;
  screenWidth: number;
}) {
  const s = (value: number) => value * scale;
  const { cutout } = device;
  const align = cutout.align ?? 0.5;

  if (cutout.kind === "punch-hole") {
    const diameter = s(cutout.height ?? 18);
    return (
      <span
        style={{
          position: "absolute",
          top: s(cutout.offsetTop ?? 12),
          left: align * screenWidth,
          transform: "translateX(-50%)",
          width: diameter,
          height: diameter,
          borderRadius: "50%",
          background: "#000",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
          zIndex: 3,
        }}
      />
    );
  }

  if (cutout.kind === "dynamic-island") {
    return (
      <span
        style={{
          position: "absolute",
          top: s(cutout.offsetTop ?? 11),
          left: "50%",
          transform: "translateX(-50%)",
          width: s(cutout.width ?? 120),
          height: s(cutout.height ?? 35),
          borderRadius: 999,
          background: "#000",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
          zIndex: 3,
        }}
      />
    );
  }

  // notch: attached to the top edge, rounded only on the bottom corners.
  const radius = s(cutout.height ?? 30) * 0.6;
  return (
    <span
      style={{
        position: "absolute",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: s(cutout.width ?? 156),
        height: s(cutout.height ?? 30),
        background: "#000",
        borderBottomLeftRadius: radius,
        borderBottomRightRadius: radius,
        zIndex: 3,
      }}
    />
  );
}

// ── iOS home-indicator gesture pill ─────────────────────────────────────────

function HomeIndicator({ scale, screenWidth }: { scale: number; screenWidth: number }) {
  return (
    <span
      style={{
        position: "absolute",
        bottom: 8 * scale,
        left: "50%",
        transform: "translateX(-50%)",
        width: Math.max(80, screenWidth * 0.36),
        height: Math.max(4, 5 * scale),
        borderRadius: 999,
        background: "rgba(0,0,0,0.32)",
        mixBlendMode: "multiply",
        zIndex: 3,
      }}
    />
  );
}

// ── Classic earpiece slit (button phones) ───────────────────────────────────

function Earpiece({ scale }: { scale: number }) {
  return (
    <span
      style={{
        position: "absolute",
        top: -(34 * scale),
        left: "50%",
        transform: "translateX(-50%)",
        width: 56 * scale,
        height: 6 * scale,
        borderRadius: 999,
        background: "rgba(255,255,255,0.16)",
        zIndex: 3,
      }}
    />
  );
}

// ── Classic round home button (bottom bezel) ────────────────────────────────

function HomeButton({ scale, bezelBottom }: { scale: number; bezelBottom: number }) {
  const size = Math.min(bezelBottom * 0.5, 46 * scale);
  return (
    <span
      style={{
        position: "absolute",
        bottom: (bezelBottom - size) / 2,
        left: "50%",
        transform: "translateX(-50%)",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#0A0A0B",
        boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.18)",
      }}
    />
  );
}

// ── Decorative side buttons on the device body ──────────────────────────────

function SideButton({ button, scale }: { button: DeviceSideButton; scale: number }) {
  const thickness = Math.max(2, 3 * scale);
  const radius = 2 * scale;
  const style: CSSProperties = {
    position: "absolute",
    top: button.offset * scale,
    height: button.length * scale,
    width: thickness,
    background: "rgba(0,0,0,0.55)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
    zIndex: 1,
  };
  if (button.side === "left") {
    style.left = -thickness + 0.5;
    style.borderTopLeftRadius = radius;
    style.borderBottomLeftRadius = radius;
  } else {
    style.right = -thickness + 0.5;
    style.borderTopRightRadius = radius;
    style.borderBottomRightRadius = radius;
  }
  return <span style={style} />;
}
