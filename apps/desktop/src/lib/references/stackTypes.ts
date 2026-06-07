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
  // v2: owning root id (which stack this cut belongs to).
  rootId?: string | null;
};

// v2: an independent root within a single reference. One image/video can hold many.
export type ReferenceStackRoot = {
  id: string;
  name: string;
  box: ReferenceStackBox;
  // null only for the implicit full-image default root (its pixels are original.{ext}).
  file: string | null;
  isDefault?: boolean;
  createdAt: string;
  // For video frames: which extracted frame file this root was sourced from.
  sourceFrame?: string | null;
};

export type ReferenceStackData = {
  version: 1 | 2;
  referenceId: string;
  mediaKind: "image" | "video" | "figx";
  original: {
    name: string;
    type: string;
    ext: string;
    w: number;
    h: number;
  };
  // v2: the list of independent roots. v1 readers fall back to rootComponentId.
  roots?: ReferenceStackRoot[];
  // Legacy single-root fields. Still written when exactly one (default) root exists
  // so v1 readers keep working.
  rootComponentId?: string;
  primaryComponentId?: string;
  components: ReferenceStackItem[];
  updatedAt: string;
};

export type ReferenceStackSummary = {
  enabled: boolean;
  itemCount: number;
  rootCount?: number;
  updatedAt?: string;
  rootComponentId?: string;
  primaryComponentId?: string;
};

export function stackSummaryFromData(
  data: ReferenceStackData | null | undefined,
): ReferenceStackSummary | undefined {
  if (!data) return undefined;
  const rootIds = stackRootIds(data);
  const itemCount = data.components.filter((component) => !rootIds.has(component.id)).length;
  const rootCount = Math.max(1, data.roots?.length ?? 1);
  return {
    enabled: itemCount > 0 || rootCount > 1,
    itemCount,
    rootCount,
    updatedAt: data.updatedAt,
    rootComponentId: data.rootComponentId,
    primaryComponentId: data.primaryComponentId,
  };
}

function stackRootIds(data: ReferenceStackData): Set<string> {
  if (data.roots && data.roots.length > 0) {
    return new Set(data.roots.map((root) => root.id));
  }
  return new Set(data.rootComponentId ? [data.rootComponentId] : []);
}
