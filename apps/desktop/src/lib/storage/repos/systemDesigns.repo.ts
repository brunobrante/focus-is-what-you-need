import {
  createDefaultSystemDesignTokens,
  emptySystemDesignTokens,
} from "@/domain/system-design/defaults";
import { newId, now } from "@/lib/storage/ids";
import type {
  SystemDesignOwnerScope,
  SystemDesignRow,
  SystemDesignTokens,
} from "@/lib/storage/schema";
import {
  TABLES,
  getRecordById,
  listTable,
  putRecord,
  removeRecords,
} from "@/lib/storage/store";

const KEY = TABLES.systemDesigns;

/**
 * Backfill any persisted row to the current shape. (A SCHEMA_VERSION bump nukes
 * and reseeds, so this only ever sees current-shaped rows; it stays defensive.)
 * - Rows with `tokens` pass through, with every category present.
 * - Rows with no tokens reset to a fresh default design, keeping identity/owner.
 */
export function normalizeSystemDesignRow(raw: SystemDesignRow): SystemDesignRow {
  const candidate = raw as Partial<SystemDesignRow>;
  const ownerScope = candidate.ownerScope ?? "workspace";

  if (candidate.tokens) {
    return {
      ...(raw as SystemDesignRow),
      ownerScope,
      inheritsFromId: candidate.inheritsFromId ?? null,
      tokens: { ...emptySystemDesignTokens(), ...candidate.tokens },
    };
  }

  const t = candidate.createdAt ?? now();
  return {
    id: raw.id,
    name: candidate.name || "Design system",
    ownerScope,
    ownerId: candidate.ownerId ?? "",
    inheritsFromId: null,
    tokens: createDefaultSystemDesignTokens(),
    createdAt: t,
    updatedAt: candidate.updatedAt ?? t,
  };
}

export async function listSystemDesigns(): Promise<SystemDesignRow[]> {
  const rows = await listTable<SystemDesignRow>(KEY);
  return rows.map(normalizeSystemDesignRow);
}

/** The single design owned by a workspace or project, or null if none yet. */
export async function getSystemDesignByOwner(
  ownerScope: SystemDesignOwnerScope,
  ownerId: string,
): Promise<SystemDesignRow | null> {
  const rows = await listSystemDesigns();
  const owned = rows
    .filter((row) => row.ownerScope === ownerScope && row.ownerId === ownerId)
    .sort((a, b) => a.createdAt - b.createdAt);
  return owned[0] ?? null;
}

/**
 * Return the owner's design, creating it lazily on first access.
 *
 * A workspace design starts with the seed tokens. A project design inside a
 * workspace starts with `initialTokens` (the linked instances of the workspace
 * tokens it chose to link, built by the caller), or empty if none. A project
 * with no workspace gets its own seed tokens.
 *
 * Extra rows for the same owner (the old model allowed many) are pruned so each
 * owner ends up with exactly one design.
 */
export async function getOrCreateSystemDesignByOwner(input: {
  ownerScope: SystemDesignOwnerScope;
  ownerId: string;
  name?: string;
  inheritsFromId?: string | null;
  initialTokens?: SystemDesignTokens;
}): Promise<SystemDesignRow> {
  const rows = await listSystemDesigns();
  const owned = rows
    .filter((row) => row.ownerScope === input.ownerScope && row.ownerId === input.ownerId)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (owned.length > 0) {
    const [primary, ...extras] = owned;
    if (extras.length > 0) {
      removeRecords(KEY, extras.map((row) => row.id));
    }
    // Keep the parent link fresh for project designs (the project may have
    // joined or left a workspace since the design was created).
    if (
      input.ownerScope === "project" &&
      input.inheritsFromId !== undefined &&
      primary!.inheritsFromId !== input.inheritsFromId
    ) {
      const next: SystemDesignRow = {
        ...primary!,
        inheritsFromId: input.inheritsFromId ?? null,
        updatedAt: now(),
      };
      putRecord(KEY, next);
      return next;
    }
    return primary!;
  }

  const hasParent =
    input.ownerScope === "project" && Boolean(input.inheritsFromId);
  const t = now();
  const created: SystemDesignRow = {
    id: newId(),
    name:
      input.name ??
      (input.ownerScope === "workspace" ? "Workspace system" : "Project system"),
    ownerScope: input.ownerScope,
    ownerId: input.ownerId,
    inheritsFromId:
      input.ownerScope === "project" ? input.inheritsFromId ?? null : null,
    // A project with a workspace owns only the linked instances the caller seeds
    // (possibly none); everything else starts from the seed set.
    tokens: hasParent
      ? input.initialTokens ?? emptySystemDesignTokens()
      : createDefaultSystemDesignTokens(),
    createdAt: t,
    updatedAt: t,
  };
  putRecord(KEY, created);
  return created;
}

/** Persist a whole design row (fire-and-forget, optimistic). */
export function saveSystemDesign(row: SystemDesignRow): SystemDesignRow {
  const next: SystemDesignRow = { ...row, updatedAt: now() };
  putRecord(KEY, next);
  return next;
}

export async function getSystemDesign(id: string): Promise<SystemDesignRow | null> {
  const raw = await getRecordById<SystemDesignRow>(KEY, id);
  return raw ? normalizeSystemDesignRow(raw) : null;
}

export function deleteSystemDesign(id: string): void {
  removeRecords(KEY, [id]);
}
