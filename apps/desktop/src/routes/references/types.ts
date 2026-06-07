import type {
  ReferenceStackData,
  ReferenceStackItem,
  ReferenceStackSummary,
} from "@/lib/references/stackTypes";
import type { ReferenceGroup } from "@/lib/references/groupTypes";

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

export type StagedItem = ReferenceItem & { desc: string };
export type DuplicateDecision = "existing" | "both";
export type PendingDuplicate = {
  existing: ReferenceItem;
  imported: StagedItem;
};

export type FilterKind = "all" | "image" | "video" | "figx";
export type FilterType = "all" | RefType;
export type FilterSort = "recent" | "old" | "name" | "size";

export type ImportTab = "local" | "figx";
export type GroupDialogState =
  | { mode: "create"; group?: undefined }
  | { mode: "edit"; group: ReferenceGroup }
  | null;
export type ArchiveStatus = {
  groupId: string;
  label: string;
  saving: boolean;
} | null;
export type LightboxTab = "original" | "stack";
export type StackPreviewState = {
  data: ReferenceStackData;
  urls: Record<string, string>;
  ownedUrls: string[];
};
export type StackTreeNode = {
  component: ReferenceStackItem;
  children: StackTreeNode[];
  depth: number;
};
export type SelectedSubject =
  | { kind: "reference"; id: string }
  | { kind: "group"; id: string }
  | null;
