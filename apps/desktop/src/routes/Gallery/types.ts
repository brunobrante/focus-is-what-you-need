import type { ComponentKind } from "@/lib/data/types";

export type Tab = "screens" | "components" | "references" | "system";
export type CmpKindFilter = "all" | ComponentKind;
export type SectionState = { id: string; name: string };
export type CmpChipOption = { value: string; label: string };
