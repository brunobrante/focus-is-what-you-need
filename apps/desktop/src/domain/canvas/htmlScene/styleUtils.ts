import type { HtmlCanvasStyle } from "./types";

export function defaultStyle(): HtmlCanvasStyle {
  return {
    background: "transparent",
    color: "#17211D",
    opacity: 1,
    borderColor: "transparent",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: 0,
    shadow: "none",
    display: "block",
    flexDirection: "column",
    align: "start",
    justify: "start",
    gap: 0,
    paddingX: 0,
    paddingY: 0,
    marginX: 0,
    marginY: 0,
    widthMode: "fixed",
    heightMode: "fixed",
    rotation: 0,
    fontFamily: "Inter",
    fontSize: 14,
    fontWeight: 400,
    textAlign: "left",
    objectFit: "cover",
    overflow: "visible",
  };
}

export function normalizeStyle(style: Partial<HtmlCanvasStyle>): HtmlCanvasStyle {
  const next = { ...defaultStyle(), ...style };
  return {
    ...next,
    opacity: clamp(next.opacity, 0, 1),
    borderWidth: clamp(next.borderWidth, 0, 80),
    borderRadius: clamp(next.borderRadius, 0, 999),
    gap: clamp(next.gap, 0, 999),
    paddingX: clamp(next.paddingX, 0, 999),
    paddingY: clamp(next.paddingY, 0, 999),
    marginX: clamp(next.marginX, -999, 999),
    marginY: clamp(next.marginY, -999, 999),
    rotation: normalizeRotation(next.rotation),
    fontSize: clamp(next.fontSize, 1, 300),
    fontWeight: clamp(next.fontWeight, 100, 1000),
  };
}

export function alignFromMock(value: unknown): HtmlCanvasStyle["align"] {
  if (value === "center") return "center";
  if (value === "end") return "end";
  if (value === "stretch") return "stretch";
  return "start";
}

export function justifyFromMock(value: unknown): HtmlCanvasStyle["justify"] {
  if (value === "center") return "center";
  if (value === "end") return "end";
  if (value === "between") return "between";
  return "start";
}

export function modeFromMock(value: unknown): HtmlCanvasStyle["widthMode"] {
  if (value === "fill") return "fill";
  if (value === "hug" || value === "auto") return "hug";
  return "fixed";
}

export function textAlignFromMock(value: unknown): HtmlCanvasStyle["textAlign"] {
  if (value === "center") return "center";
  if (value === "right" || value === "end") return "right";
  return "left";
}

export function objectFitFromMock(value: unknown): HtmlCanvasStyle["objectFit"] {
  if (value === "fill") return "fill";
  if (value === "contain") return "contain";
  if (value === "none") return "none";
  if (value === "scale-down") return "scale-down";
  return "cover";
}

export function weightFromMock(value: unknown): number {
  if (value === "bold") return 700;
  if (value === "medium") return 500;
  if (value === "normal") return 400;
  return toNumber(value, 400);
}

export function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function slugId(value: string): string {
  const slug = slugClass(value);
  return slug || "node";
}

export function slugClass(value: string): string {
  return normalizeName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function escapeAttr(value: string): string {
  return escapeXml(value).replace(/"/g, "&quot;");
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
