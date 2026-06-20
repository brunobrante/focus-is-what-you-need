import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { blobToDataUrl } from "@/lib/image/dataUrl"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** A File is a Blob, so this is the canonical blobToDataUrl under the old name. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

export function fileFormatLabel(name: string): string {
  const parts = name.split(".");
  return (parts.length > 1 ? parts.at(-1) : "file")!.toUpperCase();
}
