import type { CanvasDocument, ElementNode, ElementStyles, ElementType } from "@/canvas/engine/types";
import { getAbsoluteRect, getParentSize } from "@/canvas/engine/geometry";
import {
  clamp,
  InsColor,
  InsInput,
  InsRow,
  InsSection,
  InsSelect,
  InsTextarea,
  InsToggle,
  Readout,
  updateNumber,
} from "./InsComponents";

type ElementTabProps = {
  node: ElementNode;
  parentName: string;
  document: CanvasDocument;
  onUpdateName: (name: string) => void;
  onUpdateText: (text: string) => void;
  onUpdateImageSource: (src: string) => void;
  onUpdateGeometry: (patch: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  onUpdateRotation: (rotation: number) => void;
  onUpdateStyle: (style: Partial<ElementStyles>) => void;
  onToggleLocked: (locked: boolean) => void;
  onToggleVisible: (visible: boolean) => void;
};

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

export function ElementTab({
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
}: ElementTabProps) {
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

// Re-exported for Inspector.tsx header label
export { elementTypeLabel };
