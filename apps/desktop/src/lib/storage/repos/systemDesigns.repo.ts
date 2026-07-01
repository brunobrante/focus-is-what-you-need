import {
  SYSTEM_DESIGN_CATEGORIES,
  createDefaultSystemDesignTokens,
  emptySystemDesignTokens,
} from "@/domain/system-design/defaults";
import { newId, now } from "@/lib/storage/ids";
import type {
  AnySystemDesignToken,
  SystemDesignCategory,
  SystemDesignOwnerScope,
  SystemDesignRow,
  SystemDesignTokens,
  TokenRow,
} from "@/lib/storage/schema";
import {
  TABLES,
  getRecordById,
  listTable,
  peekTable,
  putRecord,
  removeRecords,
} from "@/lib/storage/store";
import { deleteComponentTree } from "@/lib/storage/repos/components.repo";
import { setComponentOwner } from "@/application/graph/ownership";

const KEY = TABLES.systemDesigns;
const TOKENS_KEY = TABLES.tokens;

// ─── Tokens-as-rows (Architecture.md, Storage ownership) ─────────────────────────────
// Tokens are persisted as one `TokenRow` per token in the `tokens` table, never
// nested on the design row. The repo is the only place that bridges the two:
// `assembleTokens` rebuilds the in-memory `SystemDesignRow.tokens` view on read,
// and `reconcileTokenRows` splits it back into per-row writes on save.

/** Rebuild a design's `SystemDesignTokens` view from its persisted `TokenRow`s. */
function assembleTokens(
  designId: string,
  allTokenRows: TokenRow[],
): SystemDesignTokens {
  const out = emptySystemDesignTokens();
  const owned = allTokenRows
    .filter((row) => row.systemDesignId === designId)
    .sort((a, b) => a.order - b.order);
  for (const row of owned) {
    // Shallow-copy so the cached row object is never aliased into editable state.
    (out[row.category] as AnySystemDesignToken[]).push({ ...row.token });
  }
  return out;
}

/**
 * Persist a design's tokens as one `TokenRow` per token. A row id is reused when
 * the same `(category, token.id)` is still present (so its envelope/rev and
 * `createdAt` survive an edit); tokens that disappeared are deleted. Unchanged
 * tokens are skipped so a save touches O(changed) rows, not the whole set.
 */
function reconcileTokenRows(design: SystemDesignRow): void {
  const existing = peekTable<TokenRow>(TOKENS_KEY).filter(
    (row) => row.systemDesignId === design.id,
  );
  const byKey = new Map(
    existing.map((row) => [`${row.category}:${row.token.id}`, row] as const),
  );
  const keptRowIds = new Set<string>();
  const t = now();

  for (const category of SYSTEM_DESIGN_CATEGORIES) {
    const tokens = design.tokens[category] as AnySystemDesignToken[];
    tokens.forEach((token, order) => {
      const prev = byKey.get(`${category}:${token.id}`);
      const rowId = prev?.id ?? newId();
      keptRowIds.add(rowId);
      if (
        prev &&
        prev.order === order &&
        JSON.stringify(prev.token) === JSON.stringify(token)
      ) {
        return; // no change — skip the write
      }
      putRecord<TokenRow>(TOKENS_KEY, {
        id: rowId,
        systemDesignId: design.id,
        category,
        order,
        token,
        createdAt: prev?.createdAt ?? t,
        updatedAt: t,
      });
    });
  }

  const removed = existing
    .filter((row) => !keptRowIds.has(row.id))
    .map((row) => row.id);
  if (removed.length > 0) removeRecords(TOKENS_KEY, removed);
}

/** Row ids of every `TokenRow` owned by the given designs. */
function tokenRowIdsForDesigns(designIds: Iterable<string>): string[] {
  const ids = new Set(designIds);
  return peekTable<TokenRow>(TOKENS_KEY)
    .filter((row) => ids.has(row.systemDesignId))
    .map((row) => row.id);
}

/**
 * Backing component ids of the *owned* icon tokens of the given designs. Linked
 * instances (`instanceOf`) are skipped — their backing belongs to the master's
 * design, not here — so deleting a project design never removes a workspace
 * icon's art.
 */
function iconBackingIdsForDesigns(designIds: Iterable<string>): string[] {
  const ids = new Set(designIds);
  return peekTable<TokenRow>(TOKENS_KEY)
    .filter((row) => ids.has(row.systemDesignId) && row.category === "icons")
    .map((row) => row.token as { backingComponentId?: string; instanceOf?: unknown })
    .filter((token) => !token.instanceOf && Boolean(token.backingComponentId))
    .map((token) => token.backingComponentId!);
}

/** Persist the design row itself, with `tokens` stripped (tokens are rows). */
function persistDesignRow(design: SystemDesignRow): void {
  const { tokens: _tokens, ...rest } = design;
  putRecord(KEY, rest as { id: string } & Record<string, unknown>);
}

/**
 * Backfill a persisted design row's scalar fields to the current shape. (A
 * SCHEMA_VERSION bump nukes and reseeds, so this only ever sees current-shaped
 * rows; it stays defensive.) Tokens are NOT on the row anymore — they live in the
 * `tokens` table — so `tokens` is returned empty here and overlaid by
 * `assembleTokens` in the read paths below.
 */
export function normalizeSystemDesignRow(raw: SystemDesignRow): SystemDesignRow {
  const candidate = raw as Partial<SystemDesignRow>;
  const t = candidate.createdAt ?? now();
  return {
    id: raw.id,
    name: candidate.name || "Design system",
    ownerScope: candidate.ownerScope ?? "workspace",
    ownerId: candidate.ownerId ?? "",
    inheritsFromId: candidate.inheritsFromId ?? null,
    tokens: emptySystemDesignTokens(),
    createdAt: t,
    updatedAt: candidate.updatedAt ?? t,
  };
}

export async function listSystemDesigns(): Promise<SystemDesignRow[]> {
  const [rows, tokenRows] = await Promise.all([
    listTable<SystemDesignRow>(KEY),
    listTable<TokenRow>(TOKENS_KEY),
  ]);
  return rows.map((raw) => {
    const base = normalizeSystemDesignRow(raw);
    return { ...base, tokens: assembleTokens(base.id, tokenRows) };
  });
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
      const extraIds = extras.map((row) => row.id);
      removeRecords(KEY, extraIds);
      const orphanTokenIds = tokenRowIdsForDesigns(extraIds);
      if (orphanTokenIds.length > 0) removeRecords(TOKENS_KEY, orphanTokenIds);
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
      persistDesignRow(next); // link-only change; tokens unchanged
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
  reconcileTokenRows(created);
  persistDesignRow(created);
  return created;
}

/** Persist a whole design row (fire-and-forget, optimistic). */
export function saveSystemDesign(row: SystemDesignRow): SystemDesignRow {
  const next: SystemDesignRow = { ...row, updatedAt: now() };
  reconcileTokenRows(next);
  persistDesignRow(next);
  return next;
}

export async function getSystemDesign(id: string): Promise<SystemDesignRow | null> {
  const raw = await getRecordById<SystemDesignRow>(KEY, id);
  if (!raw) return null;
  const tokenRows = await listTable<TokenRow>(TOKENS_KEY);
  return { ...normalizeSystemDesignRow(raw), tokens: assembleTokens(id, tokenRows) };
}

export function deleteSystemDesign(id: string): void {
  // Cascade the icon backings first (each owned icon token owns a backing
  // component holding its editable art) so the components/variants/scenes don't
  // leak when their token rows disappear. Fire-and-forget: the async subtree
  // removal can trail the synchronous row deletes.
  const backingIds = iconBackingIdsForDesigns([id]);
  removeRecords(KEY, [id]);
  const tokenIds = tokenRowIdsForDesigns([id]);
  if (tokenIds.length > 0) removeRecords(TOKENS_KEY, tokenIds);
  for (const backingId of backingIds) {
    void (async () => {
      await setComponentOwner(backingId, null);
      await deleteComponentTree(backingId);
    })();
  }
}

type LinkableToken = {
  id: string;
  linkable?: boolean;
  instanceOf?: { systemDesignId: string; tokenId: string } | null;
};

export type TokenLinkUsage = { designId: string; projectId: string };

/** Project designs that hold a linked instance of a given workspace token. */
export async function listTokenLinkUsages(
  category: SystemDesignCategory,
  tokenId: string,
): Promise<TokenLinkUsage[]> {
  const rows = await listSystemDesigns();
  const out: TokenLinkUsage[] = [];
  for (const row of rows) {
    if (row.ownerScope !== "project") continue;
    const list = row.tokens[category] as LinkableToken[];
    if (list.some((t) => t.instanceOf && t.instanceOf.tokenId === tokenId)) {
      out.push({ designId: row.id, projectId: row.ownerId });
    }
  }
  return out;
}

export type TokenLinkDecision = { designId: string; action: "copy" | "delete" };

/**
 * Apply per-project copy/delete decisions when a workspace token is unlinked.
 * "copy" detaches the project's linked instance into a local token holding the
 * master's current values; "delete" removes it. `masterToken` is the workspace
 * token providing the copy values.
 */
export async function applyTokenLinkDecisions(
  category: SystemDesignCategory,
  tokenId: string,
  masterToken: LinkableToken & Record<string, unknown>,
  decisions: TokenLinkDecision[],
): Promise<void> {
  for (const decision of decisions) {
    const row = await getSystemDesign(decision.designId);
    if (!row) continue;
    const list = row.tokens[category] as LinkableToken[];
    const nextList =
      decision.action === "delete"
        ? list.filter((t) => !(t.instanceOf && t.instanceOf.tokenId === tokenId))
        : list.map((t) => {
            if (!(t.instanceOf && t.instanceOf.tokenId === tokenId)) return t;
            const { instanceOf: _i, linkable: _l, ...rest } = { ...masterToken, id: t.id };
            return rest as LinkableToken;
          });
    saveSystemDesign({
      ...row,
      tokens: { ...row.tokens, [category]: nextList } as SystemDesignTokens,
    });
  }
}
