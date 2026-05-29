import type { CanvasProperties } from "@/canvas/engine/types";
import { clamp, InsColor, InsInput, InsRow, InsSection, InsToggle, updateNumber } from "./InsComponents";

type CanvasTabProps = {
  canvas: CanvasProperties;
  active: boolean;
  onToggleActive: (active: boolean) => void;
  onUpdate: (props: Partial<CanvasProperties>) => void;
};

export function CanvasTab({ canvas, active, onToggleActive, onUpdate }: CanvasTabProps) {
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
