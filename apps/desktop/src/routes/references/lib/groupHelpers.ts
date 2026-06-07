import type { ReferenceGroup, ReferenceGroupArchive } from "@/lib/references/groupTypes";
import type { ReferenceItem } from "../types";

export function applyGroupsToLibrary(
  items: ReferenceItem[],
  groups: ReferenceGroup[],
): ReferenceItem[] {
  const groupIds = new Set(groups.map((g) => g.id));
  const groupByReference = new Map<string, string>();
  for (const group of groups) {
    for (const referenceId of group.referenceIds) {
      if (!groupByReference.has(referenceId)) groupByReference.set(referenceId, group.id);
    }
  }
  return items.map((item) => {
    const groupId =
      item.groupId && groupIds.has(item.groupId)
        ? item.groupId
        : groupByReference.get(item.id) ?? null;
    return { ...item, groupId };
  });
}

export function normalizeGroupsForLibrary(
  groups: ReferenceGroup[],
  library: ReferenceItem[],
): ReferenceGroup[] {
  const libraryIds = new Set(library.map((item) => item.id));
  const referencesByGroup = new Map<string, string[]>();
  for (const item of library) {
    if (!item.groupId) continue;
    const current = referencesByGroup.get(item.groupId) ?? [];
    current.push(item.id);
    referencesByGroup.set(item.groupId, current);
  }

  return groups.map((group) => {
    const referenceIds = Array.from(
      new Set([
        ...group.referenceIds.filter((id) => libraryIds.has(id)),
        ...(referencesByGroup.get(group.id) ?? []),
      ]),
    );
    return withGroupReferences(group, referenceIds);
  });
}

export function addReferencesToGroup(
  groups: ReferenceGroup[],
  groupId: string,
  referenceIds: string[],
): ReferenceGroup[] {
  const ids = new Set(referenceIds);
  return groups.map((group) => {
    const withoutMoved = group.referenceIds.filter((id) => !ids.has(id));
    if (group.id !== groupId) {
      return withoutMoved.length === group.referenceIds.length
        ? group
        : withGroupReferences(group, withoutMoved, true);
    }
    return withGroupReferences(group, Array.from(new Set([...referenceIds, ...withoutMoved])), true);
  });
}

export function removeReferenceFromGroups(
  groups: ReferenceGroup[],
  referenceId: string,
): ReferenceGroup[] {
  return groups.map((group) => {
    if (!group.referenceIds.includes(referenceId)) return group;
    return withGroupReferences(
      group,
      group.referenceIds.filter((id) => id !== referenceId),
      true,
    );
  });
}

export function moveReferenceToGroup(
  groups: ReferenceGroup[],
  referenceId: string,
  nextGroupId: string | null,
): ReferenceGroup[] {
  return groups.map((group) => {
    const nextReferences = group.referenceIds.filter((id) => id !== referenceId);
    if (group.id === nextGroupId) nextReferences.unshift(referenceId);
    if (
      nextReferences.length === group.referenceIds.length &&
      nextReferences.every((id, index) => id === group.referenceIds[index])
    ) {
      return group;
    }
    return withGroupReferences(group, nextReferences, true);
  });
}

export function updateGroupArchive(
  groups: ReferenceGroup[],
  groupId: string,
  archive: ReferenceGroupArchive,
): ReferenceGroup[] {
  const updatedAt = new Date().toISOString();
  return groups.map((group) =>
    group.id === groupId ? { ...group, archive, updatedAt } : group,
  );
}

export function withGroupReferences(
  group: ReferenceGroup,
  referenceIds: string[],
  touch = false,
): ReferenceGroup {
  const uniqueIds = Array.from(new Set(referenceIds));
  const coverReferenceId =
    group.coverReferenceId && uniqueIds.includes(group.coverReferenceId)
      ? group.coverReferenceId
      : uniqueIds[0] ?? null;
  return {
    ...group,
    referenceIds: uniqueIds,
    coverReferenceId,
    updatedAt: touch ? new Date().toISOString() : group.updatedAt,
  };
}
