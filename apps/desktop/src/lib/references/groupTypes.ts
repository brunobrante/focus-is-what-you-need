import { randomSuffix } from "@/lib/storage/ids";

export type ReferenceGroup = {
  id: string;
  name: string;
  description?: string;
  referenceIds: string[];
  coverReferenceId?: string | null;
  createdAt: string;
  updatedAt: string;
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
      return {
        id: String(item.id || ""),
        name: String(item.name || "Untitled group"),
        description: item.description ? String(item.description) : undefined,
        referenceIds: Array.from(new Set(referenceIds)),
        coverReferenceId: item.coverReferenceId ? String(item.coverReferenceId) : null,
        createdAt,
        updatedAt,
      };
    })
    .filter((group) => group.id);
}

export function newReferenceGroupId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `g-${crypto.randomUUID()}`;
  }
  return `g-${Date.now()}-${randomSuffix()}`;
}

