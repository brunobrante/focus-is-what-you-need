import type { SavedComponent, ToolReference, CropBox, CutVariant, CutVariantTool } from "./types";
import { CUT_MATCH_IOU_THRESHOLD, HIERARCHY_MIN_AREA_DELTA } from "../types";
import { intersectCropBoxes } from "./geometry";
import { clamp } from "./geometry";
import { blobToDataUrl, dataUrlToBlob, safeStackFileName } from "./image";
import { cutVariants, resolveActiveVariantId, ORIGINAL_VARIANT_ID } from "./variants";
import {
  extFromName,
  loadReferenceStackFile,
  removeReferenceStack,
  writeReferenceStackBatch,
  readReferenceStackData,
} from "@/lib/tauri/referenceStorage";
import {
  listReferenceLibraryMeta,
  putReferenceLibraryMeta,
} from "@/lib/storage/repos/referenceLibrary.repo";
import {
  stackSummaryFromData,
  type ReferenceStackData,
  type ReferenceStackRoot,
} from "@/lib/references/stackTypes";

const REFERENCE_STACK_IO_CONCURRENCY = 3;

// On-disk PNG name for a single variant of a cut, e.g. `c-abcd__v-1234.png`.
function variantStackFileName(cutId: string, variantId: string): string {
  return safeStackFileName(`${cutId}__${variantId}`);
}

export function sourceRootComponentId(sourceId: string) {
  return `root-${sourceId}`;
}

// Additional (non-default) roots get this prefix so they never collide with the
// implicit full-image default root id (`root-${referenceId}`) or with cuts (`c-…`).
export function newRootComponentId() {
  return `root-r${Math.random().toString(36).slice(2, 9)}`;
}

export function createRootComponent(item: ToolReference): SavedComponent {
  return {
    id: sourceRootComponentId(item.id),
    name: "root",
    box: { x: 0, y: 0, w: item.w || 0, h: item.h || 0 },
    dataUrl: item.url,
    type: item.type || "IMG",
    createdAt: new Date(0).toISOString(),
    parentId: null,
    kind: "root",
    rootId: sourceRootComponentId(item.id),
    isDefaultRoot: true,
  };
}

function cropBoxArea(box: CropBox) {
  return Math.max(0, box.w) * Math.max(0, box.h);
}

function cropBoxTolerance(a: CropBox, b: CropBox) {
  const smallestEdge = Math.max(1, Math.min(a.w, a.h, b.w, b.h));
  return clamp(Math.round(smallestEdge * 0.012), 2, 14);
}

// More generous tolerance used to decide if a box is contained inside another.
// Allows for "logical" parent-child relationships where the child slightly
// overshoots the parent's edges (rounded corners, floating overlays, small
// drawing imprecisions, elements that visually span two adjacent containers).
function cropBoxContainmentTolerance(parent: CropBox, child: CropBox) {
  const childSmallest = Math.max(1, Math.min(child.w, child.h));
  const parentSmallest = Math.max(1, Math.min(parent.w, parent.h));
  const tolerance = Math.max(
    8, // base minimum so small overshoots always pass
    childSmallest * 0.35, // half-edge of the child (catches floating overlays)
    parentSmallest * 0.08, // proportional to parent for bigger scenes
  );
  // Cap so a child can't "drift" arbitrarily far and still count as inside.
  return Math.min(tolerance, parentSmallest * 0.4);
}

function cropBoxIoU(a: CropBox, b: CropBox) {
  const intersection = intersectCropBoxes(a, b);
  if (!intersection) return 0;
  const intersectionArea = cropBoxArea(intersection);
  const unionArea = cropBoxArea(a) + cropBoxArea(b) - intersectionArea;
  if (unionArea <= 0) return 0;
  return intersectionArea / unionArea;
}

function boxesRepresentSameCut(a: CropBox, b: CropBox) {
  const tolerance = cropBoxTolerance(a, b);
  const edgesWithinTolerance =
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.x + a.w - (b.x + b.w)) <= tolerance &&
    Math.abs(a.y + a.h - (b.y + b.h)) <= tolerance;

  if (edgesWithinTolerance) return true;

  const widthRatio = Math.min(a.w, b.w) / Math.max(a.w, b.w);
  const heightRatio = Math.min(a.h, b.h) / Math.max(a.h, b.h);
  return cropBoxIoU(a, b) >= CUT_MATCH_IOU_THRESHOLD && widthRatio >= 0.86 && heightRatio >= 0.86;
}

export function isSpatialParent(parent: CropBox, child: CropBox) {
  if (boxesRepresentSameCut(parent, child)) return false;

  const containmentTolerance = cropBoxContainmentTolerance(parent, child);
  const parentRight = parent.x + parent.w;
  const parentBottom = parent.y + parent.h;
  const childRight = child.x + child.w;
  const childBottom = child.y + child.h;
  const contains =
    child.x >= parent.x - containmentTolerance &&
    child.y >= parent.y - containmentTolerance &&
    childRight <= parentRight + containmentTolerance &&
    childBottom <= parentBottom + containmentTolerance;

  if (!contains) return false;

  // Use strict tolerance for the area-delta check so we don't accidentally
  // pair boxes that are basically the same cut once you account for the
  // generous containment slack above.
  const strictTolerance = cropBoxTolerance(parent, child);
  const areaDelta = cropBoxArea(parent) - cropBoxArea(child);
  return areaDelta > Math.max(HIERARCHY_MIN_AREA_DELTA, strictTolerance * strictTolerance);
}

export function findSpatialParent(
  component: SavedComponent,
  items: SavedComponent[],
  rootId: string,
): SavedComponent | null {
  const root = items.find((item) => item.id === rootId) ?? null;
  const candidates = [...items].sort((a, b) => cropBoxArea(a.box) - cropBoxArea(b.box));
  return findSpatialParentFromSortedCandidates(component, candidates, root);
}

export function componentAreaAlreadyExists(
  box: CropBox,
  components: SavedComponent[],
  rootId: string,
) {
  return components.some((component) => {
    if (component.id === rootId) return false;
    return boxesRepresentSameCut(box, component.box);
  });
}

export function rebuildComponentHierarchy(items: SavedComponent[], rootId: string): SavedComponent[] {
  const root = items.find((item) => item.id === rootId);
  if (!root) return items;
  const candidatesBySmallestArea = [...items].sort((a, b) => cropBoxArea(a.box) - cropBoxArea(b.box));

  return items.map((item) => {
    if (item.id === rootId) return { ...item, parentId: null };
    const parent = findSpatialParentFromSortedCandidates(item, candidatesBySmallestArea, root);
    return { ...item, parentId: parent?.id ?? rootId };
  });
}

// Multi-root spatial rebuild. Cuts are partitioned by their owning root (`rootId`)
// and parent inference runs ONLY against members of the same root, so two roots
// that overlap on the original image never steal each other's children.
export function rebuildAllRoots(items: SavedComponent[], defaultRootId: string): SavedComponent[] {
  const roots = items.filter((entry) => entry.parentId == null);
  const rootIds = new Set(roots.map((root) => root.id));
  if (!rootIds.has(defaultRootId) && roots[0]) defaultRootId = roots[0].id;

  const groups = new Map<string, SavedComponent[]>();
  for (const root of roots) groups.set(root.id, [root]);

  for (const entry of items) {
    if (entry.parentId == null) continue;
    const rid = entry.rootId && rootIds.has(entry.rootId) ? entry.rootId : defaultRootId;
    (groups.get(rid) ?? groups.get(defaultRootId))?.push(entry);
  }

  const rebuiltById = new Map<string, SavedComponent>();
  for (const [rid, group] of groups) {
    const rebuilt = rebuildComponentHierarchy(group, rid);
    for (const entry of rebuilt) {
      rebuiltById.set(entry.id, {
        ...entry,
        rootId: entry.parentId == null ? entry.id : rid,
        kind: entry.parentId == null ? "root" : "cut",
      });
    }
  }

  return items.map((entry) => rebuiltById.get(entry.id) ?? entry);
}

function findSpatialParentFromSortedCandidates(
  component: SavedComponent,
  sortedCandidates: SavedComponent[],
  root: SavedComponent | null,
): SavedComponent | null {
  for (const candidate of sortedCandidates) {
    if (candidate.id === component.id) continue;
    if (isSpatialParent(candidate.box, component.box)) return candidate;
  }
  return root;
}

export function ensureRootComponent(items: SavedComponent[], item: ToolReference): SavedComponent[] {
  const defaultRoot = createRootComponent(item);

  // 1. Upsert the implicit full-image default root. If the default-id root has been
  // redefined (trimmed) into a real root, preserve its box/dataUrl/name instead of
  // pinning it back to the full image — the original is not necessarily the root.
  let hasDefault = false;
  let normalized = items.map((entry) => {
    if (entry.id !== defaultRoot.id) return entry;
    hasDefault = true;
    if (entry.isDefaultRoot === false) {
      return { ...entry, parentId: null, kind: "root" as const, rootId: defaultRoot.id };
    }
    return {
      ...entry,
      name: "root",
      box: defaultRoot.box,
      dataUrl: defaultRoot.dataUrl,
      type: defaultRoot.type,
      parentId: null,
      kind: "root" as const,
      rootId: defaultRoot.id,
      isDefaultRoot: true,
    };
  });
  if (!hasDefault) normalized = [defaultRoot, ...normalized];

  // 2. Every parentless node is a root that owns its own stack.
  normalized = normalized.map((entry) =>
    entry.parentId == null
      ? { ...entry, parentId: null, kind: "root" as const, rootId: entry.id }
      : entry,
  );

  const rootIds = new Set(
    normalized.filter((entry) => entry.parentId == null).map((entry) => entry.id),
  );
  const byId = new Map(normalized.map((entry) => [entry.id, entry]));

  const resolveRootForCut = (entry: SavedComponent): string => {
    if (entry.rootId && rootIds.has(entry.rootId)) return entry.rootId;
    let current: SavedComponent | undefined = entry;
    let guard = 0;
    while (current && guard < normalized.length) {
      if (current.parentId == null) {
        return rootIds.has(current.id) ? current.id : defaultRoot.id;
      }
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
      guard += 1;
    }
    return defaultRoot.id;
  };

  // 3. Assign each cut's owning root and guarantee its parent still resolves.
  normalized = normalized.map((entry) => {
    if (entry.parentId == null) return entry;
    const rid = resolveRootForCut(entry);
    const parentExists = Boolean(entry.parentId && byId.has(entry.parentId) && entry.parentId !== entry.id);
    return { ...entry, kind: "cut" as const, rootId: rid, parentId: parentExists ? entry.parentId : rid };
  });

  // 4. Re-infer spatial nesting within each root group.
  return rebuildAllRoots(normalized, defaultRoot.id);
}

export function referenceStackDataFromComponents(input: {
  item: ToolReference;
  components: SavedComponent[];
  rootComponentId: string;
  primaryComponentId: string;
  mediaKind?: ReferenceStackData["mediaKind"];
}): ReferenceStackData {
  const updatedAt = new Date().toISOString();
  const defaultRootId = input.rootComponentId;
  const roots = input.components.filter((component) => component.parentId == null);
  const cuts = input.components.filter((component) => component.parentId != null);
  // The user-chosen main screen wins; otherwise fall back to the caller's value
  // (the default root). Persisted as `primaryComponentId` so the card front and
  // the lightbox both open on it.
  const primaryComponentId = roots.find((root) => root.isPrimaryRoot)?.id ?? input.primaryComponentId;

  return {
    version: 2,
    referenceId: input.item.id,
    mediaKind: input.mediaKind ?? "image",
    original: {
      name: input.item.name,
      type: input.item.type || "IMG",
      ext: extFromName(input.item.name),
      w: input.item.w,
      h: input.item.h,
    },
    roots: roots.map((root): ReferenceStackRoot => {
      const isDefault = root.isDefaultRoot ?? root.id === defaultRootId;
      return {
        id: root.id,
        name: isDefault ? "root" : root.name,
        box: root.box,
        file: isDefault ? null : safeStackFileName(root.id),
        isDefault,
        createdAt: root.createdAt || updatedAt,
      };
    }),
    // Legacy single-root fields kept for v1 readers.
    rootComponentId: defaultRootId,
    primaryComponentId,
    components: cuts.map((component) => {
      const variants = cutVariants(component);
      const activeId = resolveActiveVariantId(component);
      const variantRecords = variants.map((variant) => ({
        id: variant.id,
        tool: variant.tool,
        file: variantStackFileName(component.id, variant.id),
        createdAt: variant.createdAt || component.createdAt || updatedAt,
      }));
      const activeRecord = variantRecords.find((record) => record.id === activeId) ?? variantRecords[0];
      return {
        id: component.id,
        name: component.name,
        type: component.type || "PNG",
        box: component.box,
        // Legacy field: points at the active variant's file so older readers and
        // the rest of the app that reads `file` still get the main image.
        file: activeRecord ? activeRecord.file : safeStackFileName(component.id),
        parentId: component.parentId ?? component.rootId ?? defaultRootId,
        rootId: component.rootId ?? defaultRootId,
        createdAt: component.createdAt || updatedAt,
        variants: variantRecords,
        activeVariantId: activeId,
      };
    }),
    updatedAt,
  };
}

export async function updateReferenceStackMeta(
  referenceId: string,
  data: ReferenceStackData | null,
): Promise<void> {
  const summary = stackSummaryFromData(data);
  const metas = await listReferenceLibraryMeta().catch(() => []);
  const target = metas.find((meta) => meta.id === referenceId);
  if (!target) return;
  putReferenceLibraryMeta({
    ...target,
    stack: summary,
    tags: summary?.enabled
      ? Array.from(new Set([...(target.tags ?? []), "stack"]))
      : (target.tags ?? []).filter((tag) => tag !== "stack"),
  });
}

export async function writeReferenceStackFromComponents(input: {
  item: ToolReference;
  components: SavedComponent[];
  rootComponentId: string;
  primaryComponentId: string;
}): Promise<ReferenceStackData | null> {
  const components = ensureRootComponent(input.components, input.item);
  // Persist one PNG per cut variant and one PNG per non-default root (the default
  // root's pixels are the original image, so it needs no file).
  const fileSources: Array<{ fileName: string; dataUrl: string }> = [];
  for (const component of components) {
    if (component.parentId == null) {
      if (component.isDefaultRoot) continue;
      fileSources.push({ fileName: safeStackFileName(component.id), dataUrl: component.dataUrl });
    } else {
      for (const variant of cutVariants(component)) {
        fileSources.push({
          fileName: variantStackFileName(component.id, variant.id),
          dataUrl: variant.dataUrl,
        });
      }
    }
  }

  if (fileSources.length === 0) {
    await removeReferenceStack(input.item.id);
    await updateReferenceStackMeta(input.item.id, null);
    return null;
  }

  const data = referenceStackDataFromComponents({ ...input, components });

  const files = await mapWithConcurrency(
    fileSources,
    REFERENCE_STACK_IO_CONCURRENCY,
    async (source) => ({
      fileName: source.fileName,
      dataB64: await dataUrlToBase64(source.dataUrl),
    }),
  );

  await writeReferenceStackBatch(input.item.id, files, data);
  await updateReferenceStackMeta(input.item.id, data);
  return data;
}

async function dataUrlToBase64(dataUrl: string): Promise<string> {
  if (dataUrl.startsWith("data:")) {
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : "";
  }
  // blob:/http: URL — round-trip through a Blob to obtain base64.
  const asDataUrl = await blobToDataUrl(await dataUrlToBlob(dataUrl));
  const comma = asDataUrl.indexOf(",");
  return comma >= 0 ? asDataUrl.slice(comma + 1) : "";
}

export async function readReferenceStackComponents(item: ToolReference): Promise<{
  items: SavedComponent[];
  roots: ReferenceStackRoot[];
  activeRootId: string;
} | null> {
  const data = await readReferenceStackData(item.id);
  if (!data) return null;

  const fallbackRootId = data.rootComponentId ?? sourceRootComponentId(item.id);
  const rootsData: ReferenceStackRoot[] =
    data.roots && data.roots.length > 0
      ? data.roots
      : [
          {
            id: fallbackRootId,
            name: "root",
            box: { x: 0, y: 0, w: item.w || 0, h: item.h || 0 },
            file: null,
            isDefault: true,
            createdAt: data.updatedAt,
          },
        ];
  const defaultRootId = rootsData.find((root) => root.isDefault)?.id ?? rootsData[0]?.id ?? fallbackRootId;

  // Cuts that legacy v1 inlined the root into `components` are filtered out here.
  const rootIdSet = new Set(rootsData.map((root) => root.id));
  const cutRecords = data.components.filter((component) => !rootIdSet.has(component.id));

  const [rootItems, cutItems] = await Promise.all([
    mapWithConcurrency(rootsData, REFERENCE_STACK_IO_CONCURRENCY, async (root): Promise<SavedComponent> => {
      const isPrimaryRoot = root.id === data.primaryComponentId;
      if (root.isDefault || !root.file) {
        return {
          id: root.id,
          name: "root",
          box: { x: 0, y: 0, w: item.w || root.box.w, h: item.h || root.box.h },
          dataUrl: item.url,
          type: item.type || "IMG",
          createdAt: root.createdAt,
          parentId: null,
          kind: "root",
          rootId: root.id,
          isDefaultRoot: true,
          isPrimaryRoot,
        };
      }
      const blob = await loadReferenceStackFile(item.id, root.file, "image/png");
      return {
        id: root.id,
        name: root.name,
        box: root.box,
        dataUrl: blob ? await blobToDataUrl(blob) : item.url,
        type: "PNG",
        createdAt: root.createdAt,
        parentId: null,
        kind: "root",
        rootId: root.id,
        isDefaultRoot: false,
        isPrimaryRoot,
      };
    }),
    mapWithConcurrency(
      cutRecords,
      REFERENCE_STACK_IO_CONCURRENCY,
      async (component): Promise<SavedComponent | null> => {
        // Migration: cuts written before the variant model carry no `variants`,
        // so synthesise a single "original" variant from the legacy `file`.
        const variantRecords =
          component.variants && component.variants.length > 0
            ? component.variants
            : component.file
              ? [
                  {
                    id: ORIGINAL_VARIANT_ID,
                    tool: "original",
                    file: component.file,
                    createdAt: component.createdAt,
                  },
                ]
              : [];
        if (variantRecords.length === 0) return null;
        const loaded = await Promise.all(
          variantRecords.map(async (record): Promise<CutVariant | null> => {
            const blob = await loadReferenceStackFile(item.id, record.file, "image/png");
            return blob
              ? {
                  id: record.id,
                  tool: record.tool as CutVariantTool,
                  dataUrl: await blobToDataUrl(blob),
                  createdAt: record.createdAt,
                }
              : null;
          }),
        );
        const variants = loaded.filter((variant): variant is CutVariant => variant != null);
        if (variants.length === 0) return null;
        const activeId =
          component.activeVariantId && variants.some((v) => v.id === component.activeVariantId)
            ? component.activeVariantId
            : (variants.find((v) => v.tool === "original") ?? variants[0]).id;
        const active = variants.find((v) => v.id === activeId) ?? variants[0];
        return {
          id: component.id,
          name: component.name,
          box: component.box,
          dataUrl: active.dataUrl,
          type: component.type || "PNG",
          createdAt: component.createdAt,
          parentId: component.parentId,
          rootId: component.rootId ?? defaultRootId,
          kind: "cut",
          variants,
          activeVariantId: activeId,
        };
      },
    ),
  ]);

  const loaded = [...rootItems, ...cutItems.filter((component): component is SavedComponent => component != null)];
  const items = ensureRootComponent(loaded, item);

  const hasCuts = items.some((component) => component.parentId != null);
  const rootCount = items.filter((component) => component.parentId == null).length;
  if (!hasCuts && rootCount <= 1) return null;

  return {
    items,
    roots: rootsData,
    activeRootId: defaultRootId,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index]!, index);
      }
    }),
  );

  return results;
}
