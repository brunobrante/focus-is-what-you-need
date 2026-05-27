import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useEditorBridge, useEditorBridgeReader, type EditorBridgeValue } from "@/lib/editor/bridge";
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
  updateShellPattern,
} from "@/lib/editor/actions";
import { getAbsoluteRect, getParentSize } from "@/lib/editor/geometry";
import type {
  CanvasProperties,
  ElementNode,
  ElementStyles,
  ElementType,
  ShellPattern,
} from "@/lib/editor/types";

type InspectorProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Optional editor handle. When omitted, the Inspector subscribes to the
   * editor bridge directly so it can keep its own re-render scope (avoiding
   * the cascade that happens when callers pass the editor through props and
   * re-render at the editor's 60 Hz cadence).
   */
  editor?: EditorBridgeValue | null;
};

type InspectorTab = "element" | "canvas" | "shell";
type ShellControlVisibility = "show" | "hidden" | "hover";
type ShellWindowOption = "draft" | "reference";

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
    if (canvasStageActive) {
      setActiveTab("canvas");
    } else if (node) {
      setActiveTab("element");
    }
  }, [node?.id, canvasStageActive]);

  const parentName = useMemo(() => {
    if (!document || !node?.parentId) return "Canvas";
    return document.elements[node.parentId]?.name ?? "Canvas";
  }, [document, node?.parentId]);

  if (!open) return null;

  const commitDocument = (
    nextDocument = document,
    selectedIds?: string[],
  ) => {
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

  const headerTitle = canvasStageActive
    ? "Canvas"
    : node
      ? node.name
      : "Inspector";
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
          <span className="h-2 w-2 shrink-0 rounded-[2px] bg-[#F2F2F2]" />
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
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      </div>

      <div className="flex shrink-0 border-b border-[#2C2C2C] px-2">
        {([
          { id: "element", label: "Element" },
          { id: "canvas", label: "Canvas" },
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
            pattern={document.shellPattern ?? "dots"}
            onUpdateBackground={(background) => commitDocument(updateShellBackground(document, background))}
            onUpdatePattern={(pattern) => commitDocument(updateShellPattern(document, pattern))}
          />
        ) : selectedCount > 1 ? (
          <EmptyState title={`${selectedCount} elementos selecionados`} body="Use o canvas para mover o grupo ou selecione uma camada para editar propriedades." />
        ) : !node ? (
          <EmptyState title="Nenhum elemento selecionado" body="Selecione um elemento na árvore ou no canvas." />
        ) : (
          <ElementTab
            node={node}
            parentName={parentName}
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

function ElementTab({
  node,
  parentName,
  document,
  onUpdateName,
  onUpdateText,
  onUpdateImageSource,
  onUpdateGeometry,
  onUpdateRotation,
  onUpdateStyle,
  onToggleLocked,
  onToggleVisible,
}: {
  node: ElementNode;
  parentName: string;
  document: NonNullable<EditorBridgeValue["state"]["document"]>;
  onUpdateName: (name: string) => void;
  onUpdateText: (text: string) => void;
  onUpdateImageSource: (src: string) => void;
  onUpdateGeometry: (patch: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  onUpdateRotation: (rotation: number) => void;
  onUpdateStyle: (style: Partial<ElementStyles>) => void;
  onToggleLocked: (locked: boolean) => void;
  onToggleVisible: (visible: boolean) => void;
}) {
  const rect = getAbsoluteRect(document, node.id);
  const parentSize = getParentSize(document, node.id);
  const opacity = Math.round((node.styles.opacity ?? 1) * 100);

  return (
    <>
      <InsSection title="Hierarquia">
        <InsRow label="Nome">
          <InsInput value={node.name} onChange={onUpdateName} />
        </InsRow>
        <Readout label="Tipo" value={elementTypeLabel(node.type)} />
        <Readout label="Pai" value={parentName} />
        <Readout label="Filhos" value={String(node.children.length)} />
        <InsRow label="Lock">
          <InsToggle
            value={node.locked ? "locked" : "free"}
            onChange={(value) => onToggleLocked(value === "locked")}
            options={[
              { value: "free", label: "Livre" },
              { value: "locked", label: "Travado" },
            ]}
          />
        </InsRow>
        <InsRow label="Visible">
          <InsToggle
            value={node.visible === false ? "hidden" : "visible"}
            onChange={(value) => onToggleVisible(value === "visible")}
            options={[
              { value: "visible", label: "On" },
              { value: "hidden", label: "Off" },
            ]}
          />
        </InsRow>
      </InsSection>

      {node.type === "text" ? (
        <InsSection title="Conteúdo">
          <InsTextarea value={node.content ?? ""} onChange={onUpdateText} />
        </InsSection>
      ) : null}

      <InsSection title="Posição">
        <Readout label="Abs X" value={String(Math.round(rect?.x ?? 0))} />
        <Readout label="Abs Y" value={String(Math.round(rect?.y ?? 0))} />
        <InsRow label="X">
          <InsInput value={String(node.x)} onChange={(value) => updateNumber(value, (x) => onUpdateGeometry({ x }))} suffix="px" />
        </InsRow>
        <InsRow label="Y">
          <InsInput value={String(node.y)} onChange={(value) => updateNumber(value, (y) => onUpdateGeometry({ y }))} suffix="px" />
        </InsRow>
        <InsRow label="Rotação">
          <InsInput value={String(Math.round(node.rotation))} onChange={(value) => updateNumber(value, onUpdateRotation)} suffix="°" />
        </InsRow>
      </InsSection>

      <InsSection title="Tamanho">
        <InsRow label="W">
          <InsInput value={String(node.width)} onChange={(value) => updateNumber(value, (width) => onUpdateGeometry({ width }))} suffix="px" />
        </InsRow>
        <InsRow label="H">
          <InsInput value={String(node.height)} onChange={(value) => updateNumber(value, (height) => onUpdateGeometry({ height }))} suffix="px" />
        </InsRow>
        <Readout label="Max W" value={String(Math.round(parentSize.width))} />
        <Readout label="Max H" value={String(Math.round(parentSize.height))} />
      </InsSection>

      <InsSection title="Layout" defaultOpen={false}>
        <InsRow label="Display">
          <InsToggle
            value={node.styles.display ?? "block"}
            onChange={(value) => onUpdateStyle({ display: value as ElementStyles["display"] })}
            options={[
              { value: "block", label: "Block" },
              { value: "flex", label: "Flex" },
            ]}
          />
        </InsRow>
        {(node.styles.display ?? "block") === "flex" ? (
          <>
            <InsRow label="Justify">
              <InsSelect
                value={node.styles.justifyContent ?? "flex-start"}
                onChange={(justifyContent) => onUpdateStyle({ justifyContent })}
                options={["flex-start", "center", "flex-end", "space-between"]}
              />
            </InsRow>
            <InsRow label="Align">
              <InsSelect
                value={node.styles.alignItems ?? "stretch"}
                onChange={(alignItems) => onUpdateStyle({ alignItems })}
                options={["stretch", "flex-start", "center", "flex-end"]}
              />
            </InsRow>
            <InsRow label="Gap">
              <InsInput value={String(node.styles.gap ?? 0)} onChange={(value) => updateNumber(value, (gap) => onUpdateStyle({ gap }))} suffix="px" />
            </InsRow>
          </>
        ) : null}
        <InsRow label="Padding">
          <InsInput value={String(node.styles.padding ?? 0)} onChange={(value) => updateNumber(value, (padding) => onUpdateStyle({ padding }))} suffix="px" />
        </InsRow>
      </InsSection>

      <InsSection title="Aparência">
        <InsRow label="Fill">
          <InsColor value={node.styles.background ?? "#FFFFFF"} onChange={(background) => onUpdateStyle({ background })} />
        </InsRow>
        <InsRow label="Opacity">
          <InsInput value={String(opacity)} onChange={(value) => updateNumber(value, (next) => onUpdateStyle({ opacity: clamp(next, 0, 100) / 100 }))} suffix="%" />
        </InsRow>
        {node.type !== "ellipse" && (
          <InsRow label="Radius">
            <InsInput value={String(node.styles.borderRadius ?? 0)} onChange={(value) => updateNumber(value, (borderRadius) => onUpdateStyle({ borderRadius }))} suffix="px" />
          </InsRow>
        )}
        <InsRow label="Border">
          <InsInput value={String(node.styles.borderWidth ?? 0)} onChange={(value) => updateNumber(value, (borderWidth) => onUpdateStyle({ borderWidth }))} suffix="px" />
        </InsRow>
        <InsRow label="Borda">
          <InsColor value={node.styles.borderColor ?? "#CBD5E1"} onChange={(borderColor) => onUpdateStyle({ borderColor })} />
        </InsRow>
      </InsSection>

      {node.type === "text" ? (
        <InsSection title="Tipografia" defaultOpen={false}>
          <InsRow label="Size">
            <InsInput value={String(node.styles.fontSize ?? 14)} onChange={(value) => updateNumber(value, (fontSize) => onUpdateStyle({ fontSize }))} suffix="px" />
          </InsRow>
          <InsRow label="Weight">
            <InsSelect
              value={labelForWeight(node.styles.fontWeight)}
              onChange={(value) => onUpdateStyle({ fontWeight: weightForLabel(value) })}
              options={["Regular", "Medium", "Semibold", "Bold"]}
            />
          </InsRow>
          <InsRow label="Color">
            <InsColor value={node.styles.color ?? "#111827"} onChange={(color) => onUpdateStyle({ color })} />
          </InsRow>
        </InsSection>
      ) : null}

      {node.type === "image" ? (
        <InsSection title="Imagem" defaultOpen={false}>
          <InsRow label="URL">
            <InsInput value={node.src ?? ""} onChange={onUpdateImageSource} placeholder="https://..." />
          </InsRow>
        </InsSection>
      ) : null}
    </>
  );
}

function CanvasTab({
  canvas,
  active,
  onToggleActive,
  onUpdate,
}: {
  canvas: CanvasProperties;
  active: boolean;
  onToggleActive: (active: boolean) => void;
  onUpdate: (props: Partial<CanvasProperties>) => void;
}) {
  return (
    <>
      <InsSection title="Modo">
        <InsRow label="Editar">
          <InsToggle
            value={active ? "active" : "normal"}
            onChange={(value) => onToggleActive(value === "active")}
            options={[
              { value: "normal", label: "Normal" },
              { value: "active", label: "Canvas" },
            ]}
          />
        </InsRow>
      </InsSection>
      <InsSection title="Tamanho">
        <InsRow label="W">
          <InsInput value={String(canvas.width)} onChange={(value) => updateNumber(value, (width) => onUpdate({ width }))} suffix="px" />
        </InsRow>
        <InsRow label="H">
          <InsInput value={String(canvas.height)} onChange={(value) => updateNumber(value, (height) => onUpdate({ height }))} suffix="px" />
        </InsRow>
        <InsRow label="Rotação">
          <InsInput value={String(Math.round(canvas.rotation ?? 0))} onChange={(value) => updateNumber(value, (rotation) => onUpdate({ rotation }))} suffix="°" />
        </InsRow>
      </InsSection>
      <InsSection title="Aparência">
        <InsRow label="Fill">
          <InsColor value={canvas.background || "#F8FAFC"} onChange={(background) => onUpdate({ background })} />
        </InsRow>
        <InsRow label="Radius">
          <InsInput value={String(canvas.borderRadius ?? 0)} onChange={(value) => updateNumber(value, (borderRadius) => onUpdate({ borderRadius }))} suffix="px" />
        </InsRow>
        <InsRow label="Border">
          <InsInput value={String(canvas.borderWidth ?? 0)} onChange={(value) => updateNumber(value, (borderWidth) => onUpdate({ borderWidth }))} suffix="px" />
        </InsRow>
        <InsRow label="Borda">
          <InsColor value={canvas.borderColor ?? "#CBD5E1"} onChange={(borderColor) => onUpdate({ borderColor })} />
        </InsRow>
        <InsRow label="Opacity">
          <InsInput value={String(Math.round((canvas.opacity ?? 1) * 100))} onChange={(value) => updateNumber(value, (next) => onUpdate({ opacity: clamp(next, 0, 100) / 100 }))} suffix="%" />
        </InsRow>
        <InsRow label="Padding">
          <InsInput value={String(canvas.padding ?? 0)} onChange={(value) => updateNumber(value, (padding) => onUpdate({ padding }))} suffix="px" />
        </InsRow>
      </InsSection>
    </>
  );
}

function ShellTab({
  background,
  pattern,
  onUpdateBackground,
  onUpdatePattern,
}: {
  background: string;
  pattern: ShellPattern;
  onUpdateBackground: (background: string) => void;
  onUpdatePattern: (pattern: ShellPattern) => void;
}) {
  const [deviceButtonVisibility, setDeviceButtonVisibility] = useState<ShellControlVisibility>("show");
  const [zoomVisibility, setZoomVisibility] = useState<ShellControlVisibility>("show");
  const [expandVisibility, setExpandVisibility] = useState<ShellControlVisibility>("hover");
  const [showDots, setShowDots] = useState(true);
  const [showSquares, setShowSquares] = useState(false);
  const [enabledWindows, setEnabledWindows] = useState<ShellWindowOption[]>(["draft"]);

  return (
    <>
      <InsSection title="Shell">
        <InsRow label="BG">
          <InsColor value={background} onChange={onUpdateBackground} />
        </InsRow>
        <InsRow label="Padrão">
          <InsToggle
            value={pattern}
            onChange={(value) => onUpdatePattern(value as ShellPattern)}
            options={[
              { value: "dots", label: "Pontilhado" },
              { value: "grid", label: "Quadrados" },
            ]}
          />
        </InsRow>
      </InsSection>

      <InsSection title="Feats">
        <InsRow label="Janelas">
          <InsMultiSelect
            value={enabledWindows}
            onChange={(value) => setEnabledWindows(value as ShellWindowOption[])}
            options={[
              { value: "draft", label: "Draft" },
              { value: "reference", label: "Referência" },
            ]}
          />
        </InsRow>
      </InsSection>

      <InsSection title="Controles">
        <InsRow label="Device">
          <InsToggle
            value={deviceButtonVisibility}
            onChange={(value) => setDeviceButtonVisibility(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
        <InsRow label="Zoom">
          <InsToggle
            value={zoomVisibility}
            onChange={(value) => setZoomVisibility(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
        <InsRow label="Expand">
          <InsToggle
            value={expandVisibility}
            onChange={(value) => setExpandVisibility(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
      </InsSection>

      <InsSection title="Grade">
        <InsRow label="Dots">
          <InsSwitch checked={showDots} onChange={setShowDots} label="Pontilhado" />
        </InsRow>
        <InsRow label="Squares">
          <InsSwitch checked={showSquares} onChange={setShowSquares} label="Quadrados" />
        </InsRow>
      </InsSection>
    </>
  );
}

const SHELL_VISIBILITY_OPTIONS: Array<{ value: ShellControlVisibility; label: string }> = [
  { value: "show", label: "Show" },
  { value: "hidden", label: "Hidden" },
  { value: "hover", label: "Hover" },
];

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center px-5 text-center">
      <div className="text-[13px] font-medium text-[#F2F2F2]">{title}</div>
      <div className="mt-1 text-[11.5px] leading-5 text-[#6B6B6B]">{body}</div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <InsRow label={label}>
      <div className="h-7 min-w-0 flex-1 truncate rounded-md border border-[#2C2C2C] bg-[#141414] px-2 py-[6px] text-[12px] text-[#9A9A9A]">
        {value}
      </div>
    </InsRow>
  );
}

function updateNumber(value: string, commit: (value: number) => void): boolean {
  if (value.trim() === "") return false;
  const next = Number(value);
  if (!Number.isFinite(next)) return false;
  commit(next);
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function elementTypeLabel(type: ElementType): string {
  if (type === "text") return "Text";
  if (type === "ellipse") return "Ellipse";
  if (type === "image") return "Image";
  return "Frame";
}

function labelForWeight(value: string | undefined): string {
  const numeric = Number(value ?? 400);
  if (numeric >= 700) return "Bold";
  if (numeric >= 600) return "Semibold";
  if (numeric >= 500) return "Medium";
  return "Regular";
}

function weightForLabel(value: string): string {
  if (value === "Bold") return "700";
  if (value === "Semibold") return "600";
  if (value === "Medium") return "500";
  return "400";
}

function InsSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#2C2C2C]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3.5 py-3 text-[11px] font-medium uppercase text-[#9A9A9A]"
        style={{ letterSpacing: "0.4px" }}
      >
        <span>{title}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="transition-transform duration-[120ms]"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">{children}</div> : null}
    </div>
  );
}

function InsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="grid min-w-0 items-center gap-2"
      style={{ gridTemplateColumns: "60px minmax(0, 1fr)" }}
    >
      <span
        className="truncate text-[11px] text-[#9A9A9A]"
        style={{ letterSpacing: "0.2px" }}
      >
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

type CommitResult = boolean | void;

function useDeferredCommitField(value: string, onChange: (v: string) => CommitResult) {
  const [draftValue, setDraftValueState] = useState(value);
  const draftValueRef = useRef(value);
  const committedValueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  committedValueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    draftValueRef.current = value;
    setDraftValueState(value);
  }, [value]);

  const setDraftValue = useCallback((nextValue: string) => {
    draftValueRef.current = nextValue;
    setDraftValueState(nextValue);
  }, []);

  const commitDraft = useCallback(() => {
    const draft = draftValueRef.current;
    const committed = committedValueRef.current;
    if (draft === committed) return;
    const result = onChangeRef.current(draft);
    if (result === false) {
      draftValueRef.current = committed;
      setDraftValueState(committed);
    }
  }, []);

  const resetDraft = useCallback(() => {
    const committed = committedValueRef.current;
    draftValueRef.current = committed;
    setDraftValueState(committed);
  }, []);

  return {
    draftValue,
    setDraftValue,
    commitDraft,
    resetDraft,
  };
}

function useCommitOnOutsideInteraction<T extends HTMLElement>(
  ref: { current: T | null },
  commitDraft: () => void,
) {
  useEffect(() => {
    const ownerDocument = globalThis.document;
    if (!ownerDocument) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const element = ref.current;
      const target = event.target;
      if (element && target instanceof Node && element.contains(target)) return;
      commitDraft();
    };
    const handleWindowBlur = () => commitDraft();

    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    globalThis.addEventListener("blur", handleWindowBlur);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      globalThis.removeEventListener("blur", handleWindowBlur);
      commitDraft();
    };
  }, [commitDraft, ref]);
}

function InsInput({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: string;
  onChange: (v: string) => CommitResult;
  placeholder?: string;
  suffix?: string;
}) {
  const inputWrapperRef = useRef<HTMLDivElement | null>(null);
  const { draftValue, setDraftValue, commitDraft, resetDraft } = useDeferredCommitField(value, onChange);

  useCommitOnOutsideInteraction(inputWrapperRef, commitDraft);

  return (
    <div
      ref={inputWrapperRef}
      className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2"
    >
      <input
        type="text"
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
          } else if (e.key === "Escape") {
            e.preventDefault();
            resetDraft();
          }
        }}
        placeholder={placeholder}
        className="w-full min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#F2F2F2] outline-none placeholder:text-[#6B6B6B]"
        style={{ fontFeatureSettings: '"tnum"' }}
      />
      {suffix ? <span className="ml-1 text-[10.5px] text-[#6B6B6B]">{suffix}</span> : null}
    </div>
  );
}

function InsTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => CommitResult;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { draftValue, setDraftValue, commitDraft, resetDraft } = useDeferredCommitField(value, onChange);

  useCommitOnOutsideInteraction(textareaRef, commitDraft);

  return (
    <textarea
      ref={textareaRef}
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commitDraft();
        } else if (event.key === "Escape") {
          event.preventDefault();
          resetDraft();
        }
      }}
      rows={3}
      className="min-h-[72px] w-full resize-none rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2 py-1.5 text-[12px] leading-5 text-[#F2F2F2] outline-none"
    />
  );
}

function InsColor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colorInputValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <>
      <label
        className="relative h-[22px] w-[22px] shrink-0 cursor-pointer overflow-hidden rounded-[5px] border border-[#2C2C2C]"
        style={{ background: value }}
      >
        <input
          type="color"
          value={colorInputValue}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <InsInput
        value={value.toUpperCase().replace("#", "")}
        onChange={(v) => onChange("#" + v.replace("#", ""))}
      />
    </>
  );
}

function InsSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full min-w-0 flex-1 rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2 text-[12px] text-[#F2F2F2] outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function InsToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-0.5 overflow-hidden rounded-md border border-[#2C2C2C] bg-[#1E1E1E] p-0.5">
      {options.map((o) => {
        const isActive = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="h-[22px] min-w-0 flex-1 cursor-pointer truncate rounded border-0 text-[11px]"
            style={{
              letterSpacing: "0.2px",
              background: isActive ? "#383838" : "transparent",
              color: isActive ? "#FFFFFF" : "#9A9A9A",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function InsMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-0.5 overflow-hidden rounded-md border border-[#2C2C2C] bg-[#1E1E1E] p-0.5">
      {options.map((option) => {
        const isActive = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => {
              const next = isActive
                ? value.filter((item) => item !== option.value)
                : [...value, option.value];
              onChange(next);
            }}
            className="h-[22px] min-w-0 flex-1 cursor-pointer truncate rounded border-0 text-[11px]"
            style={{
              letterSpacing: "0.2px",
              background: isActive ? "rgba(13,153,255,0.18)" : "transparent",
              color: isActive ? "#B9E1FF" : "#9A9A9A",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function InsSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={[
        "flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-between rounded-md border px-2 transition-colors duration-[100ms]",
        checked
          ? "border-[#0D99FF]/50 bg-[#0D99FF]/15 text-[#F2F2F2]"
          : "border-[#2C2C2C] bg-[#1E1E1E] text-[#9A9A9A]",
      ].join(" ")}
    >
      <span className="truncate text-[11.5px] font-medium">{label}</span>
      <span
        aria-hidden
        className={[
          "relative h-4 w-7 shrink-0 rounded-full transition-colors duration-[100ms]",
          checked ? "bg-[#0D99FF]" : "bg-[#383838]",
        ].join(" ")}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-[100ms]"
          style={{ transform: checked ? "translateX(13px)" : "translateX(2px)" }}
        />
      </span>
    </button>
  );
}
