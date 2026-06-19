import { useState, useMemo } from "react";

// ─── Scene mode types ────────────────────────────────────────────────────────

export type NodeKind = "frame" | "surface" | "text" | "badge" | "button" | "media";

export type SceneNode = {
  id: string;
  name: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  background: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
  fontSize: number;
  fontWeight: number;
  // True for a linked component instance and everything inside it — read-only in
  // FastEdit (the master is edited at its origin, not here).
  linked?: boolean;
  children: SceneNode[];
};

export type SceneSize = { w: number; h: number; radius: number; label: string };

export type Scene = {
  label: string;
  size: SceneSize;
  root: SceneNode;
};

// ─── Stack mode types ─────────────────────────────────────────────────────────

export type ImageStackLayer = {
  id: string;
  name: string;
  dataUrl: string;
  /** Position and size in natural pixels relative to the stack root. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ImageStack = {
  /** Natural pixel dimensions of the root image (used for % coordinate math). */
  w: number;
  h: number;
  backgroundUrl: string;
  layers: ImageStackLayer[];
};

// ─── Component ───────────────────────────────────────────────────────────────

export type SceneCanvasInspectorProps =
  | {
      source: "scene";
      scene: Scene;
      selectedId: string;
      onSelect: (id: string) => void;
    }
  | {
      source: "stack";
      stack: ImageStack;
      selectedId: string | null;
      onSelect: (id: string) => void;
      /** Class applied to the background <img> — caller controls display size. */
      backgroundClassName?: string;
    };

export function SceneCanvasInspector(props: SceneCanvasInspectorProps) {
  if (props.source === "scene") {
    return (
      <SceneRenderer
        scene={props.scene}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
      />
    );
  }
  return (
    <StackRenderer
      stack={props.stack}
      selectedId={props.selectedId}
      onSelect={props.onSelect}
      backgroundClassName={props.backgroundClassName}
    />
  );
}

// ─── Scene renderer ───────────────────────────────────────────────────────────

function SceneRenderer({
  scene,
  selectedId,
  onSelect,
}: {
  scene: Scene;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodes = useMemo(
    () => flattenSceneTree(scene.root).filter(({ node }) => node.id !== scene.root.id),
    [scene.root],
  );

  const hoveredNode = hoveredId
    ? (nodes.find(({ node }) => node.id === hoveredId)?.node ?? null)
    : null;
  const selectedNode =
    selectedId !== scene.root.id
      ? (nodes.find(({ node }) => node.id === selectedId)?.node ?? null)
      : null;

  return (
    <div
      className="relative overflow-hidden border border-[rgba(255,255,255,0.1)] shadow-[0_32px_80px_rgba(0,0,0,0.55)]"
      style={{
        width: scene.size.w,
        height: scene.size.h,
        background: scene.root.background,
        cursor: "crosshair",
        borderRadius: scene.size.radius,
      }}
      onClick={() => {
        onSelect(scene.root.id);
        setHoveredId(null);
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          borderRadius: scene.root.radius,
          border: `${scene.root.borderWidth}px solid ${scene.root.borderColor}`,
        }}
      />
      <div className="absolute inset-0">
        {nodes.map(({ node, depth }) => (
          <SceneNodeEl
            key={node.id}
            node={node}
            depth={depth}
            onSelect={onSelect}
            onHover={setHoveredId}
          />
        ))}
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 500 }}>
        {hoveredNode && hoveredId !== selectedId && (
          <div
            style={{
              position: "absolute",
              left: hoveredNode.x,
              top: hoveredNode.y,
              width: hoveredNode.w,
              height: hoveredNode.h,
              outline: "2px solid rgba(251,146,60,0.85)",
              outlineOffset: "-1px",
            }}
          />
        )}
        {selectedNode && (
          <div
            style={{
              position: "absolute",
              left: selectedNode.x,
              top: selectedNode.y,
              width: selectedNode.w,
              height: selectedNode.h,
              outline: "2px solid #1F7AE0",
              outlineOffset: "-1px",
            }}
          />
        )}
      </div>
    </div>
  );
}

function SceneNodeEl({
  node,
  depth,
  onSelect,
  onHover,
}: {
  node: SceneNode;
  depth: number;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
        onHover(node.id);
      }}
      onMouseLeave={() => onHover(null)}
      className="absolute overflow-hidden border text-left"
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        borderColor: node.borderColor,
        borderWidth: node.borderWidth,
        borderRadius: node.radius,
        background: node.background,
        color: node.textColor,
        cursor: "crosshair",
        zIndex: 10 + depth,
      }}
    >
      {node.text ? (
        <div
          className="absolute bottom-2 left-2.5 right-2.5 truncate leading-[1.2]"
          style={{
            fontSize: node.fontSize,
            fontWeight: node.fontWeight,
            color: node.textColor,
          }}
        >
          {node.text}
        </div>
      ) : null}
    </button>
  );
}

// ─── Stack renderer ───────────────────────────────────────────────────────────

function StackRenderer({
  stack,
  selectedId,
  onSelect,
  backgroundClassName = "block max-h-[calc(100vh-220px)] max-w-full select-none rounded-[8px]",
}: {
  stack: ImageStack;
  selectedId: string | null;
  onSelect: (id: string) => void;
  backgroundClassName?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Stacking must follow the spatial hierarchy: a larger (parent) cut fully
  // covers its smaller (child) cuts, so children have to sit on top to stay
  // hoverable/clickable. Rank by area descending — the largest cut gets the
  // lowest z-index, the smallest the highest. Selection only changes the
  // outline; it must never bump z-index above a contained child, otherwise a
  // selected parent swallows all pointer events for its children.
  const zIndexById = useMemo(() => {
    const ranked = [...stack.layers].sort((a, b) => b.w * b.h - a.w * a.h);
    const map = new Map<string, number>();
    ranked.forEach((layer, index) => map.set(layer.id, index + 1));
    return map;
  }, [stack.layers]);

  return (
    <div className="relative inline-block">
      <img
        src={stack.backgroundUrl}
        className={backgroundClassName}
        alt="stack background"
        draggable={false}
        crossOrigin="anonymous"
      />
      {stack.layers.map((layer) => {
        const isSelected = layer.id === selectedId;
        const isHovered = layer.id === hoveredId && !isSelected;
        return (
          <button
            key={layer.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(layer.id);
            }}
            onMouseEnter={() => setHoveredId(layer.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="absolute cursor-pointer overflow-hidden border-0 p-0"
            style={{
              left: `${(layer.x / stack.w) * 100}%`,
              top: `${(layer.y / stack.h) * 100}%`,
              width: `${(layer.w / stack.w) * 100}%`,
              height: `${(layer.h / stack.h) * 100}%`,
              outline: isSelected
                ? "2px solid #1F7AE0"
                : isHovered
                  ? "2px solid rgba(251,146,60,0.85)"
                  : "none",
              outlineOffset: "-1px",
              zIndex: zIndexById.get(layer.id) ?? 1,
            }}
          >
            <img
              src={layer.dataUrl}
              alt={layer.name}
              draggable={false}
              crossOrigin="anonymous"
              className="h-full w-full"
              style={{ display: "block", objectFit: "fill" }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function flattenSceneTree(
  node: SceneNode,
  depth = 0,
): Array<{ node: SceneNode; depth: number }> {
  const out: Array<{ node: SceneNode; depth: number }> = [{ node, depth }];
  for (const child of node.children) out.push(...flattenSceneTree(child, depth + 1));
  return out;
}

export function findSceneNode(node: SceneNode, id: string): SceneNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findSceneNode(child, id);
    if (found) return found;
  }
  return null;
}

export function updateNodeInScene(
  scene: Scene,
  id: string,
  patch: Partial<SceneNode>,
): Scene {
  return { ...scene, root: patchNode(scene.root, id, patch) };
}

function patchNode(node: SceneNode, id: string, patch: Partial<SceneNode>): SceneNode {
  if (node.id === id) return { ...node, ...patch };
  return { ...node, children: node.children.map((c) => patchNode(c, id, patch)) };
}
