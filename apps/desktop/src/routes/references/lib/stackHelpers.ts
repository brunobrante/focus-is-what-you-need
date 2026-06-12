import {
  readReferenceStackData,
  loadReferenceStackFile,
  loadReferenceFile,
} from "@/lib/tauri/referenceStorage";
import {
  stackRootIds,
  type ReferenceStackData,
  type ReferenceStackItem,
} from "@/lib/references/stackTypes";
import type { StackPreviewState, StackTreeNode } from "../types";

export async function loadStackThumbnailBatch(
  referenceIds: string[],
): Promise<Array<[string, string]>> {
  const entries: Array<[string, string]> = [];
  const queue = [...referenceIds];
  const workerCount = Math.min(4, queue.length);

  async function worker() {
    while (queue.length > 0) {
      const referenceId = queue.shift();
      if (!referenceId) continue;
      const url = await loadStackThumbnailUrl(referenceId).catch(() => null);
      if (url) entries.push([referenceId, url]);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return entries;
}

export async function loadStackThumbnailUrl(referenceId: string): Promise<string | null> {
  const data = await readReferenceStackData(referenceId);
  if (!data) return null;

  // The card represents the image by the root of its first stack. A non-default
  // stack stores its root pixels in a file; the default stack's root is the
  // original image itself (and legacy data without a roots list behaves the same).
  const firstRoot = data.roots?.[0] ?? null;

  if (firstRoot?.file) {
    const blob = await loadReferenceStackFile(referenceId, firstRoot.file, "image/png");
    if (blob) return URL.createObjectURL(blob);
  }

  const original = await loadReferenceFile(referenceId, data.original.ext).catch(() => null);
  return original ? URL.createObjectURL(original) : null;
}

// Loads a full stack preview (data + an object URL per root/cut) keyed by the
// library reference id. Mirrors loadStackPreview in ReferenceDetailModal, but
// resolves the base original from the reference id instead of a ReferenceItem so
// it can be used outside the References route (e.g. the canvas window). The
// caller owns the returned URLs and must call releaseStackPreview when done.
export async function loadStackPreviewById(
  referenceId: string,
): Promise<StackPreviewState | null> {
  const data = await readReferenceStackData(referenceId);
  if (!data) return null;

  const original = await loadReferenceFile(referenceId, data.original.ext).catch(() => null);
  const baseUrl = original ? URL.createObjectURL(original) : "";
  const ownedUrls: string[] = baseUrl ? [baseUrl] : [];
  const urls: Record<string, string> = {};

  if (data.roots && data.roots.length > 0) {
    for (const root of data.roots) {
      if (!root.file) {
        urls[root.id] = baseUrl;
        continue;
      }
      const blob = await loadReferenceStackFile(referenceId, root.file, "image/png");
      if (!blob) {
        urls[root.id] = baseUrl;
        continue;
      }
      const url = URL.createObjectURL(blob);
      urls[root.id] = url;
      ownedUrls.push(url);
    }
  }

  for (const component of data.components) {
    if (!component.file) {
      urls[component.id] = baseUrl;
      continue;
    }
    const blob = await loadReferenceStackFile(referenceId, component.file, "image/png");
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    urls[component.id] = url;
    ownedUrls.push(url);
  }

  return { data, urls, ownedUrls };
}

export function releaseStackPreview(preview: StackPreviewState | null): void {
  if (!preview) return;
  for (const url of preview.ownedUrls) URL.revokeObjectURL(url);
}

// Builds the parent/child tree of a stack. v2 stacks expose one tree per root;
// v1 falls back to the single rootComponentId (or the flat component list).
export function buildStackTree(data: ReferenceStackData): StackTreeNode[] {
  const byParent = new Map<string, ReferenceStackItem[]>();
  for (const component of data.components) {
    const parentId = component.parentId ?? "__root__";
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), component]);
  }

  const visit = (component: ReferenceStackItem, depth: number, seen: Set<string>): StackTreeNode => {
    if (seen.has(component.id)) return { component, children: [], depth };
    const next = new Set(seen);
    next.add(component.id);
    const children = (byParent.get(component.id) ?? [])
      .filter((c) => c.id !== component.id)
      .map((c) => visit(c, depth + 1, next));
    return { component, children, depth };
  };

  if (data.roots && data.roots.length > 0) {
    return data.roots.map((root) => {
      const synthetic: ReferenceStackItem = {
        id: root.id,
        name: root.name,
        type: data.original.type,
        box: root.box,
        file: root.file,
        parentId: null,
        createdAt: root.createdAt,
      };
      return visit(synthetic, 0, new Set());
    });
  }

  const root = data.components.find((c) => c.id === data.rootComponentId);
  if (root) return [visit(root, 0, new Set())];
  return (byParent.get("__root__") ?? data.components)
    .filter((c, i, list) => list.findIndex((x) => x.id === c.id) === i)
    .map((c) => visit(c, 0, new Set()));
}

export function findStackNode(nodes: StackTreeNode[], id: string): StackTreeNode | null {
  for (const node of nodes) {
    if (node.component.id === id) return node;
    const found = findStackNode(node.children, id);
    if (found) return found;
  }
  return null;
}

export function countStackTreeNodes(nodes: StackTreeNode[]): number {
  let count = 0;
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    count++;
    stack.push(...node.children);
  }
  return count;
}

// The id of the cut/root to select first when a stack opens: the explicit
// primary, else the first root, else the first cut.
export function defaultStackSelectionId(data: ReferenceStackData): string | null {
  if (data.primaryComponentId) return data.primaryComponentId;
  const rootIds = stackRootIds(data);
  const firstCut = data.components.find((c) => !rootIds.has(c.id));
  return firstCut?.id ?? data.roots?.[0]?.id ?? data.components[0]?.id ?? null;
}
