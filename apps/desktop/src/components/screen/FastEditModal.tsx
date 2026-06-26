import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Modal, ModalBody } from "@/components/modals/Modal";
import { ZoomControls } from "@/components/screen/ZoomControls";
import { useStepZoom } from "@/components/screen/useStepZoom";
import { CanvasScrollbars } from "@/components/ui/CanvasScrollbars";
import { IconChevronDown, IconClose, IconComponentLink, IconOpenCanvas, IconSpinner } from "@/components/icons";
import type { ComponentRow, ScreenRow, SceneRow, VariantRow } from "@/lib/storage/schema";
import type { ProjectType } from "@/lib/data/types";
import { getSceneByOwner } from "@/lib/storage/repos/scenes.repo";
import { saveScene } from "@/application/scenes/saveScene";
import { peekTable, TABLES } from "@/lib/storage/store";
import {
  buildMasterResolver,
  htmlCanvasDocumentFromJSON,
  resolveInstances,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import { buildSceneFromHtmlCanvas } from "@/lib/canvas/buildSceneFromHtmlCanvas";
import {
  SceneCanvasInspector,
  findSceneNode,
  flattenSceneTree,
  updateNodeInScene,
  type Scene,
  type SceneNode,
  type NodeKind,
} from "@/components/screen/SceneCanvasInspector";

export type FastEditConfig =
  | {
      mode: "screen";
      screen: ScreenRow | null;
      components: ComponentRow[];
      type: ProjectType;
      canvasHref: string;
      // When set, FastEdit edits this variant's scene instead of the screen's main —
      // used to edit a selected version. Its linked subcomponents are read-only.
      variantId?: string | null;
    }
  | {
      mode: "component";
      component: ComponentRow;
      variant: VariantRow | null;
      type: ProjectType;
      canvasHref: string;
    };

export interface FastEditModalHandle {
  open: (config: FastEditConfig) => void;
  close: () => void;
}

export const FastEditModal = forwardRef<FastEditModalHandle>(
  function FastEditModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const [config, setConfig] = useState<FastEditConfig | null>(null);

    const [scene, setScene] = useState<Scene | null>(null);
    const [selectedId, setSelectedId] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const zoomCtl = useStepZoom(stageRef, { keyboard: true, enabled: isOpen, contentRef });
    const pickerTriggerRef = useRef<HTMLButtonElement>(null);
    const pickerDropRef = useRef<HTMLDivElement>(null);

    // Persistence: edits are mapped back onto the original (unresolved) document
    // and saved to the owner variant's scene. The Scene shown is built from the
    // instance-resolved doc, so it is never the thing we serialize.
    const docRef = useRef<HtmlCanvasDocument | null>(null);
    const ownerIdRef = useRef<string | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dirtyRef = useRef(false);

    useImperativeHandle(ref, () => ({
      open: (nextConfig) => {
        setConfig(nextConfig);
        setIsOpen(true);
      },
      close: () => { flushSave(); setIsOpen(false); },
    }));

    // A screen's scene lives on its active variant, so both modes read a variant scene.
    const ownerType = "variant" as const;
    const ownerId =
      config?.mode === "screen"
        ? (config.variantId ?? config.screen?.activeVariantId ?? null)
        : (config?.variant?.id ?? null);

    useEffect(() => { ownerIdRef.current = ownerId; }, [ownerId]);

    // Persist the in-memory document for the owner captured at edit time. Never
    // awaited — saveScene is fire-and-forget (storage guardrail).
    const flushSave = () => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const doc = docRef.current;
      const id = ownerIdRef.current;
      if (!doc || !id) return;
      saveScene({ ownerType, ownerId: id, graphJSON: serializeHtmlCanvasDocument(doc) });
    };

    const scheduleSave = () => {
      dirtyRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSave, 300);
    };

    const close = () => { flushSave(); setIsOpen(false); };

    useEffect(() => {
      if (!isOpen || !ownerId) { setScene(null); return; }
      let cancelled = false;
      getSceneByOwner(ownerType, ownerId).then((row) => {
        if (cancelled || !row) return;
        const doc = htmlCanvasDocumentFromJSON(row.graphJSON);
        if (!doc) return;
        // Keep the original (unresolved) doc as the source we persist edits into.
        docRef.current = doc;
        // Resolve linked instances so their master content shows; buildScene marks
        // those subtrees as `linked` (read-only) so they can't be edited here.
        const resolved = resolveInstances(
          doc,
          buildMasterResolver(peekTable<SceneRow>(TABLES.scenes)),
        );
        const built = buildSceneFromHtmlCanvas(resolved);
        if (!cancelled && built) setScene(built);
      });
      // Persist any pending edits before the owner switches or the modal closes.
      return () => { cancelled = true; flushSave(); };
    }, [isOpen, ownerId, ownerType]);

    useEffect(() => {
      if (!isOpen || !scene) return;
      setSelectedId(scene.root.id);
      setPickerOpen(false);
      zoomCtl.reset();
    }, [isOpen, scene?.root.id]);

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

    const treeOptions = useMemo(() => (scene ? flattenSceneTree(scene.root) : []), [scene]);
    const selectedNode = scene ? (findSceneNode(scene.root, selectedId) ?? scene.root) : null;

    const updateSelected = (patch: Partial<SceneNode>) => {
      if (!selectedNode || selectedNode.linked) return; // linked instances are read-only
      setScene((prev) => (prev ? updateNodeInScene(prev, selectedNode.id, patch) : prev));
      applyPatchToDoc(docRef.current, selectedNode.id, patch);
      scheduleSave();
    };

    if (!config) return null;

    return (
      <Modal open={isOpen} onClose={close} ariaLabel="FastEdit" size="wide">
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
              to={config.canvasHref}
              className="flex h-7 items-center gap-1.5 rounded-[7px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2.5 text-[11.5px] text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.07)] hover:text-[var(--text)]"
            >
              <IconOpenCanvas size={12} strokeWidth={1.7} />
              Canvas
            </Link>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text)]"
            >
              <IconClose size={10} strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <ModalBody className="min-h-0 p-0">
          {(!scene || !selectedNode) ? (
            <div className="flex min-h-[640px] flex-col items-center justify-center gap-2">
              <IconSpinner size={20} strokeWidth={1.5} className="text-[var(--text-faint)]" />
              <span className="text-[12px] text-[var(--text-faint)]">Carregando cena…</span>
            </div>
          ) : (
          <>
          <div className="grid h-full min-h-[640px] grid-cols-[minmax(0,1fr)_360px]">
            <div
              ref={stageRef}
              {...zoomCtl.panHandlers}
              className="relative min-h-0 overflow-hidden border-r border-[var(--border)]"
              style={{
                background:
                  "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.038) 1px, transparent 0) 0 0/24px 24px, #0b0d10",
                cursor: zoomCtl.isPanning ? "grabbing" : zoomCtl.canPan ? "grab" : "default",
              }}
            >
              <div className="absolute left-4 top-4 z-[10] flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue)] opacity-80" />
                  <span className="text-[10.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                    {scene.size.label}
                  </span>
                </div>
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
                  <IconChevronDown
                    size={9} strokeWidth={2.2}
                    className={`ml-0.5 shrink-0 transition-transform duration-150 text-[#666] ${pickerOpen ? "rotate-180" : "rotate-0"}`}
                  />
                </button>
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  ref={contentRef}
                  className="pointer-events-auto"
                  style={{
                    position: "relative",
                    width: scene.size.w,
                    height: scene.size.h,
                    flexShrink: 0,
                    transform: zoomCtl.transform,
                    transformOrigin: "center",
                    transition: zoomCtl.isPanning ? "none" : "transform 150ms",
                  }}
                >
                  <SceneCanvasInspector
                    source="scene"
                    scene={scene}
                    selectedId={selectedNode.id}
                    onSelect={setSelectedId}
                  />
                </div>
              </div>
              <ZoomControls
                index={zoomCtl.index}
                onZoomIn={zoomCtl.zoomIn}
                onZoomOut={zoomCtl.zoomOut}
                onReset={zoomCtl.reset}
              />

              <CanvasScrollbars x={zoomCtl.scroll.x} y={zoomCtl.scroll.y} />
            </div>

            <aside className="flex min-h-0 flex-col bg-[var(--bg)]">
              {selectedNode.linked ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[rgba(155,109,255,0.08)] px-4 py-2.5">
                  <IconComponentLink size={13} className="shrink-0 text-[#c9b3ff]" />
                  <span className="text-[11.5px] leading-snug text-[#c9b3ff]">
                    Linked component — read-only. Edit it at its origin.
                  </span>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div
                  className={[
                    "grid gap-3 p-4",
                    selectedNode.linked ? "pointer-events-none opacity-50" : "",
                  ].join(" ")}
                >
                  <Section title="Text">
                    <Field label="Content">
                      <input
                        value={selectedNode.text}
                        onChange={(e) => updateSelected({ text: e.target.value })}
                        className="h-9 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
                      />
                    </Field>
                    <Field label="Text color">
                      <ColorInput
                        value={selectedNode.textColor}
                        onChange={(v) => updateSelected({ textColor: v })}
                      />
                    </Field>
                  </Section>
                  <Section title="Surface">
                    <Field label="Fundo">
                      <ColorInput
                        value={selectedNode.background}
                        onChange={(v) => updateSelected({ background: v })}
                      />
                    </Field>
                    <Field label="Borda">
                      <ColorInput
                        value={selectedNode.borderColor}
                        onChange={(v) => updateSelected({ borderColor: v })}
                      />
                    </Field>
                    <Field label="Espessura">
                      <SliderWithValue
                        min={0}
                        max={4}
                        step={1}
                        value={selectedNode.borderWidth}
                        onChange={(v) => updateSelected({ borderWidth: v })}
                        format={(v) => `${v}px`}
                      />
                    </Field>
                    <Field label="Radius">
                      <SliderWithValue
                        min={0}
                        max={64}
                        step={1}
                        value={selectedNode.radius}
                        onChange={(v) => updateSelected({ radius: v })}
                        format={(v) => `${v}px`}
                      />
                    </Field>
                  </Section>
                </div>
              </div>

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
                <NodePreview node={selectedNode} />
              </div>
            </aside>
          </div>

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
  },
);

const LayerPickerDropdown = forwardRef<
  HTMLDivElement,
  {
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    treeOptions: Array<{ node: SceneNode; depth: number }>;
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
  node: SceneNode;
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

function NodePreview({ node }: { node: SceneNode }) {
  const pad = 14;
  const maxW = 300;
  const maxH = 110;
  const scale = Math.min(maxW / node.w, maxH / node.h, 4);
  const displayW = Math.round(node.w * scale);
  const displayH = Math.round(node.h * scale);

  const isTransparent = node.background === "transparent" || node.background === "rgba(0,0,0,0)";

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
          background: node.background,
          border: `${Math.max(node.borderWidth * scale, node.borderWidth > 0 ? 0.5 : 0)}px solid ${node.borderColor}`,
          borderRadius: node.radius * scale,
          color: node.textColor,
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {node.text ? (
          <div
            style={{
              position: "absolute",
              bottom: Math.round(4 * scale),
              left: Math.round(8 * scale),
              right: Math.round(8 * scale),
              fontSize: Math.round(node.fontSize * scale),
              fontWeight: node.fontWeight,
              color: node.textColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {node.text}
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
        onChange={(e) => onChange(Number(e.target.value))}
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
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        value={normalized.toUpperCase().replace("#", "")}
        onChange={(e) => onChange(`#${e.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6)}`)}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--text)] outline-none"
        spellCheck={false}
      />
    </div>
  );
}

// Map a Scene-node edit (the only fields FastEdit exposes) back onto the matching
// node in the unresolved document, mutating our private parsed copy in place.
function applyPatchToDoc(
  doc: HtmlCanvasDocument | null,
  nodeId: string,
  patch: Partial<SceneNode>,
): void {
  if (!doc) return;
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  if (patch.text !== undefined) node.text = patch.text;
  if (patch.textColor !== undefined) node.style.color = patch.textColor;
  if (patch.background !== undefined) node.style.background = patch.background;
  if (patch.borderColor !== undefined) node.style.borderColor = patch.borderColor;
  if (patch.borderWidth !== undefined) node.style.borderWidth = patch.borderWidth;
  if (patch.radius !== undefined) node.style.borderRadius = patch.radius;
}

function normalizeHex(value: string): string {
  const clean = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean}`;
  return "#000000";
}
