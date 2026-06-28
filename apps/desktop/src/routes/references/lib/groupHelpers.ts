import {
  newReferenceGroupId,
  type ReferenceGroup,
} from "@/lib/references/groupTypes";
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

/**
 * Every image that owns more than one stack root is a collection and must be backed
 * by a real `ReferenceGroup` — there is no separate "pseudo group" concept anymore.
 * This auto-creates the missing group for any such item that is not already grouped,
 * seeding the group name from the item's name (the two names then diverge freely).
 *
 * Idempotent: an item that already has a `groupId` is never touched, so it is safe to
 * run on every load and on every library change without producing duplicate groups.
 */
export function ensureGroupsForMultiRootItems(
  items: ReferenceItem[],
  groups: ReferenceGroup[],
  now: string,
): { items: ReferenceItem[]; groups: ReferenceGroup[]; changed: boolean } {
  let changed = false;
  const nextGroups = [...groups];
  const nextItems = items.map((item) => {
    const rootCount = item.stack?.rootCount ?? 1;
    if (rootCount <= 1 || item.groupId) return item;
    const group: ReferenceGroup = {
      id: newReferenceGroupId(),
      name: item.name,
      referenceIds: [item.id],
      coverReferenceId: item.id,
      createdAt: now,
      updatedAt: now,
    };
    nextGroups.unshift(group);
    changed = true;
    return { ...item, groupId: group.id };
  });
  return { items: nextItems, groups: nextGroups, changed };
}

/** Drop groups left without any references — used after an item is deleted so an
 * auto-created single-item group does not linger as an empty ghost card. */
export function pruneEmptyGroups(groups: ReferenceGroup[]): ReferenceGroup[] {
  const next = groups.filter((group) => group.referenceIds.length > 0);
  return next.length === groups.length ? groups : next;
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
