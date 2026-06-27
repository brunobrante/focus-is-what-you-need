import { normalizeReferenceRow } from "@/lib/storage/defaults";
import { newId, now } from "@/lib/storage/ids";
import { reconcileReferenceAttachments } from "@/application/graph/ownershipReconcile";
import { listEdges } from "@/lib/storage/repos/edges.repo";
import type { OwnerType, ReferenceAttachment, ReferenceRow } from "@/lib/storage/schema";
import { TABLES, listTable, notify, replaceTable } from "@/lib/storage/store";

const KEY = TABLES.references;

/**
 * Keep a reference's `attached_to` edges in step with its `attachments[]` after a
 * write (save-architecture-v3 flip 1b). Edges are the authoritative multi-attach
 * mechanism + the indexed usage source (`idx_edges_to`/`idx_edges_from`); the
 * `attachments[]` array stays as a denormalized display mirror. A removed row is
 * passed with empty attachments so its edges are cleared.
 */
async function syncAttachmentEdges(refs: ReferenceRow[]): Promise<void> {
  for (const ref of refs) await reconcileReferenceAttachments(ref);
}

/** Distinct project ids backing a set of attachments (workspace-level attachments
 *  have no project, so they contribute nothing). */
function collectProjectIds(attachments: ReferenceAttachment[]): string[] {
  return Array.from(
    new Set(
      attachments
        .map((attachment) => attachment.projectId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

export async function listReferences(): Promise<ReferenceRow[]> {
  const rows = await listTable<ReferenceRow>(KEY);
  return rows.map(normalizeReferenceRow);
}

export async function listReferencesByOwner(
  ownerType: OwnerType,
  ownerId: string,
): Promise<ReferenceRow[]> {
  const rows = await listReferences();
  return rows.filter((reference) =>
    reference.attachments.some((attachment) =>
      attachmentMatchesOwner(attachment, ownerType, ownerId),
    ),
  );
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
  stack?: ReferenceRow["stack"];
  sourceReferenceId?: string;
  stackNodeId?: string | null;
  stackNodeName?: string;
  attachment: ReferenceAttachment;
}): Promise<ReferenceRow> {
  const rows = await listReferences();
  // Each (image, stack-node) pair is its own card. Whole-image references keep
  // id = library image id (back-compat); node references get a composite id so
  // the original and any number of cuts coexist as distinct cards.
  const rowId =
    input.id ??
    (input.sourceReferenceId
      ? input.stackNodeId
        ? `${input.sourceReferenceId}::${input.stackNodeId}`
        : input.sourceReferenceId
      : undefined);
  const idx = rowId ? rows.findIndex((reference) => reference.id === rowId) : -1;
  const nextAttachment = input.attachment;

  if (idx >= 0) {
    const current = rows[idx]!;
    // A non-linkable reference is a detached local copy — it cannot be shared
    // into another location, so attaching it elsewhere is a no-op.
    if (current.linkable === false) return current;
    const attachments = current.attachments.some(
      (attachment) =>
        (attachment.workspaceId ?? null) === (nextAttachment.workspaceId ?? null) &&
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
      stack: input.stack ?? current.stack,
      sourceReferenceId: input.sourceReferenceId ?? current.sourceReferenceId,
      stackNodeId: input.stackNodeId ?? current.stackNodeId,
      stackNodeName: input.stackNodeName ?? current.stackNodeName,
      attachments,
      projectIds: collectProjectIds(attachments),
    });
    const nextRows = [...rows];
    nextRows[idx] = updated;
    await replaceTable<ReferenceRow>(KEY, nextRows);
    notify(KEY);
    await syncAttachmentEdges([updated]);
    return updated;
  }

  const created = normalizeReferenceRow({
    id: rowId ?? newId(),
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
    stack: input.stack,
    sourceReferenceId: input.sourceReferenceId,
    stackNodeId: input.stackNodeId,
    stackNodeName: input.stackNodeName,
    projectIds: collectProjectIds([nextAttachment]),
    attachments: [nextAttachment],
    createdAt: now(),
  });
  await replaceTable<ReferenceRow>(KEY, [created, ...rows]);
  notify(KEY);
  await syncAttachmentEdges([created]);
  return created;
}

export async function updateReference(
  referenceId: string,
  patch: Partial<
    Pick<
      ReferenceRow,
      "title" | "source" | "visibility" | "description" | "metadata" | "thumbnailUrl" | "stack" | "attachments" | "projectIds"
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
  await replaceTable<ReferenceRow>(KEY, nextRows);
  notify(KEY);
  return updated;
}

export async function removeReferenceFromProject(referenceId: string, projectId: string): Promise<void> {
  const rows = await listReferences();
  const affected = rows.find((reference) => reference.id === referenceId);
  const nextRows = rows
    .map((reference) => {
      if (reference.id !== referenceId) return reference;
      const attachments = reference.attachments.filter(
        (attachment) => attachment.projectId !== projectId,
      );
      return normalizeReferenceRow({
        ...reference,
        attachments,
        projectIds: collectProjectIds(attachments),
      });
    })
    .filter((reference) => reference.attachments.length > 0);
  await replaceTable<ReferenceRow>(KEY, nextRows);
  notify(KEY);
  // Sync the affected ref's edges to its new (possibly empty → cleared) attachments.
  if (affected) {
    const remaining = affected.attachments.filter((a) => a.projectId !== projectId);
    await syncAttachmentEdges([{ ...affected, attachments: remaining }]);
  }
}

function attachmentMatchesOwner(
  attachment: ReferenceAttachment,
  ownerType: OwnerType,
  ownerId: string,
): boolean {
  if (ownerType === "workspace") {
    return (
      attachment.workspaceId === ownerId &&
      attachment.projectId == null &&
      attachment.screenId === null &&
      attachment.componentId === null
    );
  }
  if (ownerType === "project") {
    return (
      attachment.projectId === ownerId &&
      attachment.screenId === null &&
      attachment.componentId === null
    );
  }
  if (ownerType === "screen") {
    return attachment.screenId === ownerId;
  }
  return attachment.componentId === ownerId;
}

/**
 * Inverse of `attachmentMatchesOwner`: resolve the single owner an attachment is
 * anchored to. Anchor precedence mirrors the `ReferenceAttachment` doc: the most
 * specific set anchor wins (component → screen → project → workspace).
 */
function ownerOfAttachment(
  attachment: ReferenceAttachment,
): { ownerType: OwnerType; ownerId: string } | null {
  if (attachment.componentId) return { ownerType: "component", ownerId: attachment.componentId };
  if (attachment.screenId) return { ownerType: "screen", ownerId: attachment.screenId };
  if (attachment.projectId) return { ownerType: "project", ownerId: attachment.projectId };
  if (attachment.workspaceId) return { ownerType: "workspace", ownerId: attachment.workspaceId };
  return null;
}

export async function removeReferenceFromOwner(
  referenceId: string,
  ownerType: OwnerType,
  ownerId: string,
): Promise<void> {
  const rows = await listReferences();
  const affected = rows.find((reference) => reference.id === referenceId);
  const nextRows = rows
    .map((reference) => {
      if (reference.id !== referenceId) return reference;
      const attachments = reference.attachments.filter(
        (attachment) => !attachmentMatchesOwner(attachment, ownerType, ownerId),
      );
      return normalizeReferenceRow({
        ...reference,
        attachments,
        projectIds: collectProjectIds(attachments),
      });
    })
    .filter((reference) => reference.attachments.length > 0);
  await replaceTable<ReferenceRow>(KEY, nextRows);
  notify(KEY);
  if (affected) {
    const remaining = affected.attachments.filter(
      (a) => !attachmentMatchesOwner(a, ownerType, ownerId),
    );
    await syncAttachmentEdges([{ ...affected, attachments: remaining }]);
  }
}

/** References that may be shared into other locations (linkable, not local copies). */
export async function listLinkableReferences(): Promise<ReferenceRow[]> {
  const rows = await listReferences();
  return rows.filter((reference) => reference.linkable !== false);
}

/**
 * Detach a linked reference at one owner: create an independent local copy owned
 * only by that owner, and drop the link to the master there. Mirrors a
 * component/token detach — the copy is no longer connected to the master. The
 * master row is preserved (it may still be linked elsewhere or live in the
 * library). Works for whole images, stacks, and stack pieces alike.
 */
export async function detachReference(
  referenceId: string,
  ownerType: OwnerType,
  ownerId: string,
): Promise<ReferenceRow | null> {
  const rows = await listReferences();
  const master = rows.find((reference) => reference.id === referenceId);
  if (!master) return null;

  const ownerAttachment =
    master.attachments.find((attachment) =>
      attachmentMatchesOwner(attachment, ownerType, ownerId),
    ) ?? master.attachments[0];
  if (!ownerAttachment) return null;

  const copy = normalizeReferenceRow({
    ...master,
    id: newId(),
    visibility: "local",
    linkable: false,
    detachedFrom: master.id,
    // Resolve the image from the master's underlying blob (see
    // `loadReferenceRowBlob`, which tries `sourceReferenceId` then `id`). A whole
    // -image master has no `sourceReferenceId`, so point it at the master id. This
    // keeps the copy's image alive after the library master row is deleted, as
    // long as the blob file is preserved — see `applyReferenceDeleteDecisions`.
    sourceReferenceId: master.sourceReferenceId ?? master.id,
    attachments: [ownerAttachment],
    projectIds: collectProjectIds([ownerAttachment]),
    createdAt: now(),
  });

  const remaining = master.attachments.filter(
    (attachment) => !attachmentMatchesOwner(attachment, ownerType, ownerId),
  );
  const updatedMaster = normalizeReferenceRow({
    ...master,
    attachments: remaining,
    projectIds: collectProjectIds(remaining),
  });

  const nextRows = rows.map((reference) =>
    reference.id === master.id ? updatedMaster : reference,
  );
  await replaceTable<ReferenceRow>(KEY, [copy, ...nextRows]);
  notify(KEY);
  // The detached copy gets its own `attached_to` edge; the master drops the edge it
  // no longer holds.
  await syncAttachmentEdges([copy, updatedMaster]);
  return copy;
}

export type ReferenceLinkUsage = {
  /** The reference row (whole-image master or a stack-cut card) holding the link. */
  referenceId: string;
  ownerType: OwnerType;
  ownerId: string;
};

/**
 * List every individual place a library reference is linked — one entry per
 * attachment across the whole-image card and its stack-cut cards. Unlike
 * `countReferenceLinkUsages` (which only counts), this drives the per-place
 * keep-a-copy-or-delete dialog required when removing a linkable item used
 * elsewhere (Product.md "Removing a linkable item that is used elsewhere").
 */
export async function listReferenceLinkUsages(
  libraryReferenceId: string,
): Promise<ReferenceLinkUsage[]> {
  const rows = await listReferences();
  const usages: ReferenceLinkUsage[] = [];
  for (const reference of rows) {
    if (
      reference.id !== libraryReferenceId &&
      !reference.id.startsWith(`${libraryReferenceId}::`)
    ) {
      continue;
    }
    // Per-place usage off the `attached_to` edge index (idx_edges_from) — the doc's
    // named win. Falls back to the `attachments[]` mirror if a row's edges aren't
    // reconciled yet (e.g. a fixture written without emitting edges).
    const edges = await listEdges({
      from: { type: "reference", id: reference.id },
      relation: "attached_to",
    });
    if (edges.length > 0) {
      for (const e of edges) {
        usages.push({ referenceId: reference.id, ownerType: e.toType as OwnerType, ownerId: e.toId });
      }
    } else {
      for (const attachment of reference.attachments) {
        const owner = ownerOfAttachment(attachment);
        if (owner) usages.push({ referenceId: reference.id, ...owner });
      }
    }
  }
  return usages;
}

/**
 * Remove every link row derived from a library reference (the whole-image card
 * and all its stack-cut cards). Called when the library master is deleted so no
 * project keeps a dangling link to a blob that no longer exists.
 */
export async function removeReferenceLinksForLibraryId(
  libraryReferenceId: string,
): Promise<void> {
  const rows = await listReferences();
  const removed = rows.filter(
    (reference) =>
      reference.id === libraryReferenceId ||
      reference.id.startsWith(`${libraryReferenceId}::`),
  );
  if (removed.length === 0) return;
  const next = rows.filter((reference) => !removed.includes(reference));
  await replaceTable<ReferenceRow>(KEY, next);
  notify(KEY);
  // Clear the deleted rows' `attached_to` edges.
  await syncAttachmentEdges(removed.map((r) => ({ ...r, attachments: [] })));
}

export async function bulkInsertReferences(rows: ReferenceRow[]): Promise<void> {
  await replaceTable<ReferenceRow>(KEY, rows.map(normalizeReferenceRow));
  notify(KEY);
}
