import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Modal, ModalHeader } from "./Modal";
import { IconClose, IconGrid, IconLayoutHorizontal, IconLayoutVertical, IconOpenCanvas, IconPlus } from "@/components/icons";
import { Snapshot } from "@/components/Snapshot";
import { VersionTagBadge } from "@/components/screen/VersionSideCard";
import type { ScreenVersion } from "@/lib/data/screenVersions";
import type { ProjectType } from "@/lib/data/types";

export interface CompareVersionsModalHandle {
  open: () => void;
  close: () => void;
}

type Props = {
  versions: ScreenVersion[];
  type: ProjectType;
  allowMock?: boolean;
  /** Snapshot kind for the compared previews — "screen" or "component". */
  kind?: "screen" | "component";
  onOpenInCanvas?: (selectedIds: string[]) => void;
};

type Mode = "grid" | "slider";
type Direction = "cols" | "rows" | "grid";

// Comparing more than a handful of screens at once is unreadable — cap the panels.
const MAX_PANELS = 4;

function isMain(v: ScreenVersion | undefined | null): boolean {
  return !!v && (v.tag === "main" || !v.tag);
}
function labelOf(v: ScreenVersion | undefined | null): string {
  if (!v) return "—";
  return isMain(v) ? "Main" : (v.tag ?? v.title);
}

export const CompareVersionsModal = forwardRef<CompareVersionsModalHandle, Props>(
  function CompareVersionsModal({ versions, type, kind = "screen", onOpenInCanvas }, ref) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<Mode>("grid");
    const [direction, setDirection] = useState<Direction>("cols");
    const [selection, setSelection] = useState<string[]>(() => versions.slice(0, 2).map((v) => v.id));
    const [sliderA, setSliderA] = useState<string>(() => versions[0]?.id ?? "");
    const [sliderB, setSliderB] = useState<string>(() => versions[1]?.id ?? versions[0]?.id ?? "");

    const close = () => setOpen(false);

    useImperativeHandle(ref, () => ({
      open: () => {
        setMode("grid");
        setDirection("cols");
        setSelection(versions.slice(0, 2).map((v) => v.id));
        setSliderA(versions[0]?.id ?? "");
        setSliderB(versions[1]?.id ?? versions[0]?.id ?? "");
        setOpen(true);
      },
      close,
    }));

    const byId = useMemo(() => new Map(versions.map((v) => [v.id, v] as const)), [versions]);
    const maxPanels = Math.min(MAX_PANELS, Math.max(1, versions.length));
    const unused = useMemo(
      () => versions.filter((v) => !selection.includes(v.id)),
      [versions, selection],
    );
    const canAdd = selection.length < maxPanels && unused.length > 0;

    // Add a SPECIFIC version chosen from the picker (not just the next free one) so you
    // pick exactly what to compare even with many versions.
    const addPanel = (id: string) => {
      setSelection((prev) =>
        prev.length >= maxPanels || prev.includes(id) ? prev : [...prev, id],
      );
    };
    const setSlot = (slot: number, id: string) =>
      setSelection((prev) => prev.map((p, i) => (i === slot ? id : p)));
    const removeSlot = (slot: number) =>
      setSelection((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== slot)));

    const openInCanvasIds = mode === "slider" ? Array.from(new Set([sliderA, sliderB])) : selection;

    return (
      <Modal open={open} onClose={close} size="xl" ariaLabel="Compare versions">
        <ModalHeader
          title="Compare versions"
          subtitle="Place versions of this screen side by side, or scrub a before/after slider."
          onClose={close}
          actions={
            <button
              type="button"
              onClick={() => onOpenInCanvas?.(openInCanvasIds)}
              className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
            >
              <IconOpenCanvas size={13} strokeWidth={1.7} />
              Open in canvas
            </button>
          }
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)] px-[18px] py-3">
            <Segmented
              options={[
                { id: "grid", label: "Grid" },
                { id: "slider", label: "Slider" },
              ]}
              value={mode}
              onChange={(m) => setMode(m as Mode)}
            />

            {mode === "grid" ? (
              <>
                <Divider />
                <Segmented
                  options={[
                    { id: "cols", label: "Columns", icon: <IconLayoutVertical size={12} strokeWidth={1.8} /> },
                    { id: "rows", label: "Rows", icon: <IconLayoutHorizontal size={12} strokeWidth={1.8} /> },
                    { id: "grid", label: "Grid", icon: <IconGrid size={12} strokeWidth={1.8} /> },
                  ]}
                  value={direction}
                  onChange={(d) => setDirection(d as Direction)}
                />
                <AddVersionPicker unused={unused} onAdd={addPanel} variant="button" disabled={!canAdd} />
                <div className="flex-1" />
                <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                  {selection.length} of {versions.length}
                </span>
              </>
            ) : (
              <>
                <Divider />
                <SideSelect label="A" versions={versions} value={sliderA} onChange={setSliderA} dot="#c9b3ff" />
                <SideSelect label="B" versions={versions} value={sliderB} onChange={setSliderB} dot="#9EE6AE" />
                <div className="flex-1" />
                <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Drag to scrub</span>
              </>
            )}
          </div>

          {mode === "grid" ? (
            <GridStage
              direction={direction}
              selection={selection}
              byId={byId}
              versions={versions}
              type={type}
              kind={kind}
              unused={canAdd ? unused : []}
              onAdd={addPanel}
              onSetSlot={setSlot}
              onRemoveSlot={removeSlot}
              onOpenCanvas={(slot) => onOpenInCanvas?.([selection[slot]!])}
            />
          ) : (
            <SliderStage a={byId.get(sliderA) ?? null} b={byId.get(sliderB) ?? null} type={type} kind={kind} />
          )}
        </div>
      </Modal>
    );
  },
);

// ── shared controls ─────────────────────────────────────────────────────────

function Divider() {
  return <span className="h-5 w-px shrink-0 bg-[var(--border)]" />;
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string; icon?: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={[
              "inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors",
              active ? "bg-[var(--surface-2)] text-[var(--text)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SideSelect({
  label,
  versions,
  value,
  onChange,
  dot,
}: {
  label: string;
  versions: ScreenVersion[];
  value: string;
  onChange: (id: string) => void;
  dot: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-bold" style={{ background: dot, color: "#111" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[28px] cursor-pointer rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-2 pr-6 text-[12px] text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
        style={{ appearance: "none", WebkitAppearance: "none" as never }}
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {labelOf(v)}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── grid mode ────────────────────────────────────────────────────────────────

function GridStage({
  direction,
  selection,
  byId,
  versions,
  type,
  kind,
  unused,
  onAdd,
  onSetSlot,
  onRemoveSlot,
  onOpenCanvas,
}: {
  direction: Direction;
  selection: string[];
  byId: Map<string, ScreenVersion>;
  versions: ScreenVersion[];
  type: ProjectType;
  kind: "screen" | "component";
  unused: ScreenVersion[];
  onAdd: (id: string) => void;
  onSetSlot: (slot: number, id: string) => void;
  onRemoveSlot: (slot: number) => void;
  onOpenCanvas: (slot: number) => void;
}) {
  const gridStyle: React.CSSProperties =
    direction === "cols"
      ? { gridAutoFlow: "column", gridAutoColumns: "minmax(0, 1fr)", gridTemplateRows: "1fr" }
      : direction === "rows"
        ? { gridAutoFlow: "row", gridAutoRows: "minmax(160px, 1fr)", gridTemplateColumns: "1fr" }
        : // "grid": wrap into 2 columns → 2×2 for four panels, beside AND below.
          { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridAutoRows: "minmax(180px, 1fr)" };

  return (
    <div className="flex-1 overflow-auto bg-[#0E0E0E] p-[18px]">
      <div className="grid h-full min-h-full w-full gap-3.5" style={gridStyle}>
        {selection.map((id, slotIdx) => (
          <Panel
            key={`${id}-${slotIdx}`}
            slotIdx={slotIdx}
            versions={versions}
            current={byId.get(id) ?? null}
            currentId={id}
            type={type}
            kind={kind}
            canRemove={selection.length > 1}
            onSetSlot={onSetSlot}
            onRemove={() => onRemoveSlot(slotIdx)}
            onOpenCanvas={() => onOpenCanvas(slotIdx)}
          />
        ))}
        {unused.length > 0 ? <AddVersionPicker unused={unused} onAdd={onAdd} variant="card" /> : null}
      </div>
    </div>
  );
}

function AddVersionPicker({
  unused,
  onAdd,
  variant,
  disabled = false,
}: {
  unused: ScreenVersion[];
  onAdd: (id: string) => void;
  variant: "card" | "button";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu = (
    <div
      role="menu"
      className={[
        "absolute z-[20] max-h-[220px] w-[180px] overflow-y-auto rounded-[10px] border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-md",
        variant === "card"
          ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          : "right-0 top-full mt-1",
      ].join(" ")}
    >
      <div className="px-2 py-1 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Add to compare</div>
      {unused.map((v) => (
        <button
          key={v.id}
          type="button"
          role="menuitem"
          onClick={() => { onAdd(v.id); setOpen(false); }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <span
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: isMain(v) ? "#3FB950" : "#9b6dff" }}
          />
          {labelOf(v)}
        </button>
      ))}
    </div>
  );

  if (variant === "button") {
    return (
      <div ref={rootRef} className="relative shrink-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 text-[12px] font-medium text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[var(--border-strong)] disabled:hover:bg-[var(--surface-2)] disabled:hover:text-[var(--text-soft)]"
        >
          <IconPlus size={13} strokeWidth={1.8} />
          Add window
        </button>
        {open && !disabled ? menu : null}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative min-h-[180px] min-w-[120px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="group grid h-full w-full cursor-pointer place-items-center rounded-[10px] border border-dashed border-[var(--border-strong)] bg-transparent text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
      >
        <span className="flex flex-col items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border-strong)] transition-colors group-hover:border-[var(--text)]">
            <IconPlus size={15} strokeWidth={1.8} />
          </span>
          <span className="text-[12px] font-medium">Add window</span>
        </span>
      </button>
      {open ? menu : null}
    </div>
  );
}

function Panel({
  slotIdx,
  versions,
  current,
  currentId,
  type,
  kind,
  canRemove,
  onSetSlot,
  onRemove,
  onOpenCanvas,
}: {
  slotIdx: number;
  versions: ScreenVersion[];
  current: ScreenVersion | null;
  currentId: string;
  type: ProjectType;
  kind: "screen" | "component";
  canRemove: boolean;
  onSetSlot: (slot: number, id: string) => void;
  onRemove: () => void;
  onOpenCanvas: () => void;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-2.5 py-2">
        {current ? <VersionTagBadge tag={isMain(current) ? "main" : current.tag} isMain={isMain(current)} /> : null}
        <select
          value={currentId}
          onChange={(e) => onSetSlot(slotIdx, e.target.value)}
          className="h-[26px] min-w-0 flex-1 cursor-pointer rounded-[5px] border border-[var(--border)] bg-[var(--bg)] py-0 pl-2 pr-[22px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
          style={{ appearance: "none", WebkitAppearance: "none" as never }}
        >
          {versions.map((vv) => (
            <option key={vv.id} value={vv.id}>
              {labelOf(vv)}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Open in canvas"
          title="Open in canvas"
          onClick={onOpenCanvas}
          className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <IconOpenCanvas size={13} strokeWidth={1.6} />
        </button>
        {canRemove ? (
          <button
            type="button"
            aria-label="Remove panel"
            title="Remove panel"
            onClick={onRemove}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <IconClose size={13} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-[var(--bg)] p-3.5">
        <VersionShot v={current} type={type} kind={kind} />
      </div>
    </div>
  );
}

// ── slider mode ──────────────────────────────────────────────────────────────

function SliderStage({ a, b, type, kind }: { a: ScreenVersion | null; b: ScreenVersion | null; type: ProjectType; kind: "screen" | "component" }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [pos, setPos] = useState(50);

  const updateFromClientX = (clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div className="flex-1 overflow-hidden bg-[#0E0E0E] p-[18px]">
      <div
        ref={stageRef}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) updateFromClientX(e.clientX);
        }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        className="relative mx-auto h-full w-full max-w-[680px] cursor-ew-resize select-none overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg)]"
      >
        {/* base: B (right side) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
          <VersionShot v={b} type={type} kind={kind} />
        </div>
        {/* overlay: A (left side), clipped to the divider */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center p-5"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          <VersionShot v={a} type={type} kind={kind} />
        </div>

        {/* labels */}
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[rgba(20,20,20,0.82)] px-2 py-1 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: "#c9b3ff" }} />
          <span className="text-[11px] font-medium text-[var(--text)]">{labelOf(a)}</span>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[rgba(20,20,20,0.82)] px-2 py-1 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: "#9EE6AE" }} />
          <span className="text-[11px] font-medium text-[var(--text)]">{labelOf(b)}</span>
        </div>

        {/* divider + handle */}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
          <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
          <div className="absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/85 bg-[rgba(20,20,20,0.85)] text-white shadow-[0_2px_10px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <IconLayoutHorizontal size={13} strokeWidth={2} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── preview ──────────────────────────────────────────────────────────────────

function VersionShot({ v, type, kind }: { v: ScreenVersion | null; type: ProjectType; kind: "screen" | "component" }) {
  if (!v?.variantId) {
    return (
      <div className="grid h-full w-full place-items-center text-[13px] text-[var(--text-faint)]">
        {kind === "component" ? "Empty component" : "Empty screen"}
      </div>
    );
  }
  return kind === "component" ? (
    <Snapshot kind="component" ownerType="variant" ownerId={v.variantId} seedKey={null} type={type} display="fit" />
  ) : (
    <Snapshot kind="screen" ownerType="variant" ownerId={v.variantId} variant={v.tpl} type={type} display="fit" />
  );
}
