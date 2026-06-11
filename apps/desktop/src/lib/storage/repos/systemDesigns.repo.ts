import {
  createDefaultSystemDesignTokens,
  emptyExcludedShared,
  emptySystemDesignTokens,
} from "@/domain/system-design/defaults";
import { newId, now } from "@/lib/storage/ids";
import type {
  SystemDesignExclusions,
  SystemDesignOwnerScope,
  SystemDesignRow,
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
 * Upgrade any persisted row to the current shape.
 * - Current rows (have `tokens` + `excludedShared`) pass through, backfilled.
 * - Interim rows (the short-lived per-category `inherit` model) keep workspace
 *   tokens but drop project-local tokens, which were seed copies that would
 *   otherwise duplicate the inherited ones.
 * - Legacy rows (schema ≤ 15, no tokens) reset to a fresh default design while
 *   keeping their identity and ownership.
 */
export function normalizeSystemDesignRow(raw: SystemDesignRow): SystemDesignRow {
  const candidate = raw as Partial<SystemDesignRow> & { excludedShared?: unknown };
  const ownerScope = candidate.ownerScope ?? "workspace";

  if (candidate.tokens && candidate.excludedShared) {
    return {
      ...(raw as SystemDesignRow),
      inheritsFromId: candidate.inheritsFromId ?? null,
      excludedShared: { ...emptyExcludedShared(), ...candidate.excludedShared },
      tokens: { ...emptySystemDesignTokens(), ...candidate.tokens },
    };
  }

  if (candidate.tokens) {
    // Interim shape: keep workspace tokens, discard project seed copies.
    return {
      id: raw.id,
      name: candidate.name || "Design system",
      ownerScope,
      ownerId: candidate.ownerId ?? "",
      inheritsFromId: candidate.inheritsFromId ?? null,
      excludedShared: emptyExcludedShared(),
      tokens:
        ownerScope === "project"
          ? emptySystemDesignTokens()
          : { ...emptySystemDesignTokens(), ...candidate.tokens },
      createdAt: candidate.createdAt ?? now(),
      updatedAt: candidate.updatedAt ?? now(),
    };
  }

  const t = candidate.createdAt ?? now();
  return {
    id: raw.id,
    name: candidate.name || "Design system",
    ownerScope,
    ownerId: candidate.ownerId ?? "",
    inheritsFromId: null,
    excludedShared: emptyExcludedShared(),
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
 * workspace starts empty (it shows the workspace tokens via inheritance), with
 * `initialExcludedShared` deciding which workspace tokens are hidden up front. A
 * project with no workspace gets its own seed tokens.
 *
 * Extra rows for the same owner (the old model allowed many) are pruned so each
 * owner ends up with exactly one design.
 */
export async function getOrCreateSystemDesignByOwner(input: {
  ownerScope: SystemDesignOwnerScope;
  ownerId: string;
  name?: string;
  inheritsFromId?: string | null;
  initialExcludedShared?: SystemDesignExclusions;
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
    excludedShared: input.initialExcludedShared ?? emptyExcludedShared(),
    // A project with a workspace shows the inherited tokens, so it owns none
    // initially; everything else starts from the seed set.
    tokens: hasParent
      ? emptySystemDesignTokens()
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
