import { memo } from "react";
import type { CanvasDocument } from "@/canvas/engine/types";
import { DetachedIsolatedChildren, ElementRenderer } from "./ElementRenderer";

function arrayValuesEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

export type RenderedSceneProps = {
  draftMode: boolean;
  document: CanvasDocument;
  canvasStageActive: boolean;
  isolatedParentId: string | null;
  editingTextId: string | null;
  affectedElementIds: ReadonlySet<string>;
  renderScale: number;
};

function RenderedSceneImpl({
  draftMode,
  document,
  canvasStageActive,
  isolatedParentId,
  editingTextId,
  affectedElementIds,
  renderScale,
}: RenderedSceneProps) {
  if (draftMode) {
    return (
      <div className="render-layer render-layer--draft">
        {document.rootIds.map((id) => (
          <ElementRenderer
            key={id}
            id={id}
            document={document}
            isolatedParentId={isolatedParentId}
            editingTextId={editingTextId}
            affectedElementIds={affectedElementIds}
            renderScale={renderScale}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`render-layer${canvasStageActive ? " render-layer--canvas-active" : ""}`}>
      {document.rootIds.map((id) => (
        <ElementRenderer
          key={id}
          id={id}
          document={document}
          isolatedParentId={isolatedParentId}
          editingTextId={editingTextId}
          affectedElementIds={affectedElementIds}
          renderScale={renderScale}
        />
      ))}
      <DetachedIsolatedChildren
        document={document}
        isolatedParentId={isolatedParentId}
        editingTextId={editingTextId}
        affectedElementIds={affectedElementIds}
        renderScale={renderScale}
      />
    </div>
  );
}

export const RenderedScene = memo(RenderedSceneImpl, (previous, next) => {
  if (
    previous.draftMode !== next.draftMode ||
    previous.canvasStageActive !== next.canvasStageActive ||
    previous.isolatedParentId !== next.isolatedParentId ||
    previous.editingTextId !== next.editingTextId ||
    previous.renderScale !== next.renderScale
  ) {
    return false;
  }

  if (previous.document === next.document) return true;
  return (
    next.affectedElementIds.size === 0 &&
    arrayValuesEqual(previous.document.rootIds, next.document.rootIds)
  );
});
