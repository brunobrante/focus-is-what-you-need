import { now } from "@/lib/storage/ids";
import { notifyInvalidation, ownerInvalidationKey } from "@/application/persistence/invalidationBus";
import { deleteAsset, putAssetText } from "@/application/persistence/assetStore";
import { invalidateAssetDataUrl } from "@/application/persistence/assetDataUrlLoader";
import type { SceneOwnerType, ThumbnailRow } from "@/lib/storage/schema";
import { TABLES, getRecordById, listTable, notify, putRecord, removeRecords } from "@/lib/storage/store";

const KEY = TABLES.thumbnails;
// Snapshot data URLs are stored as text; the mime is cosmetic (the full data URL
// is read back verbatim), but recorded for a future GC/export pass.
const THUMBNAIL_MIME = "image/svg+xml";

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
  const id = thumbnailRecordId(input.ownerType, input.ownerId);
  const t = now();
  // Stable blob key per owner (== the record id) so a regenerated snapshot
  // overwrites in place — no orphaned blobs to GC. Write the bytes first, then
  // drop the loader's stale cache entry, then the row (whose notify makes the UI
  // re-resolve the now-fresh blob).
  const dataBlobKey = await putAssetText(input.dataUrl, {
    blobKey: id,
    mimeType: THUMBNAIL_MIME,
  });
  invalidateAssetDataUrl(dataBlobKey);
  const row: ThumbnailRow = {
    id,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    dataBlobKey,
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
  await deleteAsset(existing.dataBlobKey);
  invalidateAssetDataUrl(existing.dataBlobKey);
  notifyInvalidation(ownerInvalidationKey("thumbnail", ownerType, ownerId));
  notify(KEY);
}
