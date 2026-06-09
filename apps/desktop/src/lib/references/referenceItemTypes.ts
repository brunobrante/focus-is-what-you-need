import type { ReferenceStackSummary } from "./stackTypes";

export type MediaKind = "image" | "video" | "figx";

export type RefType =
  | "PNG"
  | "JPG"
  | "WEBP"
  | "SVG"
  | "GIF"
  | "MP4"
  | "MOV"
  | "WEBM"
  | "AVI"
  | "MKV"
  | "FIGX"
  | "IMG";

export type ReferenceItem = {
  id: string;
  name: string;
  mediaKind: MediaKind;
  type: RefType;
  w: number;
  h: number;
  size: number;
  duration?: number;
  description?: string;
  sourceUrl?: string;
  contentHash?: string;
  tags: string[];
  added: string;
  ext?: string;
  groupId?: string | null;
  stack?: ReferenceStackSummary;
  url: string;
};

