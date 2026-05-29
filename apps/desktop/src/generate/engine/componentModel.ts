import type { SavedComponent, ToolReference, CropBox } from "./types";
import { CUT_MATCH_IOU_THRESHOLD, HIERARCHY_MIN_AREA_DELTA } from "../types";
import { intersectCropBoxes } from "./geometry";
import { clamp } from "./geometry";
import { blobToDataUrl, dataUrlToBlob, safeStackFileName } from "./image";
import {
  extFromName,
  loadReferenceStackFile,
  removeReferenceStack,
  saveReferenceFile,
  saveReferenceStackFile,
  writeReferenceStackData,
  readReferenceStackData,
  writeRefsMeta,
  readRefsMeta,
} from "@/lib/tauri/referenceStorage";
import { stackSummaryFromData, type ReferenceStackData } from "@/lib/references/stackTypes";

export function sourceRootComponentId(sourceId: string) {
  return `root-${sourceId}`;
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
  const candidates = items
    .filter((candidate) => candidate.id !== component.id)
    .filter((candidate) => isSpatialParent(candidate.box, component.box));

  if (candidates.length === 0) return items.find((item) => item.id === rootId) ?? null;

  return candidates.reduce((smallest, candidate) =>
    cropBoxArea(candidate.box) < cropBoxArea(smallest.box) ? candidate : smallest,
  );
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

  return items.map((item) => {
    if (item.id === rootId) return { ...item, parentId: null };
    const parent = findSpatialParent(item, items, rootId);
    return { ...item, parentId: parent?.id ?? rootId };
  });
}

export function ensureRootComponent(items: SavedComponent[], item: ToolReference): SavedComponent[] {
  const root = createRootComponent(item);
  let hasRoot = false;
  const normalized = items.map((entry) => {
    if (entry.id !== root.id) return entry;
    hasRoot = true;
    return {
      ...entry,
      name: root.name,
      box: root.box,
      dataUrl: root.dataUrl,
      type: root.type,
      parentId: null,
    };
  });

  if (!hasRoot) normalized.unshift(root);

  const ids = new Set(normalized.map((entry) => entry.id));
  const withParents = normalized.map((entry) => {
    if (entry.id === root.id) return entry;
    if (entry.parentId && ids.has(entry.parentId) && entry.parentId !== entry.id) return entry;
    return { ...entry, parentId: root.id };
  });

  const withRootFirst = [
    ...withParents.filter((entry) => entry.id === root.id),
    ...withParents.filter((entry) => entry.id !== root.id),
  ];

  return rebuildComponentHierarchy(withRootFirst, root.id);
}

export function referenceStackDataFromComponents(input: {
  item: ToolReference;
  components: SavedComponent[];
  rootComponentId: string;
  primaryComponentId: string;
}): ReferenceStackData {
  const updatedAt = new Date().toISOString();
  return {
    version: 1,
    referenceId: input.item.id,
    mediaKind: "image",
    original: {
      name: input.item.name,
      type: input.item.type || "IMG",
      ext: extFromName(input.item.name),
      w: input.item.w,
      h: input.item.h,
    },
    rootComponentId: input.rootComponentId,
    primaryComponentId: input.primaryComponentId,
    components: input.components.map((component) => ({
      id: component.id,
      name: component.id === input.rootComponentId ? "root" : component.name,
      type: component.type || "PNG",
      box: component.box,
      file: component.id === input.rootComponentId ? null : safeStackFileName(component.id),
      parentId:
        component.id === input.rootComponentId
          ? null
          : component.parentId ?? input.rootComponentId,
      createdAt: component.createdAt || updatedAt,
    })),
    updatedAt,
  };
}

export async function updateReferenceStackMeta(
  referenceId: string,
  data: ReferenceStackData | null,
): Promise<void> {
  const summary = stackSummaryFromData(data);
  const metas = await readRefsMeta().catch(() => []);
  await writeRefsMeta(
    metas.map((meta) =>
      meta.id === referenceId
        ? {
            ...meta,
            stack: summary,
            tags: summary?.enabled
              ? Array.from(new Set([...(meta.tags ?? []), "stack"]))
              : (meta.tags ?? []).filter((tag) => tag !== "stack"),
          }
        : meta,
    ),
  );
}

export async function writeReferenceStackFromComponents(input: {
  item: ToolReference;
  components: SavedComponent[];
  rootComponentId: string;
  primaryComponentId: string;
}): Promise<ReferenceStackData | null> {
  const components = ensureRootComponent(input.components, input.item);
  const stackComponents = components.filter((component) => component.id !== input.rootComponentId);
  await saveReferenceFile(input.item.id, await dataUrlToBlob(input.item.url));
  await removeReferenceStack(input.item.id);

  if (stackComponents.length === 0) {
    await updateReferenceStackMeta(input.item.id, null);
    return null;
  }

  const data = referenceStackDataFromComponents({ ...input, components });

  for (const component of stackComponents) {
    const fileName = safeStackFileName(component.id);
    const blob = await dataUrlToBlob(component.dataUrl);
    await saveReferenceStackFile(input.item.id, fileName, blob);
  }

  await writeReferenceStackData(input.item.id, data);
  await updateReferenceStackMeta(input.item.id, data);
  return data;
}

export async function readReferenceStackComponents(
  item: ToolReference,
): Promise<{ items: SavedComponent[]; primaryComponentId: string } | null> {
  const data = await readReferenceStackData(item.id);
  if (!data || data.components.length === 0) return null;

  const items: SavedComponent[] = [];
  for (const component of data.components) {
    if (component.id === data.rootComponentId) {
      items.push({
        id: component.id,
        name: "root",
        box: { x: 0, y: 0, w: item.w || component.box.w, h: item.h || component.box.h },
        dataUrl: item.url,
        type: item.type || component.type || "IMG",
        createdAt: component.createdAt,
        parentId: null,
      });
      continue;
    }

    if (!component.file) continue;
    const blob = await loadReferenceStackFile(item.id, component.file, "image/png");
    if (!blob) continue;
    items.push({
      id: component.id,
      name: component.name,
      box: component.box,
      dataUrl: await blobToDataUrl(blob),
      type: component.type || "PNG",
      createdAt: component.createdAt,
      parentId: component.parentId,
    });
  }

  if (items.length <= 1) return null;
  return {
    items: ensureRootComponent(items, item),
    primaryComponentId: data.primaryComponentId,
  };
}
