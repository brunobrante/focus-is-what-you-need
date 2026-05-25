import { newId, now } from "@/lib/storage/ids";
import { notifyInvalidation, ownerInvalidationKey } from "@/application/persistence/invalidationBus";
import type { SceneOwnerType, ThumbnailRow } from "@/lib/storage/schema";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.thumbnails;

export async function listThumbnails(): Promise<ThumbnailRow[]> {
  return getTable<ThumbnailRow>(KEY);
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
  const rows = await listThumbnails();
  const existing = rows.find(
    (r) => r.ownerType === input.ownerType && r.ownerId === input.ownerId,
  );
  const t = now();
  if (existing) {
    const updated: ThumbnailRow = {
      ...existing,
      dataUrl: input.dataUrl,
      capturedAt: t,
    };
    const next = rows.map((r) => (r.id === existing.id ? updated : r));
    await setTable<ThumbnailRow>(KEY, next);
    notifyInvalidation(ownerInvalidationKey("thumbnail", input.ownerType, input.ownerId));
    notify(KEY);
    return updated;
  }
  const created: ThumbnailRow = {
    id: newId(),
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    dataUrl: input.dataUrl,
    capturedAt: t,
  };
  await setTable<ThumbnailRow>(KEY, [created, ...rows]);
  notifyInvalidation(ownerInvalidationKey("thumbnail", input.ownerType, input.ownerId));
  notify(KEY);
  return created;
}

export async function deleteThumbnailByOwner(
  ownerType: SceneOwnerType,
  ownerId: string,
): Promise<void> {
  const rows = await listThumbnails();
  const nextRows = rows.filter(
    (row) => !(row.ownerType === ownerType && row.ownerId === ownerId),
  );
  if (nextRows.length === rows.length) return;
  await setTable<ThumbnailRow>(KEY, nextRows);
  notifyInvalidation(ownerInvalidationKey("thumbnail", ownerType, ownerId));
  notify(KEY);
}
