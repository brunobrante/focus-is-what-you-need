import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Modal, ModalBody } from "@/components/modals/Modal";
import { ZoomControls, ZOOM_STEPS, ZOOM_DEFAULT_IDX } from "@/components/screen/ZoomControls";
import type { ComponentRow, ScreenRow, VariantRow } from "@/lib/storage/schema";
import type { ProjectType } from "@/lib/data/types";
import { getSceneByOwner } from "@/lib/storage/repos/scenes.repo";
import { htmlCanvasDocumentFromJSON, type HtmlCanvasDocument, type HtmlCanvasNode } from "@/lib/canvas/htmlScene";

type FastEditModalProps =
  | {
      mode: "screen";
      open: boolean;
      onClose: () => void;
      screen: ScreenRow | null;
      components: ComponentRow[];
      type: ProjectType;
      canvasHref: string;
    }
  | {
      mode: "component";
      open: boolean;
      onClose: () => void;
      component: ComponentRow;
      variant: VariantRow | null;
      type: ProjectType;
      canvasHref: string;
    };

type SceneSize = { w: number; h: number; radius: number; label: string };
type NodeKind = "frame" | "surface" | "text" | "badge" | "button" | "media";

type Node = {
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
  children: Node[];
};

type Draft = Partial<Pick<Node, "text" | "background" | "textColor" | "borderColor" | "borderWidth" | "radius">>;

type Scene = {
  label: string;
  size: SceneSize;
  root: Node;
};

export function FastEditModal(props: FastEditModalProps) {
  const [scene, setScene] = useState<Scene | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(ZOOM_DEFAULT_IDX);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerDropRef = useRef<HTMLDivElement>(null);

  const ownerType = props.mode === "screen" ? ("screen" as const) : ("variant" as const);
  const ownerId = props.mode === "screen" ? (props.screen?.id ?? null) : (props.variant?.id ?? null);

  useEffect(() => {
    if (!props.open || !ownerId) { setScene(null); return; }
    let cancelled = false;
    getSceneByOwner(ownerType, ownerId).then((row) => {
      if (cancelled || !row) return;
      const doc = htmlCanvasDocumentFromJSON(row.graphJSON);
      if (!doc) return;
      const built = buildSceneFromHtmlCanvas(doc);
      if (!cancelled && built) setScene(built);
    });
    return () => { cancelled = true; };
  }, [props.open, ownerId, ownerType]);

  useEffect(() => {
    if (!props.open || !scene) return;
    setSelectedId(scene.root.id);
    setHoveredId(null);
    setDrafts({});
    setPickerOpen(false);
    setZoomIdx(ZOOM_DEFAULT_IDX);
  }, [props.open, scene?.root.id]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !pickerTriggerRef.current?.contains(e.target as globalThis.Node) &&
        !pickerDropRef.current?.contains(e.target as globalThis.Node)
      ) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  const treeOptions = useMemo(() => (scene ? flattenTree(scene.root) : []), [scene]);
  const selectedNode = scene ? (findNode(scene.root, selectedId) ?? scene.root) : null;
  const selectedDraft = selectedNode ? (drafts[selectedNode.id] ?? {}) : {};
  const allNodes = scene ? treeOptions.filter(({ node }) => node.id !== scene.root.id) : [];
  const hoveredNode = hoveredId ? (allNodes.find(({ node }) => node.id === hoveredId)?.node ?? null) : null;
  const selectedSceneNode = scene && selectedId !== scene.root.id
    ? (allNodes.find(({ node }) => node.id === selectedId)?.node ?? null)
    : null;

  const z = ZOOM_STEPS[zoomIdx] ?? 1;

  const updateSelectedDraft = (patch: Draft) => {
    if (!selectedNode) return;
    setDrafts((prev) => ({
      ...prev,
      [selectedNode.id]: { ...(prev[selectedNode.id] ?? {}), ...patch },
    }));
  };

  return (
    <Modal open={props.open} onClose={props.onClose} ariaLabel="FastEdit" size="wide">
      {/* Compact header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.07)] px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-[13px] font-semibold tracking-[-0.1px] text-[var(--text)]">FastEdit</span>
          <span className="h-3 w-px shrink-0 rounded-full bg-[rgba(255,255,255,0.12)]" />
          <span className="truncate text-[11.5px] text-[var(--text-faint)]">
            Quick editing of color, text, border, and radius per layer.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to={props.canvasHref}
            className="flex h-7 items-center gap-1.5 rounded-[7px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2.5 text-[11.5px] text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.07)] hover:text-[var(--text)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path d="M3 9h18" />
            </svg>
            Canvas
          </Link>
          <button
            type="button"
            aria-label="Close"
            onClick={props.onClose}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
      <ModalBody className="min-h-0 p-0">
        {(!scene || !selectedNode) ? (
          <div className="flex min-h-[640px] flex-col items-center justify-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="animate-spin text-[var(--text-faint)]">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span className="text-[12px] text-[var(--text-faint)]">Carregando cena…</span>
          </div>
        ) : (
        <>
        <div className="grid h-full min-h-[640px] grid-cols-[minmax(0,1fr)_360px]">
          {/* Canvas */}
          <div
            className="relative min-h-0 overflow-hidden border-r border-[var(--border)]"
            style={{
              background:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.038) 1px, transparent 0) 0 0/24px 24px, #0b0d10",
            }}
          >
            {/* Floating controls row */}
            <div className="absolute left-4 top-4 z-[10] flex items-center gap-2">
              {/* Device badge */}
              <div className="flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue)] opacity-80" />
                <span className="text-[10.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                  {scene.size.label}
                </span>
              </div>
              {/* Layer select trigger */}
              <button
                ref={pickerTriggerRef}
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="flex h-[26px] items-center gap-1.5 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)] px-2.5 text-left backdrop-blur-sm transition-colors hover:bg-[rgba(255,255,255,0.09)]"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.35)" }}
              >
                <span className="grid shrink-0 place-items-center" style={{ color: "#9A9A9A" }}>
                  <NodeKindIcon kind={selectedNode.kind} hasChildren={selectedNode.children.length > 0} />
                </span>
                <span className="max-w-[160px] truncate text-[11.5px] font-medium" style={{ color: "#F2F2F2", letterSpacing: "0.05px" }}>
                  {selectedNode.name}
                </span>
                <svg
                  width="9" height="9" viewBox="0 0 24 24" fill="none"
                  stroke="#666" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  className="ml-0.5 shrink-0 transition-transform duration-150"
                  style={{ transform: pickerOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Wrapper sized to the scene — rings share the same coordinate space */}
              <div style={{ position: "relative", width: scene.size.w, height: scene.size.h, flexShrink: 0, transform: `scale(${z})`, transformOrigin: "center", transition: "transform 150ms" }}>
                <FastEditScene
                  scene={scene}
                  selectedId={selectedNode.id}
                  drafts={drafts}
                  onSelect={setSelectedId}
                  onHover={setHoveredId}
                />
                {/* Overlay rings in scene coordinates — no offset math needed */}
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
                  {selectedSceneNode && (
                    <div
                      style={{
                        position: "absolute",
                        left: selectedSceneNode.x,
                        top: selectedSceneNode.y,
                        width: selectedSceneNode.w,
                        height: selectedSceneNode.h,
                        outline: "2px solid #1F7AE0",
                        outlineOffset: "-1px",
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
            <ZoomControls
              index={zoomIdx}
              onZoomIn={() => setZoomIdx((i) => Math.min(i + 1, ZOOM_STEPS.length - 1))}
              onZoomOut={() => setZoomIdx((i) => Math.max(i - 1, 0))}
              onReset={() => setZoomIdx(ZOOM_DEFAULT_IDX)}
            />
          </div>

          {/* Sidebar */}
          <aside className="flex min-h-0 flex-col bg-[var(--bg)]">
            {/* Properties — scrollable */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-3 p-4">
                <Section title="Texto">
                  <Field label="Content">
                    <input
                      value={selectedDraft.text ?? selectedNode.text}
                      onChange={(event) => updateSelectedDraft({ text: event.target.value })}
                      className="h-9 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
                    />
                  </Field>
                  <Field label="Text color">
                    <ColorInput
                      value={selectedDraft.textColor ?? selectedNode.textColor}
                      onChange={(value) => updateSelectedDraft({ textColor: value })}
                    />
                  </Field>
                </Section>
                <Section title="Surface">
                  <Field label="Fundo">
                    <ColorInput
                      value={selectedDraft.background ?? selectedNode.background}
                      onChange={(value) => updateSelectedDraft({ background: value })}
                    />
                  </Field>
                  <Field label="Borda">
                    <ColorInput
                      value={selectedDraft.borderColor ?? selectedNode.borderColor}
                      onChange={(value) => updateSelectedDraft({ borderColor: value })}
                    />
                  </Field>
                  <Field label="Espessura">
                    <SliderWithValue
                      min={0}
                      max={4}
                      step={1}
                      value={selectedDraft.borderWidth ?? selectedNode.borderWidth}
                      onChange={(value) => updateSelectedDraft({ borderWidth: value })}
                      format={(v) => `${v}px`}
                    />
                  </Field>
                  <Field label="Radius">
                    <SliderWithValue
                      min={0}
                      max={64}
                      step={1}
                      value={selectedDraft.radius ?? selectedNode.radius}
                      onChange={(value) => updateSelectedDraft({ radius: value })}
                      format={(v) => `${v}px`}
                    />
                  </Field>
                </Section>
              </div>
            </div>

            {/* Bottom: node info + preview */}
            <div className="shrink-0 border-t border-[var(--border)] p-4">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--text)]">{selectedNode.name}</span>
                <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.35px] text-[var(--text-faint)]">
                  {selectedNode.kind}
                </span>
              </div>
              <div className="mb-3 mt-0.5 text-[11px] tabular-nums text-[var(--text-faint)]">
                {selectedNode.w} × {selectedNode.h} px
              </div>
              <NodePreview node={selectedNode} draft={selectedDraft} />
            </div>
          </aside>
        </div>

        {/* Layer picker dropdown — fixed, outside overflow-hidden containers */}
        {pickerOpen && (
          <LayerPickerDropdown
            ref={pickerDropRef}
            triggerRef={pickerTriggerRef}
            treeOptions={treeOptions}
            selectedId={selectedNode.id}
            onSelect={(id) => {
              setSelectedId(id);
              setPickerOpen(false);
            }}
          />
        )}
        </>
        )}
      </ModalBody>
    </Modal>
  );
}

function FastEditScene({
  scene,
  selectedId,
  drafts,
  onSelect,
  onHover,
}: {
  scene: Scene;
  selectedId: string;
  drafts: Record<string, Draft>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const nodes = useMemo(
    () => flattenTree(scene.root).filter(({ node }) => node.id !== scene.root.id),
    [scene.root],
  );

  return (
    <div
      className="relative overflow-hidden border border-[rgba(255,255,255,0.1)] shadow-[0_32px_80px_rgba(0,0,0,0.55)]"
      style={{ width: scene.size.w, height: scene.size.h, background: scene.root.background, cursor: "crosshair", borderRadius: scene.size.radius }}
      onClick={() => { onSelect(scene.root.id); onHover(null); }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 60%)" }}
      />
      <div
        className="absolute inset-0"
        style={{ borderRadius: scene.root.radius, border: `${scene.root.borderWidth}px solid ${scene.root.borderColor}` }}
      />
      <div className="absolute inset-0">
        {nodes.map(({ node, depth }) => (
          <SceneNode
            key={node.id}
            node={node}
            depth={depth}
            draft={drafts[node.id] ?? {}}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </div>
    </div>
  );
}

function SceneNode({
  node,
  depth,
  draft,
  onSelect,
  onHover,
}: {
  node: Node;
  depth: number;
  draft: Draft;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const background = draft.background ?? node.background;
  const textColor = draft.textColor ?? node.textColor;
  const borderColor = draft.borderColor ?? node.borderColor;
  const borderWidth = draft.borderWidth ?? node.borderWidth;
  const radius = draft.radius ?? node.radius;
  const text = draft.text ?? node.text;

  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}
      onMouseEnter={(event) => { event.stopPropagation(); onHover(node.id); }}
      onMouseLeave={() => onHover(null)}
      className="absolute overflow-hidden border text-left"
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        borderColor,
        borderWidth,
        borderRadius: radius,
        background,
        color: textColor,
        cursor: "crosshair",
        zIndex: 10 + depth,
      }}
    >
      {text ? (
        <div
          className="absolute bottom-2 left-2.5 right-2.5 truncate leading-[1.2]"
          style={{ fontSize: node.fontSize, fontWeight: node.fontWeight, color: textColor }}
        >
          {text}
        </div>
      ) : null}
    </button>
  );
}

function buildSceneFromHtmlCanvas(doc: HtmlCanvasDocument): Scene | null {
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

  // If the root is a canvas wrapper with a single centered child, use that child as subject
  const rootChildren = (childrenMap.get(root.id) ?? []).filter((n) => n.visible !== false);
  const subject =
    root.name.endsWith(" Canvas") && rootChildren.length === 1 && rootChildren[0]
      ? rootChildren[0]
      : root;

  // Compute absolute canvas position of a node by walking up to root
  function absPos(nodeId: string): { x: number; y: number } {
    let x = 0; let y = 0;
    let cur = nodeMap.get(nodeId);
    while (cur) { x += cur.bounds.x; y += cur.bounds.y; cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined; }
    return { x, y };
  }

  const subjectAbs = absPos(subject.id);

  function convert(node: HtmlCanvasNode, absX: number, absY: number, isRoot: boolean): Node {
    const htmlChildren = (childrenMap.get(node.id) ?? []).filter((n) => n.visible !== false);
    const children = htmlChildren.map((child) =>
      convert(child, absX + child.bounds.x, absY + child.bounds.y, false)
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
      children,
    };
  }

  const rootNode = convert(subject, subjectAbs.x, subjectAbs.y, true);
  const size: SceneSize = {
    w: Math.round(subject.bounds.width),
    h: Math.round(subject.bounds.height),
    radius: subject.style.borderRadius ?? 0,
    label: subject.name,
  };

  return { label: subject.name, size, root: rootNode };
}


function flattenTree(node: Node, depth = 0): Array<{ node: Node; depth: number }> {
  const out: Array<{ node: Node; depth: number }> = [{ node, depth }];
  for (const child of node.children) out.push(...flattenTree(child, depth + 1));
  return out;
}

function findNode(node: Node, id: string): Node | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

const LayerPickerDropdown = forwardRef<
  HTMLDivElement,
  {
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    treeOptions: Array<{ node: Node; depth: number }>;
    selectedId: string;
    onSelect: (id: string) => void;
  }
>(function LayerPickerDropdown({ triggerRef, treeOptions, selectedId, onSelect }, ref) {
  const rect = triggerRef.current?.getBoundingClientRect();
  if (!rect) return null;
  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#141414]"
      style={{
        position: "fixed",
        top: rect.bottom + 2,
        left: rect.left,
        width: 260,
        maxHeight: 320,
        zIndex: 9999,
        boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset",
      }}
    >
      <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
        {treeOptions.map(({ node, depth }) => (
          <LayerRow
            key={node.id}
            node={node}
            depth={depth}
            active={node.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
});

function LayerRow({
  node,
  depth,
  active,
  onSelect,
}: {
  node: Node;
  depth: number;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="option"
      aria-selected={active}
      onClick={() => onSelect(node.id)}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.035)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
      className="relative flex h-[30px] cursor-default select-none items-center gap-1.5 pr-2.5 text-[13px]"
      style={{
        paddingLeft: 6 + depth * 14,
        color: active ? "#FFFFFF" : "#CFCFCF",
        background: active ? "rgba(255,255,255,0.07)" : "transparent",
      }}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center" style={{ color: "#9A9A9A" }}>
        <NodeKindIcon kind={node.kind} hasChildren={node.children.length > 0} />
      </span>
      <span
        className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ fontWeight: node.kind === "frame" ? 500 : 400, letterSpacing: "0.05px" }}
      >
        {node.name}
      </span>
      <span
        className="shrink-0 text-[10px] tabular-nums"
        style={{ color: active ? "rgba(255,255,255,0.35)" : "#555" }}
      >
        {node.kind}
      </span>
    </div>
  );
}

function NodeKindIcon({ kind, hasChildren }: { kind: NodeKind; hasChildren: boolean }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (hasChildren) {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }
  switch (kind) {
    case "text":
      return (
        <svg {...common}>
          <path d="M5 6h14" />
          <path d="M12 6v13" />
          <path d="M9 19h6" />
        </svg>
      );
    case "badge":
      return (
        <svg {...common}>
          <rect x="2" y="7" width="20" height="10" rx="5" />
        </svg>
      );
    case "button":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="10" rx="3" />
        </svg>
      );
    case "media":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
  }
}

function NodePreview({ node, draft }: { node: Node; draft: Draft }) {
  const background = draft.background ?? node.background;
  const textColor = draft.textColor ?? node.textColor;
  const borderColor = draft.borderColor ?? node.borderColor;
  const borderWidth = draft.borderWidth ?? node.borderWidth;
  const radius = draft.radius ?? node.radius;
  const text = draft.text ?? node.text;

  const pad = 14;
  const maxW = 300;
  const maxH = 110;
  const scale = Math.min(maxW / node.w, maxH / node.h, 4);
  const displayW = Math.round(node.w * scale);
  const displayH = Math.round(node.h * scale);

  const isTransparent = background === "transparent" || background === "rgba(0,0,0,0)";

  return (
    <div
      className="flex items-center justify-center rounded-[10px] border border-[var(--border)]"
      style={{
        padding: pad,
        background: isTransparent
          ? "repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%) 0 0/12px 12px, var(--surface)"
          : "var(--surface)",
      }}
    >
      <div
        style={{
          width: displayW,
          height: displayH,
          background,
          border: `${Math.max(borderWidth * scale, borderWidth > 0 ? 0.5 : 0)}px solid ${borderColor}`,
          borderRadius: radius * scale,
          color: textColor,
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {text ? (
          <div
            style={{
              position: "absolute",
              bottom: Math.round(4 * scale),
              left: Math.round(8 * scale),
              right: Math.round(8 * scale),
              fontSize: Math.round(node.fontSize * scale),
              fontWeight: node.fontWeight,
              color: textColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {text}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-3.5">
      <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      {children}
    </div>
  );
}

function SliderWithValue({
  min,
  max,
  step,
  value,
  onChange,
  format = String,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-7 flex-1 cursor-pointer accent-[var(--blue)]"
      />
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-muted)]">
        {format(value)}
      </span>
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const normalized = normalizeHex(value);
  return (
    <div className="flex h-9 items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5">
      <label
        className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-[5px] border border-[var(--border-strong)]"
        style={{ background: normalized }}
      >
        <input
          type="color"
          value={normalized}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        value={normalized.toUpperCase().replace("#", "")}
        onChange={(event) => onChange(`#${event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6)}`)}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--text)] outline-none"
        spellCheck={false}
      />
    </div>
  );
}

function normalizeHex(value: string): string {
  const clean = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean}`;
  return "#000000";
}
