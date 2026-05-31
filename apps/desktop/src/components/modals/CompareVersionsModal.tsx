import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { Modal, ModalHeader } from "./Modal";
import { getCanvasMockForTemplate } from "@/components/mocks/data/canvasMocks";
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
  onOpenInCanvas?: (selectedIds: string[]) => void;
};

type Direction = "cols" | "rows";

export const CompareVersionsModal = forwardRef<CompareVersionsModalHandle, Props>(
  function CompareVersionsModal({ versions, type, allowMock = false, onOpenInCanvas }, ref) {
    const [open, setOpen] = useState(false);
    const [direction, setDirection] = useState<Direction>("cols");
    const [selection, setSelection] = useState<string[]>(() =>
      versions.slice(0, 2).map((v) => v.id),
    );
    const close = () => setOpen(false);

    useImperativeHandle(ref, () => ({
      open: () => {
        setSelection(versions.slice(0, 2).map((v) => v.id));
        setOpen(true);
      },
      close,
    }));

    const summary = useMemo(
      () =>
        selection.length === 1
          ? "1 version selected"
          : `${selection.length} versions selected`,
      [selection],
    );

    const setCount = (n: number) => {
      const clamped = Math.max(1, Math.min(6, n));
      setSelection((prev) => {
        const next = [...prev];
        while (next.length < clamped) {
          const fallback =
            versions.find((v) => !next.includes(v.id)) ?? versions[0];
          if (fallback) next.push(fallback.id);
          else break;
        }
        while (next.length > clamped) next.pop();
        return next;
      });
    };

    const toggleVersion = (id: string) => {
      setSelection((prev) => {
        const idx = prev.indexOf(id);
        if (idx >= 0) {
          if (prev.length <= 1) return prev;
          return prev.filter((_, i) => i !== idx);
        }
        return [...prev, id];
      });
    };

    const setSlot = (slot: number, id: string) => {
      setSelection((prev) => prev.map((p, i) => (i === slot ? id : p)));
    };

    const removeSlot = (slot: number) => {
      setSelection((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== slot)));
    };

    return (
      <Modal open={open} onClose={close} size="xl" ariaLabel="Compare versions">
        <ModalHeader
          title="Compare versions"
          subtitle="Place versions of this screen side by side."
          onClose={close}
          actions={
            <button
              type="button"
              onClick={() => onOpenInCanvas?.(selection)}
              className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M3 9h18" />
              </svg>
              Open in canvas
            </button>
          }
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Toolbar
            direction={direction}
            onDirection={setDirection}
            count={selection.length}
            onCount={setCount}
            summary={summary}
          />
          <Tray versions={versions} selection={selection} onToggle={toggleVersion} />
          <Stage
            direction={direction}
            selection={selection}
            versions={versions}
            type={type}
            allowMock={allowMock}
            onSetSlot={setSlot}
            onRemoveSlot={removeSlot}
            onOpenCanvas={(slot) => onOpenInCanvas?.([selection[slot]])}
          />
        </div>
      </Modal>
    );
  },
);

function Toolbar({
  direction,
  onDirection,
  count,
  onCount,
  summary,
}: {
  direction: Direction;
  onDirection: (d: Direction) => void;
  count: number;
  onCount: (n: number) => void;
  summary: string;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] px-[18px] py-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Layout</span>
        <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg)] p-0.5">
          {(["cols", "rows"] as Direction[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDirection(d)}
              className={[
                "inline-flex cursor-pointer items-center gap-1.5 rounded border-0 bg-transparent px-2.5 py-1 text-[12px]",
                direction === d
                  ? "bg-[var(--surface-hover)] text-[var(--text)]"
                  : "text-[var(--text-muted)]",
              ].join(" ")}
            >
              {d === "cols" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="4" y="4" width="6" height="16" rx="1" />
                  <rect x="14" y="4" width="6" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="4" y="4" width="16" height="6" rx="1" />
                  <rect x="4" y="14" width="16" height="6" rx="1" />
                </svg>
              )}
              {d === "cols" ? "Colunas" : "Linhas"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Panels</span>
        <input
          type="range"
          min={1}
          max={6}
          step={1}
          value={count}
          onChange={(e) => onCount(parseInt(e.target.value, 10))}
          className="w-[120px]"
          style={{ accentColor: "var(--text)" }}
        />
        <span
          className="min-w-[14px] text-center text-[12px] text-[var(--text)]"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {count}
        </span>
      </div>
      <div className="flex-1" />
      <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">{summary}</span>
    </div>
  );
}

function Tray({
  versions,
  selection,
  onToggle,
}: {
  versions: ScreenVersion[];
  selection: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-[var(--border)] bg-[var(--bg)] px-[18px] py-2.5">
      {versions.map((v) => {
        const idx = selection.indexOf(v.id);
        const active = idx >= 0;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onToggle(v.id)}
            className={[
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
              active
                ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {active ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                <span>{idx + 1}</span>
              </>
            ) : null}
            <span>{v.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function Stage({
  direction,
  selection,
  versions,
  type,
  allowMock,
  onSetSlot,
  onRemoveSlot,
  onOpenCanvas,
}: {
  direction: Direction;
  selection: string[];
  versions: ScreenVersion[];
  type: ProjectType;
  allowMock: boolean;
  onSetSlot: (slot: number, id: string) => void;
  onRemoveSlot: (slot: number) => void;
  onOpenCanvas: (slot: number) => void;
}) {
  const gridStyle: React.CSSProperties =
    direction === "cols"
      ? { gridAutoFlow: "column", gridAutoColumns: "minmax(0, 1fr)", gridTemplateRows: "1fr" }
      : { gridAutoFlow: "row", gridAutoRows: "minmax(0, 1fr)", gridTemplateColumns: "1fr" };

  return (
    <div className="flex-1 overflow-auto bg-[#0E0E0E] p-[18px]">
      <div className="grid h-full min-h-full w-full gap-3.5" style={gridStyle}>
        {selection.map((id, slotIdx) => (
          <Panel
            key={`${id}-${slotIdx}`}
            slotIdx={slotIdx}
            versions={versions}
            currentId={id}
            type={type}
            allowMock={allowMock}
            onSetSlot={onSetSlot}
            onRemove={() => onRemoveSlot(slotIdx)}
            onOpenCanvas={() => onOpenCanvas(slotIdx)}
          />
        ))}
      </div>
    </div>
  );
}

function Panel({
  slotIdx,
  versions,
  currentId,
  type,
  allowMock,
  onSetSlot,
  onRemove,
  onOpenCanvas,
}: {
  slotIdx: number;
  versions: ScreenVersion[];
  currentId: string;
  type: ProjectType;
  allowMock: boolean;
  onSetSlot: (slot: number, id: string) => void;
  onRemove: () => void;
  onOpenCanvas: () => void;
}) {
  const v = versions.find((x) => x.id === currentId) ?? versions[0];
  const mock = allowMock && v ? getCanvasMockForTemplate(v.tpl, type) : null;
  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-2.5 py-2">
        <span className="rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
          #{slotIdx + 1}
        </span>
        <select
          value={currentId}
          onChange={(e) => onSetSlot(slotIdx, e.target.value)}
          className="h-[26px] min-w-0 flex-1 cursor-pointer rounded-[5px] border border-[var(--border)] bg-[var(--bg)] py-0 pl-2 pr-[22px] text-[12px] text-[var(--text)] outline-none"
          style={{ appearance: "none", WebkitAppearance: "none" as never }}
        >
          {versions.map((vv) => (
            <option key={vv.id} value={vv.id}>
              {vv.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Open in canvas"
          onClick={onOpenCanvas}
          className="grid h-6 w-6 cursor-pointer place-items-center rounded border-0 bg-transparent text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="M3 9h18" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Remove panel"
          onClick={onRemove}
          className="grid h-6 w-6 cursor-pointer place-items-center rounded border-0 bg-transparent text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="flex flex-1 items-stretch justify-stretch overflow-hidden bg-[var(--bg)] p-3.5">
        <div className="flex h-full w-full items-center justify-center overflow-hidden">
          {mock ? (
            <img
              src={mock.snapshot}
              alt=""
              className="block h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[13px] text-[var(--text-faint)]">
              Empty screen
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
