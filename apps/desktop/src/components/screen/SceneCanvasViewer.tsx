import { EmptyPreviewPlaceholder } from "./EmptyPreviewPlaceholder";
import { useThumbnail } from "@/lib/storage/hooks";
import type { SceneOwnerType } from "@/lib/storage/schema";
import { flattenSceneTree } from "./SceneCanvasInspector";
import type { ImageStack, Scene } from "./SceneCanvasInspector";

// ─── Props ────────────────────────────────────────────────────────────────────

export type SceneCanvasViewerProps =
  | { source: "snapshot"; url: string | null }
  | { source: "stored"; ownerType: SceneOwnerType; ownerId: string; kind: "screen" | "component" }
  | { source: "stack"; stack: ImageStack }
  | { source: "scene"; scene: Scene };

// ─── Component ───────────────────────────────────────────────────────────────

export function SceneCanvasViewer(props: SceneCanvasViewerProps) {
  if (props.source === "snapshot") {
    return props.url ? (
      <img
        src={props.url}
        alt=""
        draggable={false}
        className="block max-h-[60vh] max-w-full object-contain"
      />
    ) : (
      <EmptyPreviewPlaceholder kind="screen" />
    );
  }
  if (props.source === "stored") {
    return <StoredView ownerType={props.ownerType} ownerId={props.ownerId} kind={props.kind} />;
  }
  if (props.source === "stack") {
    return <StackView stack={props.stack} />;
  }
  return <SceneView scene={props.scene} />;
}

// ─── Stored renderer (loads thumbnail from storage) ──────────────────────────

function StoredView({
  ownerType,
  ownerId,
  kind,
}: {
  ownerType: SceneOwnerType;
  ownerId: string;
  kind: "screen" | "component";
}) {
  const { data } = useThumbnail(ownerType, ownerId);
  if (!data) return <EmptyPreviewPlaceholder kind={kind} />;
  return (
    <img
      src={data.dataUrl}
      alt=""
      draggable={false}
      className="block max-h-[60vh] max-w-full object-contain"
    />
  );
}

// ─── Stack renderer ───────────────────────────────────────────────────────────

function StackView({ stack }: { stack: ImageStack }) {
  return (
    <div className="relative inline-block">
      <img
        src={stack.backgroundUrl}
        className="block max-h-[calc(100vh-220px)] max-w-full select-none rounded-[8px]"
        alt=""
        draggable={false}
        crossOrigin="anonymous"
      />
      {stack.layers.map((layer) => (
        <div
          key={layer.id}
          className="absolute overflow-hidden"
          style={{
            left: `${(layer.x / stack.w) * 100}%`,
            top: `${(layer.y / stack.h) * 100}%`,
            width: `${(layer.w / stack.w) * 100}%`,
            height: `${(layer.h / stack.h) * 100}%`,
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
        </div>
      ))}
    </div>
  );
}

// ─── Scene renderer ───────────────────────────────────────────────────────────

function SceneView({ scene }: { scene: Scene }) {
  const nodes = flattenSceneTree(scene.root).filter(({ node }) => node.id !== scene.root.id);

  return (
    <div
      className="relative overflow-hidden border border-[rgba(255,255,255,0.1)] shadow-[0_32px_80px_rgba(0,0,0,0.55)]"
      style={{
        width: scene.size.w,
        height: scene.size.h,
        background: scene.root.background,
        borderRadius: scene.size.radius,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 60%)",
        }}
      />
      {nodes.map(({ node, depth }) => (
        <div
          key={node.id}
          className="absolute overflow-hidden"
          style={{
            left: node.x,
            top: node.y,
            width: node.w,
            height: node.h,
            borderColor: node.borderColor,
            borderWidth: node.borderWidth,
            borderStyle: "solid",
            borderRadius: node.radius,
            background: node.background,
            color: node.textColor,
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
        </div>
      ))}
    </div>
  );
}
