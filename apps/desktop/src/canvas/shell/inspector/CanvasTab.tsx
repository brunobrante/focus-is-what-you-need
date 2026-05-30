import type { CanvasProperties } from "@/canvas/engine/types";
import { clamp, InsColor, InsInput, InsRow, InsSection, updateNumber } from "./InsComponents";

type CanvasTabProps = {
  canvas: CanvasProperties;
  active: boolean;
  onToggleActive: (active: boolean) => void;
  onUpdate: (props: Partial<CanvasProperties>) => void;
};

export function CanvasTab({ canvas, active, onToggleActive, onUpdate }: CanvasTabProps) {
  const editing = active;

  return (
    <>
      <fieldset
        disabled={!editing}
        className="m-0 w-full border-0 p-0"
        style={{ opacity: editing ? 1 : 0.45 }}
      >
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
      </fieldset>
      <div className="border-t border-[#2C2C2C] px-3.5 py-3">
        <button
          type="button"
          onClick={() => onToggleActive(!editing)}
          className="w-full cursor-pointer rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors duration-[100ms]"
          style={{
            background: editing ? "rgba(13,153,255,0.12)" : "#1E1E1E",
            borderColor: editing ? "rgba(13,153,255,0.4)" : "#333",
            color: editing ? "#7CC7FF" : "#CFCFCF",
          }}
        >
          {editing ? "Salvar" : "Editar"}
        </button>
      </div>
    </>
  );
}
