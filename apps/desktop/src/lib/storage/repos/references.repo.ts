import { normalizeReferenceRow } from "@/lib/storage/defaults";
import { newId, now } from "@/lib/storage/ids";
import type { OwnerType, ReferenceAttachment, ReferenceRow } from "@/lib/storage/schema";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.references;

export async function listReferences(): Promise<ReferenceRow[]> {
  const rows = await getTable<ReferenceRow>(KEY);
  return rows.map(normalizeReferenceRow);
}

export async function listReferencesByOwner(
  ownerType: OwnerType,
  ownerId: string,
): Promise<ReferenceRow[]> {
  const rows = await listReferences();
  return rows.filter((reference) => {
    if (ownerType === "project") {
      return reference.attachments.some(
        (attachment) =>
          attachment.projectId === ownerId &&
          attachment.screenId === null &&
          attachment.componentId === null,
      );
    }
    if (ownerType === "screen") {
      return reference.attachments.some((attachment) => attachment.screenId === ownerId);
    }
    return reference.attachments.some((attachment) => attachment.componentId === ownerId);
  });
}

export async function listReferencesByProject(projectId: string): Promise<ReferenceRow[]> {
  const rows = await listReferences();
  return rows.filter((reference) => reference.projectIds.includes(projectId));
}

export async function createOrAttachReference(input: {
  id?: string;
  title: string;
  source: string;
  origin: ReferenceRow["origin"];
  visibility: ReferenceRow["visibility"];
  bg: string;
  accent: string;
  kind: ReferenceRow["kind"];
  description?: string;
  metadata?: string[];
  thumbnailUrl?: string | null;
  attachment: ReferenceAttachment;
}): Promise<ReferenceRow> {
  const rows = await listReferences();
  const idx = input.id ? rows.findIndex((reference) => reference.id === input.id) : -1;
  const nextAttachment = input.attachment;

  if (idx >= 0) {
    const current = rows[idx]!;
    const attachments = current.attachments.some(
      (attachment) =>
        attachment.projectId === nextAttachment.projectId &&
        attachment.screenId === nextAttachment.screenId &&
        attachment.componentId === nextAttachment.componentId,
    )
      ? current.attachments
      : [nextAttachment, ...current.attachments];
    const updated = normalizeReferenceRow({
      ...current,
      title: input.title,
      source: input.source,
      origin: input.origin,
      visibility: input.visibility,
      bg: input.bg,
      accent: input.accent,
      kind: input.kind,
      description: input.description ?? current.description,
      metadata: input.metadata ?? current.metadata,
      thumbnailUrl: input.thumbnailUrl ?? current.thumbnailUrl,
      attachments,
      projectIds: Array.from(new Set([nextAttachment.projectId, ...attachments.map((attachment) => attachment.projectId)])),
    });
    const nextRows = [...rows];
    nextRows[idx] = updated;
    await setTable<ReferenceRow>(KEY, nextRows);
    notify(KEY);
    return updated;
  }

  const created = normalizeReferenceRow({
    id: input.id ?? newId(),
    title: input.title,
    source: input.source,
    origin: input.origin,
    visibility: input.visibility,
    bg: input.bg,
    accent: input.accent,
    kind: input.kind,
    description: input.description ?? "",
    metadata: input.metadata ?? [],
    thumbnailUrl: input.thumbnailUrl ?? null,
    projectIds: [nextAttachment.projectId],
    attachments: [nextAttachment],
    createdAt: now(),
  });
  await setTable<ReferenceRow>(KEY, [created, ...rows]);
  notify(KEY);
  return created;
}

export async function updateReference(
  referenceId: string,
  patch: Partial<
    Pick<
      ReferenceRow,
      "title" | "source" | "visibility" | "description" | "metadata" | "thumbnailUrl" | "attachments" | "projectIds"
    >
  >,
): Promise<ReferenceRow | null> {
  const rows = await listReferences();
  const idx = rows.findIndex((reference) => reference.id === referenceId);
  if (idx < 0) return null;
  const updated = normalizeReferenceRow({
    ...rows[idx]!,
    ...patch,
  });
  const nextRows = [...rows];
  nextRows[idx] = updated;
  await setTable<ReferenceRow>(KEY, nextRows);
  notify(KEY);
  return updated;
}

export async function removeReferenceFromProject(referenceId: string, projectId: string): Promise<void> {
  const rows = await listReferences();
  const nextRows = rows
    .map((reference) => {
      if (reference.id !== referenceId) return reference;
      const attachments = reference.attachments.filter(
        (attachment) => attachment.projectId !== projectId,
      );
      return normalizeReferenceRow({
        ...reference,
        attachments,
        projectIds: Array.from(new Set(attachments.map((attachment) => attachment.projectId))),
      });
    })
    .filter((reference) => reference.projectIds.length > 0);
  await setTable<ReferenceRow>(KEY, nextRows);
  notify(KEY);
}

export async function bulkInsertReferences(rows: ReferenceRow[]): Promise<void> {
  await setTable<ReferenceRow>(KEY, rows.map(normalizeReferenceRow));
  notify(KEY);
}
