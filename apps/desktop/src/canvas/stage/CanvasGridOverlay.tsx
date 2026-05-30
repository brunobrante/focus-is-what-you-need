import { useEffect, useRef } from "react";
import type { ShellGridType } from "@/canvas/engine/types";

type Props = {
  enabled: boolean;
  type: ShellGridType;
  background: string;
  displayZoom: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

const FADE_START_ZOOM = 4;
const FADE_END_ZOOM = 8;

// ─── Colour helpers ────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Perceived luminance using the sRGB coefficients (same formula WCAG uses).
 * Returns a value in [0, 1] where 0 = black, 1 = white.
 */
function perceivedLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  // Linearise each channel
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/**
 * Pick a grid colour and alpha that keeps the grid legible regardless of
 * background.
 *
 * Strategy (mirrors Figma):
 *  - Light background → dark (black) lines
 *  - Dark background  → light (white) lines
 *  - Near-grey background has the lowest natural contrast with either, so
 *    we raise the alpha to compensate; pure black/white need very little.
 */
function gridColorForBackground(hex: string, fadeOpacity: number): { fill: string; stroke: string } {
  const lum = perceivedLuminance(hex);
  const isLight = lum > 0.5;

  // How far from mid-grey: 0 = pure grey, 1 = pure black / white
  const contrast = Math.abs(lum - 0.5) * 2;

  // Low contrast with bg → need higher alpha; high contrast → low alpha is enough
  const alphaScale = 0.18 + (1 - contrast) * 0.22; // 0.18 → 0.40

  const dotAlpha = +(alphaScale * fadeOpacity).toFixed(3);
  const lineAlpha = +((alphaScale * 0.65) * fadeOpacity).toFixed(3);

  const ch = isLight ? "0,0,0" : "255,255,255";
  return {
    fill: `rgba(${ch},${dotAlpha})`,
    stroke: `rgba(${ch},${lineAlpha})`,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function CanvasGridOverlay({
  enabled,
  type,
  background,
  displayZoom,
  offsetX,
  offsetY,
  width,
  height,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!enabled || displayZoom < FADE_START_ZOOM || width === 0 || height === 0) return;

    const fadeOpacity = Math.min(1, (displayZoom - FADE_START_ZOOM) / (FADE_END_ZOOM - FADE_START_ZOOM));
    const { fill, stroke } = gridColorForBackground(background, fadeOpacity);

    const cellSize = displayZoom;
    const phaseX = ((offsetX % cellSize) + cellSize) % cellSize;
    const phaseY = ((offsetY % cellSize) + cellSize) % cellSize;

    if (type === "dots") {
      ctx.fillStyle = fill;
      const radius = Math.max(0.6, cellSize * 0.07);
      for (let x = phaseX; x <= width; x += cellSize) {
        for (let y = phaseY; y <= height; y += cellSize) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = phaseX; x <= width; x += cellSize) {
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
      }
      for (let y = phaseY; y <= height; y += cellSize) {
        const py = Math.round(y) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
      }
      ctx.stroke();
    }
  }, [enabled, type, background, displayZoom, offsetX, offsetY, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
}
