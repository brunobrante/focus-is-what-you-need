import type {
  IconRow,
  SceneRow,
  ThumbnailRow,
  VariantRow,
} from "@/lib/storage/schema";
import type { EntityRef } from "@/domain/graph/edges";
import { newId, now } from "@/lib/storage/ids";
import {
  TABLES,
  getRecordById,
  listTable,
  notify,
  putRecord,
  removeRecords,
  replaceTable,
} from "@/lib/storage/store";
import { setOwner } from "@/lib/storage/repos/edges.repo";
import { upsertScene } from "@/lib/storage/repos/scenes.repo";
import {
  createBlankHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";

// The IconRow master (EntityType "icon"): a first-class editable subject parallel
// to screens/components. It owns a single art variant (ownerKind "icon") whose
// scene holds the icon's editable vector art. Ownership is the incoming `owns`
// edge (workspace/project) — or absent for a draft icon — exactly like a
// component. Never confused with a component: icons live in their own table, so
// no component browser or linkable picker ever surfaces them.

const KEY = TABLES.icons;
const VARIANTS_KEY = TABLES.variants;

export async function listIcons(): Promise<IconRow[]> {
  return listTable<IconRow>(KEY);
}

export async function getIcon(id: string): Promise<IconRow | null> {
  return getRecordById<IconRow>(KEY, id);
}

/** Persist an icon row (row envelope handled by the store). */
export function putIcon(row: IconRow): void {
  putRecord<IconRow>(KEY, row);
}

/**
 * Create an icon master: an `IconRow` + its Default art variant (ownerKind
 * "icon") owning a scene, plus the incoming `owns` edge (null owner = a draft
 * icon). `sceneGraphJSON` seeds the art (the application layer builds it — a
 * transparent artboard, optionally pre-filled with imported SVG); when omitted a
 * blank frame at `size` is seeded so the icon opens at its intrinsic box.
 */
export async function createIcon(input: {
  owner: EntityRef | null;
  name: string;
  size: { width: number; height: number };
  svg?: string | null;
  viewBox?: { width: number; height: number } | null;
  sceneGraphJSON?: string;
  workspaceId?: string | null;
  projectId?: string | null;
}): Promise<{ icon: IconRow; variant: VariantRow }> {
  const t = now();
  const iconId = newId();
  const variantId = newId();

  const variant: VariantRow = {
    id: variantId,
    ownerKind: "icon",
    ownerId: iconId,
    name: "Default",
    order: 0,
    seedKey: null,
    createdAt: t,
    updatedAt: t,
  };

  const icon: IconRow = {
    id: iconId,
    name: input.name.trim() || "Icon",
    svg: input.svg ?? null,
    viewBox: input.viewBox ?? { width: input.size.width, height: input.size.height },
    workspaceId: input.workspaceId ?? null,
    projectId: input.projectId ?? null,
    activeVariantId: variantId,
    createdAt: t,
    updatedAt: t,
  };

  const variants = await listTable<VariantRow>(VARIANTS_KEY);
  await replaceTable<VariantRow>(VARIANTS_KEY, [variant, ...variants]);
  putIcon(icon);
  notify(VARIANTS_KEY);

  // Owner edge — the single source of ownership (workspace/project, or none for a
  // draft). Mirrors `setComponentOwner` but targets the icon entity.
  await setOwner(input.owner, { type: "icon", id: iconId });

  const graphJSON =
    input.sceneGraphJSON ??
    serializeHtmlCanvasDocument(
      createBlankHtmlCanvasDocument({
        name: icon.name,
        width: input.size.width,
        height: input.size.height,
      }),
    );
  await upsertScene(
    { ownerType: "variant", ownerId: variantId, graphJSON },
    { propagate: false },
  );

  return { icon, variant };
}

/** Refresh an icon's cached art (`svg`/`viewBox`), serialized from its scene. */
export async function updateIconArt(
  id: string,
  patch: { svg?: string | null; viewBox?: { width: number; height: number } | null },
): Promise<IconRow | null> {
  const icon = await getIcon(id);
  if (!icon) return null;
  const next: IconRow = {
    ...icon,
    svg: patch.svg !== undefined ? patch.svg : icon.svg,
    viewBox: patch.viewBox !== undefined ? patch.viewBox : icon.viewBox,
    updatedAt: now(),
  };
  putIcon(next);
  return next;
}

/**
 * Delete an icon master and everything it owns: its art variant(s), their
 * scene/thumbnail rows, and the `owns` edge. Safe to call with a stale id.
 */
export async function deleteIcon(id: string): Promise<void> {
  const icon = await getIcon(id);
  const variants = await listTable<VariantRow>(VARIANTS_KEY);
  const ownedVariantIds = new Set(
    variants.filter((v) => v.ownerKind === "icon" && v.ownerId === id).map((v) => v.id),
  );

  // Tombstone the owner edge first (idempotent), then drop the rows.
  await setOwner(null, { type: "icon", id });

  if (ownedVariantIds.size > 0) {
    await replaceTable<VariantRow>(
      VARIANTS_KEY,
      variants.filter((v) => !ownedVariantIds.has(v.id)),
    );
    const scenes = await listTable<SceneRow>(TABLES.scenes);
    removeRecords(
      TABLES.scenes,
      scenes
        .filter((s) => s.ownerType === "variant" && ownedVariantIds.has(s.ownerId))
        .map((s) => s.id),
    );
    const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
    removeRecords(
      TABLES.thumbnails,
      thumbnails
        .filter((t) => t.ownerType === "variant" && ownedVariantIds.has(t.ownerId))
        .map((t) => t.id),
    );
    notify(VARIANTS_KEY);
    notify(TABLES.scenes);
    notify(TABLES.thumbnails);
  }

  if (icon) removeRecords(KEY, [id]);
}

/** Loose icons (no owner edge) — the Draft icons, shown on the Drafts page. */
export async function listDraftIcons(): Promise<IconRow[]> {
  const rows = await listIcons();
  return rows
    .filter((r) => !r.workspaceId && !r.projectId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
