export type ReferenceGroupArchive = {
  file: string;
  path: string;
  updatedAt: string;
};

export type ReferenceGroup = {
  id: string;
  name: string;
  description?: string;
  referenceIds: string[];
  coverReferenceId?: string | null;
  createdAt: string;
  updatedAt: string;
  archive?: ReferenceGroupArchive;
};

export type ReferenceGroupArchiveResult = {
  file: string;
  path: string;
  updated_at: number;
};

export function normalizeReferenceGroups(value: unknown): ReferenceGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((group) => group && typeof group === "object")
    .map((group) => {
      const item = group as Partial<ReferenceGroup>;
      const referenceIds = Array.isArray(item.referenceIds)
        ? item.referenceIds.map(String).filter(Boolean)
        : [];
      const createdAt = String(item.createdAt || new Date(0).toISOString());
      const updatedAt = String(item.updatedAt || createdAt);
      const archive = normalizeReferenceGroupArchive(item.archive);
      return {
        id: String(item.id || ""),
        name: String(item.name || "Untitled group"),
        description: item.description ? String(item.description) : undefined,
        referenceIds: Array.from(new Set(referenceIds)),
        coverReferenceId: item.coverReferenceId ? String(item.coverReferenceId) : null,
        createdAt,
        updatedAt,
        ...(archive ? { archive } : {}),
      };
    })
    .filter((group) => group.id);
}

export function newReferenceGroupId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `g-${crypto.randomUUID()}`;
  }
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function referenceGroupArchiveFromResult(
  result: ReferenceGroupArchiveResult,
): ReferenceGroupArchive {
  return {
    file: result.file,
    path: result.path,
    updatedAt: new Date(result.updated_at).toISOString(),
  };
}

function normalizeReferenceGroupArchive(
  value: ReferenceGroup["archive"] | unknown,
): ReferenceGroupArchive | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<ReferenceGroupArchive>;
  if (!input.file || !input.path || !input.updatedAt) return undefined;
  return {
    file: String(input.file),
    path: String(input.path),
    updatedAt: String(input.updatedAt),
  };
}
