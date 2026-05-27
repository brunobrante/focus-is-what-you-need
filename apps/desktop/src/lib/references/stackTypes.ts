export type ReferenceStackBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
};

export type ReferenceStackItem = {
  id: string;
  name: string;
  type: string;
  box: ReferenceStackBox;
  file: string | null;
  parentId: string | null;
  createdAt: string;
};

export type ReferenceStackData = {
  version: 1;
  referenceId: string;
  mediaKind: "image" | "video" | "figx";
  original: {
    name: string;
    type: string;
    ext: string;
    w: number;
    h: number;
  };
  rootComponentId: string;
  primaryComponentId: string;
  components: ReferenceStackItem[];
  updatedAt: string;
};

export type ReferenceStackSummary = {
  enabled: boolean;
  itemCount: number;
  updatedAt?: string;
  rootComponentId?: string;
  primaryComponentId?: string;
};

export function stackSummaryFromData(
  data: ReferenceStackData | null | undefined,
): ReferenceStackSummary | undefined {
  if (!data) return undefined;
  const itemCount = data.components.filter((component) => component.id !== data.rootComponentId).length;
  return {
    enabled: itemCount > 0,
    itemCount,
    updatedAt: data.updatedAt,
    rootComponentId: data.rootComponentId,
    primaryComponentId: data.primaryComponentId,
  };
}
