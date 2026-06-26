import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { blobToDataUrl } from "@/lib/image/dataUrl"
import { extFromName } from "@/lib/references/mediaTypes"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** A File is a Blob, so this is the canonical blobToDataUrl under the old name. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

export function fileFormatLabel(name: string): string {
  return name.includes(".") ? extFromName(name).toUpperCase() : "FILE";
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const RELATIVE_TIME_STEPS: Array<{ limit: number; unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { limit: 60_000, unit: "second", ms: 1_000 },
  { limit: 3_600_000, unit: "minute", ms: 60_000 },
  { limit: 86_400_000, unit: "hour", ms: 3_600_000 },
  { limit: 604_800_000, unit: "day", ms: 86_400_000 },
  { limit: 2_629_800_000, unit: "week", ms: 604_800_000 },
  { limit: 31_557_600_000, unit: "month", ms: 2_629_800_000 },
  { limit: Infinity, unit: "year", ms: 31_557_600_000 },
];

/** Human-readable "updated N ago" string from an epoch-ms timestamp. */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;
  if (!Number.isFinite(timestamp) || diff < 30_000) return "just now";
  const step = RELATIVE_TIME_STEPS.find((s) => diff < s.limit) ?? RELATIVE_TIME_STEPS[RELATIVE_TIME_STEPS.length - 1];
  return RELATIVE_TIME.format(-Math.round(diff / step.ms), step.unit);
}
