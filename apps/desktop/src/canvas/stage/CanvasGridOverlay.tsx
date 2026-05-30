import { useEffect, useRef } from "react";
import type { ShellGridType } from "@/canvas/engine/types";

type Props = {
  enabled: boolean;
  type: ShellGridType;
  displayZoom: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

// Grid becomes visible at this zoom level and fades in up to FADE_END_ZOOM.
const FADE_START_ZOOM = 4;
const FADE_END_ZOOM = 8;

export function CanvasGridOverlay({ enabled, type, displayZoom, offsetX, offsetY, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match physical pixel size to avoid blurriness
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!enabled || displayZoom < FADE_START_ZOOM || width === 0 || height === 0) return;

    // 0 → 1 fade as zoom goes from FADE_START_ZOOM to FADE_END_ZOOM
    const fadeOpacity = Math.min(1, (displayZoom - FADE_START_ZOOM) / (FADE_END_ZOOM - FADE_START_ZOOM));

    // 1 document pixel = displayZoom CSS pixels
    const cellSize = displayZoom;

    // Phase so grid is anchored to canvas origin
    const phaseX = ((offsetX % cellSize) + cellSize) % cellSize;
    const phaseY = ((offsetY % cellSize) + cellSize) % cellSize;

    if (type === "dots") {
      const dotAlpha = 0.25 * fadeOpacity;
      ctx.fillStyle = `rgba(255,255,255,${dotAlpha})`;
      const radius = Math.max(0.6, cellSize * 0.07);
      for (let x = phaseX; x <= width; x += cellSize) {
        for (let y = phaseY; y <= height; y += cellSize) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // squares — draw grid lines
      const lineAlpha = 0.12 * fadeOpacity;
      ctx.strokeStyle = `rgba(255,255,255,${lineAlpha})`;
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
  }, [enabled, type, displayZoom, offsetX, offsetY, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        pointerEvents: "none",
        zIndex: 2,
      }}
    />
  );
}
