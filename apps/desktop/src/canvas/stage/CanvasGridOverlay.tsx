import { useEffect, useRef } from "react";
import type { ShellGridType } from "@/canvas/engine/types";

type CanvasRect = { x: number; y: number; width: number; height: number };

type Props = {
  enabled: boolean;
  type: ShellGridType;
  shellBackground: string;
  canvasBackground: string;
  canvasRect: CanvasRect;
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

/** WCAG relative luminance, [0=black … 1=white]. */
function perceivedLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/**
 * Derive grid fill + stroke colours for a given background.
 * Light background → black lines; dark → white lines.
 * Alpha scales inversely to natural contrast so near-grey gets more opacity.
 */
function gridColors(
  bg: string,
  fadeOpacity: number,
): { fill: string; stroke: string } {
  const lum = perceivedLuminance(bg);
  const isLight = lum > 0.5;
  const contrast = Math.abs(lum - 0.5) * 2; // 0 (grey) → 1 (black/white)
  const alphaScale = 0.18 + (1 - contrast) * 0.22; // 0.18 → 0.40
  const dotAlpha = +(alphaScale * fadeOpacity).toFixed(3);
  const lineAlpha = +((alphaScale * 0.65) * fadeOpacity).toFixed(3);
  const ch = isLight ? "0,0,0" : "255,255,255";
  return { fill: `rgba(${ch},${dotAlpha})`, stroke: `rgba(${ch},${lineAlpha})` };
}

// ─── Drawing ───────────────────────────────────────────────────────────────

function drawGrid(
  ctx: CanvasRenderingContext2D,
  type: ShellGridType,
  colors: { fill: string; stroke: string },
  cellSize: number,
  phaseX: number,
  phaseY: number,
  w: number,
  h: number,
) {
  if (type === "dots") {
    ctx.fillStyle = colors.fill;
    const radius = Math.max(0.6, cellSize * 0.07);
    for (let x = phaseX; x <= w; x += cellSize) {
      for (let y = phaseY; y <= h; y += cellSize) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = phaseX; x <= w; x += cellSize) {
      const px = Math.round(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let y = phaseY; y <= h; y += cellSize) {
      const py = Math.round(y) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

export function CanvasGridOverlay({
  enabled,
  type,
  shellBackground,
  canvasBackground,
  canvasRect,
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

    const fadeOpacity = Math.min(
      1,
      (displayZoom - FADE_START_ZOOM) / (FADE_END_ZOOM - FADE_START_ZOOM),
    );
    const cellSize = displayZoom;
    const phaseX = ((offsetX % cellSize) + cellSize) % cellSize;
    const phaseY = ((offsetY % cellSize) + cellSize) % cellSize;

    // Pass 1 — full viewport using shell background colour
    drawGrid(ctx, type, gridColors(shellBackground, fadeOpacity), cellSize, phaseX, phaseY, width, height);

    // Pass 2 — canvas area only, using canvas background colour
    const { x, y, width: cw, height: ch } = canvasRect;
    if (cw > 0 && ch > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cw, ch);
      ctx.clip();
      // Clear the canvas region so pass-1 lines don't bleed through
      ctx.clearRect(x, y, cw, ch);
      drawGrid(ctx, type, gridColors(canvasBackground, fadeOpacity), cellSize, phaseX, phaseY, width, height);
      ctx.restore();
    }
  }, [enabled, type, shellBackground, canvasBackground, canvasRect, displayZoom, offsetX, offsetY, width, height]);

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
