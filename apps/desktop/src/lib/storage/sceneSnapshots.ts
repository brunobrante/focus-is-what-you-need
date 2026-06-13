import {
  buildMasterResolver,
  htmlCanvasDocumentFromJSON,
  resolveInstances,
  svgForHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import { peekTable } from "@/lib/storage/recordStore";
import { TABLES } from "@/lib/storage/storeKeys";
import type { SceneRow } from "@/lib/storage/schema";

const SVG_DATA_URL_PREFIX = "data:image/svg+xml;utf8,";

export function snapshotDataUrlFromGraphJSON(graphJSON: string): string | null {
  const parsed = htmlCanvasDocumentFromJSON(graphJSON);
  if (!parsed) return null;
  if (!hasSnapshotContent(parsed)) return null;

  // Expand linked instances read-only so the thumbnail shows the master content,
  // never an empty placeholder. Masters come from the synchronous scene cache.
  const document = resolveInstances(parsed, buildMasterResolver(peekTable<SceneRow>(TABLES.scenes)));

  const svg = svgForHtmlCanvasDocument(document);
  if (!svg) return null;

  return SVG_DATA_URL_PREFIX + encodeURIComponent(svg.replace(/\s+/g, " ").trim());
}

export function graphJSONHasSnapshotContent(graphJSON: string | null | undefined): boolean {
  const document = htmlCanvasDocumentFromJSON(graphJSON ?? null);
  return document ? hasSnapshotContent(document) : false;
}

function hasSnapshotContent(document: NonNullable<ReturnType<typeof htmlCanvasDocumentFromJSON>>): boolean {
  const root = document.nodes.find((node) => node.id === document.rootId);
  if (!root) return false;

  const directChildren = document.nodes.filter((node) => node.parentId === root.id);
  const subject =
    directChildren.length === 1 &&
    root.name.endsWith(" Canvas") &&
    Math.round(directChildren[0]!.bounds.x) === 0 &&
    Math.round(directChildren[0]!.bounds.y) === 0 &&
    Math.round(directChildren[0]!.bounds.width) === Math.round(root.bounds.width) &&
    Math.round(directChildren[0]!.bounds.height) === Math.round(root.bounds.height)
      ? directChildren[0]!
      : null;

  const contentParentId = subject?.id ?? root.id;
  return document.nodes.some((node) => node.parentId === contentParentId);
}
