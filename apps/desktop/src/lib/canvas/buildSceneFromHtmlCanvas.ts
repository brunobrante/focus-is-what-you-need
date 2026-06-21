import type { HtmlCanvasDocument, HtmlCanvasNode } from "@/lib/canvas/htmlScene";
import type {
  Scene,
  SceneNode,
  SceneSize,
  NodeKind,
} from "@/components/screen/SceneCanvasInspector";

export function buildSceneFromHtmlCanvas(doc: HtmlCanvasDocument): Scene | null {
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, HtmlCanvasNode[]>();
  for (const node of doc.nodes) {
    if (node.parentId) {
      const arr = childrenMap.get(node.parentId) ?? [];
      arr.push(node);
      childrenMap.set(node.parentId, arr);
    }
  }
  for (const arr of childrenMap.values()) arr.sort((a, b) => a.order - b.order);

  const root = nodeMap.get(doc.rootId);
  if (!root) return null;

  const rootChildren = (childrenMap.get(root.id) ?? []).filter((n) => n.visible !== false);
  const subject =
    root.name.endsWith(" Canvas") && rootChildren.length === 1 && rootChildren[0]
      ? rootChildren[0]
      : root;

  function absPos(nodeId: string): { x: number; y: number } {
    let x = 0; let y = 0;
    let cur = nodeMap.get(nodeId);
    while (cur) { x += cur.bounds.x; y += cur.bounds.y; cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined; }
    return { x, y };
  }

  const subjectAbs = absPos(subject.id);

  function convert(
    node: HtmlCanvasNode,
    absX: number,
    absY: number,
    isRoot: boolean,
    linkedAncestor: boolean,
  ): SceneNode {
    // A linked instance and everything resolved inside it is read-only here.
    const linked = linkedAncestor || Boolean(node.instanceOf);
    const htmlChildren = (childrenMap.get(node.id) ?? []).filter((n) => n.visible !== false);
    const children = htmlChildren.map((child) =>
      convert(child, absX + child.bounds.x, absY + child.bounds.y, false, linked)
    );
    const kind: NodeKind = isRoot
      ? "frame"
      : node.kind === "text"
        ? "text"
        : node.kind === "image"
          ? "media"
          : node.tag === "button"
            ? "button"
            : "surface";
    return {
      id: node.id,
      name: node.name,
      kind,
      x: Math.round(absX - subjectAbs.x),
      y: Math.round(absY - subjectAbs.y),
      w: Math.round(node.bounds.width),
      h: Math.round(node.bounds.height),
      text: node.text ?? "",
      background: node.style.background ?? "transparent",
      textColor: node.style.color ?? "#000000",
      borderColor: node.style.borderColor ?? "transparent",
      borderWidth: node.style.borderWidth ?? 0,
      radius: node.style.borderRadius ?? 0,
      fontSize: node.style.fontSize ?? 14,
      fontWeight: node.style.fontWeight ?? 400,
      linked,
      children,
    };
  }

  const rootNode = convert(subject, subjectAbs.x, subjectAbs.y, true, false);
  const size: SceneSize = {
    w: Math.round(subject.bounds.width),
    h: Math.round(subject.bounds.height),
    radius: subject.style.borderRadius ?? 0,
    label: subject.name,
  };

  return { label: subject.name, size, root: rootNode };
}
