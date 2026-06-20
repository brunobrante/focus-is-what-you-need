import { now } from "@/lib/storage/ids";
import { notifyInvalidation, ownerInvalidationKey } from "@/application/persistence/invalidationBus";
import type { SceneOwnerType, ThumbnailRow } from "@/lib/storage/schema";
import { TABLES, getRecordById, listTable, notify, putRecord, removeRecords } from "@/lib/storage/store";

const KEY = TABLES.thumbnails;

/**
 * Thumbnail rows are keyed deterministically by their owner (`ownerType:ownerId`),
 * matching the scene scheme — one thumbnail per owner, so a lookup is an O(1)
 * record-store cache hit instead of a full table scan.
 */
export function thumbnailRecordId(ownerType: SceneOwnerType, ownerId: string): string {
  return `${ownerType}:${ownerId}`;
}

export async function listThumbnails(): Promise<ThumbnailRow[]> {
  return listTable<ThumbnailRow>(KEY);
}

export async function getThumbnailByOwner(
  ownerType: SceneOwnerType,
  ownerId: string,
): Promise<ThumbnailRow | null> {
  return getRecordById<ThumbnailRow>(KEY, thumbnailRecordId(ownerType, ownerId));
}

export async function upsertThumbnail(input: {
  ownerType: SceneOwnerType;
  ownerId: string;
  dataUrl: string;
}): Promise<ThumbnailRow> {
  const existing = await getThumbnailByOwner(input.ownerType, input.ownerId);
  const t = now();
  // One record per thumbnail — written as a single per-row delta.
  const row: ThumbnailRow = existing
    ? { ...existing, dataUrl: input.dataUrl, capturedAt: t }
    : {
        id: thumbnailRecordId(input.ownerType, input.ownerId),
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        dataUrl: input.dataUrl,
        capturedAt: t,
      };
  putRecord<ThumbnailRow>(KEY, row);
  notifyInvalidation(ownerInvalidationKey("thumbnail", input.ownerType, input.ownerId));
  notify(KEY);
  return row;
}

export async function deleteThumbnailByOwner(
  ownerType: SceneOwnerType,
  ownerId: string,
): Promise<void> {
  const id = thumbnailRecordId(ownerType, ownerId);
  const existing = await getRecordById<ThumbnailRow>(KEY, id);
  if (!existing) return;
  removeRecords(KEY, [id]);
  notifyInvalidation(ownerInvalidationKey("thumbnail", ownerType, ownerId));
  notify(KEY);
}
