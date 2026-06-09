import type {
  ReferenceStackData,
  ReferenceStackItem,
} from "@/lib/references/stackTypes";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ReferenceItem, RefType } from "@/lib/references/referenceItemTypes";

export type { MediaKind, RefType, ReferenceItem, ArchiveStatus } from "@/lib/references/referenceItemTypes";

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
