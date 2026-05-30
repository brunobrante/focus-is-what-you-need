import { newId, now } from "@/lib/storage/ids";
import { notifyInvalidation, ownerInvalidationKey } from "@/application/persistence/invalidationBus";
import type { SceneOwnerType, ThumbnailRow } from "@/lib/storage/schema";
import { TABLES, listTable, notify, putRecord, removeRecords } from "@/lib/storage/store";

const KEY = TABLES.thumbnails;

export async function listThumbnails(): Promise<ThumbnailRow[]> {
  return listTable<ThumbnailRow>(KEY);
}

export async function getThumbnailByOwner(
  ownerType: SceneOwnerType,
  ownerId: string,
): Promise<ThumbnailRow | null> {
  const rows = await listThumbnails();
  return (
    rows.find((r) => r.ownerType === ownerType && r.ownerId === ownerId) ?? null
  );
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
        id: newId(),
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
  const existing = await getThumbnailByOwner(ownerType, ownerId);
  if (!existing) return;
  removeRecords(KEY, [existing.id]);
  notifyInvalidation(ownerInvalidationKey("thumbnail", ownerType, ownerId));
  notify(KEY);
}
