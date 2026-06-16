import type { ChecklistItem, ChecklistRow, VariantOwnerKind } from "@/lib/storage/schema";
import { now } from "@/lib/storage/ids";
import { TABLES, getRecordById, putRecord, removeRecords } from "@/lib/storage/store";

const KEY = TABLES.checklists;

// A checklist belongs to a canvas subject: a screen master or a component master.
// Keying on the master id (not a variant id) keeps the list stable across versions.
export type ChecklistOwner = {
  ownerKind: VariantOwnerKind;
  ownerId: string;
};

export const checklistId = (owner: ChecklistOwner): string =>
  `${owner.ownerKind}:${owner.ownerId}`;

export async function getChecklist(owner: ChecklistOwner): Promise<ChecklistRow | null> {
  return getRecordById<ChecklistRow>(KEY, checklistId(owner));
}

/** Persist the full item list for an owner. Removes the row when the list is empty. */
export async function putChecklistItems(
  owner: ChecklistOwner,
  items: ChecklistItem[],
): Promise<void> {
  const id = checklistId(owner);
  if (items.length === 0) {
    removeRecords(KEY, [id]);
    return;
  }
  const existing = await getChecklist(owner);
  const t = now();
  const row: ChecklistRow = {
    id,
    ownerKind: owner.ownerKind,
    ownerId: owner.ownerId,
    items,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  putRecord(KEY, row);
}
