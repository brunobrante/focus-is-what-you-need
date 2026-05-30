import { useEffect, useState } from "react";
import { useEditorBridge, useEditorBridgeReader, type EditorBridgeValue } from "@/canvas/engine/bridge";
import {
  renameElement,
  setElementLocked,
  setElementVisible,
  updateCanvasProperties,
  updateElementGeometry,
  updateElementImageSource,
  updateElementRotation,
  updateElementStyles,
  updateElementText,
  updateShellBackground,
  updateShellGrid,
  DEFAULT_SHELL_GRID,
} from "@/canvas/engine/actions";
import type { CanvasDocument, CanvasProperties, ElementStyles } from "@/canvas/engine/types";
import { ElementTab, elementTypeLabel } from "./inspector/ElementTab";
import { CanvasTab } from "./inspector/CanvasTab";
import { ShellTab } from "./inspector/ShellTab";
import { EmptyState } from "./inspector/InsComponents";

type InspectorProps = {
  open: boolean;
  onClose: () => void;
  editor?: EditorBridgeValue | null;
};

type InspectorTab = "element" | "canvas" | "shell";

export function Inspector({ open, onClose, editor: editorProp }: InspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("element");

  const bridgeDocument = useEditorBridge((v) => v?.state.document ?? null);
  const bridgeSelectedId = useEditorBridge((v) => v?.state.selectedIds[0] ?? null);
  const bridgeSelectedCount = useEditorBridge((v) => v?.state.selectedIds.length ?? 0);
  const bridgeCanvasStageActive = useEditorBridge((v) => v?.state.canvasStageActive ?? false);
  const bridgeSourceId = useEditorBridge((v) => v?.sourceId ?? null);
  const getEditorSnapshot = useEditorBridgeReader();

  const document = editorProp !== undefined ? (editorProp?.state.document ?? null) : bridgeDocument;
  const selectedId = editorProp !== undefined ? (editorProp?.state.selectedIds[0] ?? null) : bridgeSelectedId;
  const selectedCount = editorProp !== undefined ? (editorProp?.state.selectedIds.length ?? 0) : bridgeSelectedCount;
  const canvasStageActive = editorProp !== undefined ? (editorProp?.state.canvasStageActive ?? false) : bridgeCanvasStageActive;
  const sourceLabel = ((editorProp !== undefined ? editorProp?.sourceId : bridgeSourceId) === "drafts") ? "Drafts" : "Current";
  const node = document && selectedId ? document.elements[selectedId] ?? null : null;

  useEffect(() => {
    if (canvasStageActive) setActiveTab("canvas");
    else if (node) setActiveTab("element");
  }, [node?.id, canvasStageActive]);

  if (!open) return null;

  const commitDocument = (nextDocument: CanvasDocument | null = document, selectedIds?: string[]) => {
    if (!nextDocument) return;
    (editorProp ?? getEditorSnapshot())?.dispatch({
      type: "commitDocument",
      document: nextDocument,
      ...(selectedIds !== undefined ? { selectedIds } : {}),
    });
  };

  const commitCanvas = (props: Partial<CanvasProperties>) => {
    if (!document) return;
    commitDocument(updateCanvasProperties(document, props));
  };

  const commitStyle = (styles: Partial<ElementStyles>) => {
    if (!document || !node) return;
    commitDocument(updateElementStyles(document, node.id, styles));
  };

  const headerTitle = canvasStageActive ? "Frame" : node ? node.name : "Inspector";
  const headerMeta = canvasStageActive
    ? `${document?.canvas.width ?? 0}×${document?.canvas.height ?? 0}px`
    : node
      ? elementTypeLabel(node.type)
      : sourceLabel;

  return (
    <aside
      aria-label="Inspetor"
      className="pointer-events-auto flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] text-[#F2F2F2]"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2C2C2C] pl-3.5 pr-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid shrink-0 place-items-center text-[#9A9A9A]" style={{ width: 16, height: 16 }}>
            {canvasStageActive ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            ) : node?.type === "text" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 6h14" /><path d="M12 6v13" /><path d="M9 19h6" />
              </svg>
            ) : node?.type === "image" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" />
              </svg>
            ) : node?.type === "ellipse" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="12" rx="9" ry="6" />
              </svg>
            ) : node ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
              </svg>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium">{headerTitle}</span>
            <span className="block truncate text-[10.5px] text-[#6B6B6B]">{headerMeta}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="grid h-6 w-6 cursor-pointer place-items-center rounded-md border border-[#2C2C2C] bg-transparent text-[#9A9A9A] hover:bg-[#2A2A2A] hover:text-[var(--text)]"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex shrink-0 border-b border-[#2C2C2C] px-2">
        {([
          { id: "element", label: "Element" },
          { id: "canvas", label: "Frame" },
          { id: "shell", label: "Shell" },
        ] as const).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "element" && canvasStageActive) {
                  (editorProp ?? getEditorSnapshot())?.dispatch({ type: "setCanvasStageActive", active: false });
                }
              }}
              className="relative cursor-pointer border-0 bg-transparent px-2.5 py-2.5 text-[12px] font-medium"
              style={{ color: isActive ? "#F2F2F2" : "#9A9A9A" }}
            >
              {tab.label}
              {isActive ? (
                <span aria-hidden className="absolute -bottom-px left-2 right-2 h-0.5 rounded-[2px] bg-[#F2F2F2]" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {!document ? (
          <EmptyState title="Nenhum canvas ativo" body="Selecione Current ou Drafts para inspecionar." />
        ) : activeTab === "canvas" ? (
          <CanvasTab
            canvas={document.canvas}
            active={canvasStageActive}
            onToggleActive={(active) => (editorProp ?? getEditorSnapshot())?.dispatch({ type: "setCanvasStageActive", active })}
            onUpdate={commitCanvas}
          />
        ) : activeTab === "shell" ? (
          <ShellTab
            background={document.shellBackground ?? "#000000"}
            shellGrid={document.shellGrid ?? DEFAULT_SHELL_GRID}
            onUpdateBackground={(background) => commitDocument(updateShellBackground(document, background))}
            onUpdateGrid={(grid) => commitDocument(updateShellGrid(document, grid))}
          />
        ) : selectedCount > 1 ? (
          <EmptyState title={`${selectedCount} elementos selecionados`} body="Use o canvas para mover o grupo ou selecione uma camada para editar propriedades." />
        ) : !node ? (
          <EmptyState title="Nenhum elemento selecionado" body="Selecione um elemento na árvore ou no canvas." />
        ) : (
          <ElementTab
            node={node}
            document={document}
            onUpdateName={(name) => commitDocument(renameElement(document, node.id, name))}
            onUpdateText={(text) => commitDocument(updateElementText(document, node.id, text))}
            onUpdateImageSource={(src) => commitDocument(updateElementImageSource(document, node.id, src))}
            onUpdateGeometry={(patch) => commitDocument(updateElementGeometry(document, node.id, patch))}
            onUpdateRotation={(rotation) => commitDocument(updateElementRotation(document, node.id, rotation))}
            onUpdateStyle={commitStyle}
            onToggleLocked={(locked) => commitDocument(setElementLocked(document, node.id, locked))}
            onToggleVisible={(visible) => {
              const ids = (editorProp ?? getEditorSnapshot())?.state.selectedIds ?? [];
              commitDocument(
                setElementVisible(document, node.id, visible),
                visible ? ids : [],
              );
            }}
          />
        )}
      </div>

      <div
        className="flex shrink-0 items-center justify-between border-t border-[#2C2C2C] px-3 py-2.5 text-[11px] text-[#6B6B6B]"
        style={{ letterSpacing: "0.2px" }}
      >
        <span>auto-save</span>
        <span className="truncate" style={{ fontFeatureSettings: '"tnum"' }}>
          {node ? `${node.width}×${node.height} px` : document ? `${document.canvas.width}×${document.canvas.height} px` : "—"}
        </span>
      </div>
    </aside>
  );
}
