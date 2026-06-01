import { useEffect, useRef, useState } from "react";
import { useEditorBridge, useEditorBridgeReader, type EditorBridgeValue } from "@/canvas/engine/bridge";
import {
  renameElement,
  setTextElementSizing,
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
import type { CanvasDocument, CanvasProperties, ElementSizing, ElementStyles } from "@/canvas/engine/types";
import { ElementTab, elementTypeLabel } from "./inspector/ElementTab";
import { CanvasTab } from "./inspector/CanvasTab";
import { ShellTab, type ShellControlVisibility } from "./inspector/ShellTab";
import { EmptyState } from "./inspector/InsComponents";

type InspectorProps = {
  open: boolean;
  onClose: () => void;
  editor?: EditorBridgeValue | null;
  shellDeviceVisibility: ShellControlVisibility;
  shellBackVisibility: ShellControlVisibility;
  shellZoomVisibility: ShellControlVisibility;
  shellExpandVisibility: ShellControlVisibility;
  onShellDeviceVisibilityChange: (v: ShellControlVisibility) => void;
  onShellBackVisibilityChange: (v: ShellControlVisibility) => void;
  onShellZoomVisibilityChange: (v: ShellControlVisibility) => void;
  onShellExpandVisibilityChange: (v: ShellControlVisibility) => void;
  /** Incrementing this counter forces the Shell tab to become active. */
  openShellTabSignal?: number;
};

type InspectorTab = "element" | "canvas" | "shell" | "todo";

export function Inspector({
  open,
  onClose,
  editor: editorProp,
  shellDeviceVisibility,
  shellBackVisibility,
  shellZoomVisibility,
  shellExpandVisibility,
  onShellDeviceVisibilityChange,
  onShellBackVisibilityChange,
  onShellZoomVisibilityChange,
  onShellExpandVisibilityChange,
  openShellTabSignal,
}: InspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("element");
  const [checklistInput, setChecklistInput] = useState("");
  const [checklistItems, setChecklistItems] = useState<Array<{ id: string; label: string; checked: boolean }>>([
    { id: "todo-1", label: "Review hero banner spacing", checked: false },
    { id: "todo-2", label: "Adjust footer contrast tokens", checked: true },
    { id: "todo-3", label: "Polish toolbar icon alignment", checked: false },
    { id: "todo-4", label: "Validate mobile inspector width", checked: false },
    { id: "todo-5", label: "Sync shell tab labels", checked: true },
  ]);
  const prevShellTabSignalRef = useRef(openShellTabSignal ?? 0);
  useEffect(() => {
    if (openShellTabSignal !== undefined && openShellTabSignal !== prevShellTabSignalRef.current) {
      prevShellTabSignalRef.current = openShellTabSignal;
      setActiveTab("shell");
    }
  }, [openShellTabSignal]);

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

  const commitSizing = (sizing: ElementSizing) => {
    if (!document || !node) return;
    commitDocument(setTextElementSizing(document, node.id, sizing));
  };

  const addChecklistItem = () => {
    const nextLabel = checklistInput.trim();
    if (!nextLabel) return;
    setChecklistItems((current) => [
      ...current,
      { id: `todo-${Date.now()}`, label: nextLabel, checked: false },
    ]);
    setChecklistInput("");
  };

  const toggleChecklistItem = (id: string) => {
    setChecklistItems((current) =>
      current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  };

  const removeChecklistItem = (id: string) => {
    setChecklistItems((current) => current.filter((item) => item.id !== id));
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
          aria-label="Close"
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
          { id: "todo", label: "Checklist" },
        ] as const).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if ((tab.id === "element" || tab.id === "todo") && canvasStageActive) {
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
          <EmptyState title="No active canvas" body="Select Current or Drafts to inspect." />
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
            deviceVisibility={shellDeviceVisibility}
            backVisibility={shellBackVisibility}
            zoomVisibility={shellZoomVisibility}
            expandVisibility={shellExpandVisibility}
            onDeviceVisibilityChange={onShellDeviceVisibilityChange}
            onBackVisibilityChange={onShellBackVisibilityChange}
            onZoomVisibilityChange={onShellZoomVisibilityChange}
            onExpandVisibilityChange={onShellExpandVisibilityChange}
          />
        ) : activeTab === "todo" ? (
          <div className="p-3">
            <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.3px] text-[#9A9A9A]">
              Checklist
            </div>
            <div className="mb-2.5 flex items-center gap-1.5">
              <input
                type="text"
                value={checklistInput}
                onChange={(event) => setChecklistInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addChecklistItem();
                  }
                }}
                placeholder="Adicionar item no checklist..."
                className="h-8 min-w-0 flex-1 rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2 text-[12px] text-[#D8D8D8] outline-none placeholder:text-[#7A7A7A]"
              />
              <button
                type="button"
                onClick={addChecklistItem}
                className="h-8 shrink-0 rounded-md border border-[#2C2C2C] bg-[#0D99FF]/20 px-2 text-[11px] font-medium text-[#9DD4FF] transition-colors duration-100 hover:bg-[#0D99FF]/30"
              >
                Salvar
              </button>
            </div>
            <div className="space-y-1.5">
              {checklistItems.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2.5 py-2 text-[12px] text-[#D8D8D8] transition-colors duration-100 hover:bg-[#242424]"
                >
                  <input
                    id={item.id}
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleChecklistItem(item.id)}
                    className="h-3.5 w-3.5 rounded border-[#4A4A4A] bg-transparent accent-[#0D99FF]"
                  />
                  <span className={`min-w-0 flex-1 truncate ${item.checked ? "line-through text-[#8A8A8A]" : ""}`}>
                    {item.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(item.id)}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-[#8A8A8A] opacity-0 transition-all duration-100 hover:bg-[#2F2F2F] hover:text-[#E4A1A1] group-hover:opacity-100"
                    aria-label="Apagar item"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-2.5 h-8 w-full rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2 text-[11px] font-medium text-[#D8D8D8] transition-colors duration-100 hover:bg-[#2A2A2A]"
            >
              IA Resolver
            </button>
          </div>
        ) : selectedCount > 1 ? (
          <EmptyState title={`${selectedCount} elementos selecionados`} body="Use the canvas to move the group or select a layer to edit properties." />
        ) : !node ? (
          <EmptyState title="No element selected" body="Select an element in the tree or canvas." />
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
            onUpdateSizing={commitSizing}
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
