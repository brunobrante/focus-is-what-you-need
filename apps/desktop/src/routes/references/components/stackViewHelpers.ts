import type { ReferenceItem, StackPreviewState, StackTreeNode } from "../types";
import type { ReferenceStackData, ReferenceStackItem } from "@/lib/references/stackTypes";
import { readReferenceStackData, loadReferenceStackFile } from "@/lib/tauri/referenceStorage";
import { loadReferenceUrl } from "@/lib/references/referenceUrlCache";

export type StackRootEntry = { id: string; name: string };

export async function loadStackPreview(item: ReferenceItem): Promise<StackPreviewState | null> {
  const data = await readReferenceStackData(item.id);
  if (!data) return null;
  const baseUrl = (await loadReferenceUrl(item)) ?? "";
  const urls: Record<string, string> = {};
  const ownedUrls: string[] = [];

  if (data.roots && data.roots.length > 0) {
    for (const root of data.roots) {
      if (!root.file) { urls[root.id] = baseUrl; continue; }
      const blob = await loadReferenceStackFile(item.id, root.file, "image/png");
      if (!blob) { urls[root.id] = baseUrl; continue; }
      const url = URL.createObjectURL(blob);
      urls[root.id] = url;
      ownedUrls.push(url);
    }
  }

  for (const component of data.components) {
    if (!component.file) { urls[component.id] = baseUrl; continue; }
    const blob = await loadReferenceStackFile(item.id, component.file, "image/png");
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    urls[component.id] = url;
    ownedUrls.push(url);
  }
  return { data, urls, ownedUrls };
}

export function releaseStackUrls(preview: StackPreviewState | null): void {
  if (!preview) return;
  for (const url of preview.ownedUrls) URL.revokeObjectURL(url);
}

export function buildStackTree(data: ReferenceStackData): StackTreeNode[] {
  const byParent = new Map<string, ReferenceStackItem[]>();
  for (const component of data.components) {
    const parentId = component.parentId ?? "__root__";
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), component]);
  }

  const visit = (component: ReferenceStackItem, depth: number, seen: Set<string>): StackTreeNode => {
    if (seen.has(component.id)) return { component, children: [], depth };
    const next = new Set(seen); next.add(component.id);
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

export function listStackRoots(data: ReferenceStackData): StackRootEntry[] {
  if (data.roots && data.roots.length > 0) {
    return data.roots.map((root) => ({ id: root.id, name: root.name }));
  }
  if (data.rootComponentId) {
    const root = data.components.find((c) => c.id === data.rootComponentId);
    return [{ id: data.rootComponentId, name: root?.name || data.original.name || "Stack" }];
  }
  return [];
}

export function findStackNode(nodes: StackTreeNode[], id: string): StackTreeNode | null {
  for (const node of nodes) {
    if (node.component.id === id) return node;
    const found = findStackNode(node.children, id);
    if (found) return found;
  }
  return null;
}

export function countTreeNodes(nodes: StackTreeNode[]): number {
  let count = 0;
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    count++;
    stack.push(...node.children);
  }
  return count;
}
