import { useMemo, useState } from "react";
import { createId } from "@/canvas/engine/actions";
import type { CanvasDocument, ElementNode } from "@/canvas/engine/types";
import { IconPlus, IconTrash } from "@/components/icons";
import { runElementExport } from "@/lib/canvas/export/runExport";
import {
  DEFAULT_BACKGROUND,
  type ExportBackground,
  type ExportEntry,
  type ExportFormat,
  type HtmlExportMode,
  isRasterFormat,
} from "@/lib/canvas/export/types";
import {
  InsColor,
  InsInput,
  InsRow,
  InsSection,
  InsSelect,
  InsToggle,
} from "./InsComponents";

// Per-element Export panel (Inspector → Export). Exports the selected element to
// PNG / JPEG / WebP / SVG / HTML — see docs/inspector-export.md. Entry state is
// ephemeral (a terminal user action, not persisted style). Distinct from the
// project-level `.figx` export.

const FORMAT_LABELS: Record<ExportFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
  svg: "SVG",
  html: "HTML",
};
const FORMAT_VALUES = Object.keys(FORMAT_LABELS) as ExportFormat[];
const LABEL_TO_FORMAT = new Map(FORMAT_VALUES.map((f) => [FORMAT_LABELS[f], f] as const));

const SCALE_OPTIONS = ["0.5", "1", "2", "3"];

const iconButtonClass =
  "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] border border-[#2C2C2C] text-[#A6A6A6] transition-colors hover:border-[#3A3A3A] hover:text-[#E2E2E2] disabled:cursor-not-allowed disabled:opacity-30";

function newEntry(): ExportEntry {
  return { id: createId("exp"), scale: 1, format: "png", suffix: "" };
}

function ExportEntryRow({
  entry,
  canRemove,
  onUpdate,
  onRemove,
}: {
  entry: ExportEntry;
  canRemove: boolean;
  onUpdate: (patch: Partial<ExportEntry>) => void;
  onRemove: () => void;
}) {
  const raster = isRasterFormat(entry.format);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-[#2C2C2C] bg-[#181818] p-2">
      <InsRow label="Format">
        <InsSelect
          value={FORMAT_LABELS[entry.format]}
          onChange={(label) => onUpdate({ format: LABEL_TO_FORMAT.get(label) ?? "png" })}
          options={FORMAT_VALUES.map((f) => FORMAT_LABELS[f])}
        />
        <button type="button" className={iconButtonClass} title="Remove" onClick={onRemove} disabled={!canRemove}>
          <IconTrash size={12} />
        </button>
      </InsRow>
      {raster ? (
        <InsRow label="Scale">
          <InsSelect
            value={String(entry.scale)}
            onChange={(value) => onUpdate({ scale: Number(value) || 1 })}
            options={SCALE_OPTIONS}
          />
        </InsRow>
      ) : null}
      <InsRow label="Suffix">
        <InsInput
          value={entry.suffix}
          onChange={(suffix) => onUpdate({ suffix })}
          placeholder={raster && entry.scale !== 1 ? `@${entry.scale}x` : "none"}
        />
      </InsRow>
    </div>
  );
}

export function ExportSection({
  node,
  document,
  locked = false,
}: {
  node: ElementNode;
  document: CanvasDocument;
  locked?: boolean;
}) {
  const [entries, setEntries] = useState<ExportEntry[]>(() => [newEntry()]);
  const [background, setBackground] = useState<ExportBackground>(DEFAULT_BACKGROUND);
  const [htmlMode, setHtmlMode] = useState<HtmlExportMode>("standalone");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const hasRaster = useMemo(() => entries.some((e) => isRasterFormat(e.format)), [entries]);
  const hasHtml = useMemo(() => entries.some((e) => e.format === "html"), [entries]);

  const updateAt = (index: number, patch: Partial<ExportEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  const remove = (index: number) => setEntries((prev) => prev.filter((_, i) => i !== index));
  const add = () => setEntries((prev) => [...prev, newEntry()]);

  const onExport = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await runElementExport({
        document,
        nodeId: node.id,
        entries,
        background,
        htmlMode,
      });
      if (result.savedPath) {
        setNotice(`Exported ${result.fileCount} file${result.fileCount > 1 ? "s" : ""}.`);
      } else {
        setNotice("Export cancelled.");
      }
    } catch (error) {
      setNotice(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <InsSection title="Export" defaultOpen={false} disabled={locked}>
      {entries.map((entry, index) => (
        <ExportEntryRow
          key={entry.id}
          entry={entry}
          canRemove={entries.length > 1}
          onUpdate={(patch) => updateAt(index, patch)}
          onRemove={() => remove(index)}
        />
      ))}

      {hasRaster ? (
        <>
          <InsRow label="Background">
            <InsToggle
              value={background.mode}
              onChange={(mode) => setBackground((prev) => ({ ...prev, mode: mode as ExportBackground["mode"] }))}
              options={[
                { value: "transparent", label: "None" },
                { value: "color", label: "Color" },
                { value: "flatten", label: "Flatten" },
              ]}
            />
          </InsRow>
          {background.mode !== "transparent" ? (
            <InsRow label="Color">
              <InsColor
                value={background.color}
                onChange={(color) => setBackground((prev) => ({ ...prev, color }))}
              />
            </InsRow>
          ) : null}
        </>
      ) : null}

      {hasHtml ? (
        <InsRow label="HTML">
          <InsToggle
            value={htmlMode}
            onChange={(mode) => setHtmlMode(mode as HtmlExportMode)}
            options={[
              { value: "standalone", label: "Single file" },
              { value: "bundle", label: "Bundle" },
            ]}
          />
        </InsRow>
      ) : null}

      <button
        type="button"
        onClick={add}
        className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[#2C2C2C] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[#F2F2F2] hover:bg-[#2A2A2A]"
      >
        <IconPlus size={12} />
        Add export
      </button>

      <button
        type="button"
        onClick={onExport}
        disabled={busy || entries.length === 0}
        className="flex w-full cursor-pointer items-center justify-center rounded-md border-0 bg-[#8638E5] px-2 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#7A2FD8] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Exporting…" : "Export"}
      </button>

      {notice ? <p className="text-[11px] leading-5 text-[#9A9A9A]">{notice}</p> : null}
    </InsSection>
  );
}
