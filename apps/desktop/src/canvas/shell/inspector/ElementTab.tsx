import { useMemo } from "react";
import { getElementDefinition } from "@/canvas/engine/elementDefinitions";
import { elementTypeLabel } from "@/canvas/engine/mutations/elementCreate";
import { canFlattenToPath } from "@/canvas/engine/vector/shapeToPath";
import type { CanvasDocument, ElementNode, ElementSizing, ElementStyles, ElementType } from "@/canvas/engine/types";
import { getAbsoluteRect, getParentSize } from "@/canvas/engine/geometry";
import { IconLink } from "@/components/icons";
import { useResolvedSystemDesign } from "@/canvas/stage/resolvedSystemDesignContext";
import type { ColorToken } from "@/domain/system-design/types";
import {
  clamp,
  InsColor,
  type InsColorToken,
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
  document: CanvasDocument;
  onUpdateName: (name: string) => void;
  onUpdateText: (text: string) => void;
  onUpdateImageSource: (src: string) => void;
  onUpdateGeometry: (patch: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  onUpdateRotation: (rotation: number) => void;
  onUpdateStyle: (style: Partial<ElementStyles>) => void;
  onUpdateSizing: (sizing: ElementSizing) => void;
  onToggleLocked: (locked: boolean) => void;
  onToggleVisible: (visible: boolean) => void;
  /** Enter path edit mode (path elements only). */
  onEditPath?: () => void;
  /** Convert a primitive shape into an editable path. */
  onFlattenToPath?: () => void;
  /** When true every field is shown but read-only (linked instance or its descendants). */
  locked?: boolean;
  /** Master variant the banner link opens (the instance root's variant), or null. */
  lockedInstanceVariantId?: string | null;
  /** Opens the master variant this instance points to (used by the locked banner link). */
  onGoToInstance?: (variantId: string) => void;
};

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
  document,
  onUpdateName,
  onUpdateText,
  onUpdateImageSource,
  onUpdateGeometry,
  onUpdateRotation,
  onUpdateStyle,
  onUpdateSizing,
  onToggleLocked,
  onToggleVisible,
  onEditPath,
  onFlattenToPath,
  locked = false,
  lockedInstanceVariantId = null,
  onGoToInstance,
}: ElementTabProps) {
  const isVector = node.type === "path" || node.type === "svg";
  const fillOpacity = Math.round((node.styles.fillOpacity ?? 1) * 100);
  const strokeOpacity = Math.round((node.styles.strokeOpacity ?? 1) * 100);
  const rect = getAbsoluteRect(document, node.id);
  const parentSize = getParentSize(document, node.id);
  const opacity = Math.round((node.styles.opacity ?? 1) * 100);
  const resolvedDesign = useResolvedSystemDesign();
  const colorTokens = useMemo<InsColorToken[]>(
    () =>
      (resolvedDesign?.colors.tokens ?? []).map((sourced) => {
        const token = sourced.token as ColorToken;
        return { id: token.id, name: token.name, value: token.value };
      }),
    [resolvedDesign],
  );
  const def = getElementDefinition(node.type).capabilities;
  const c = def.constraints;
  const clampW = (w: number) => clamp(w, c.width.min, c.width.max ?? w);
  const clampH = (h: number) => clamp(h, c.height.min, c.height.max ?? h);
  const clampR = (r: number) => c.radius ? clamp(r, c.radius.min, c.radius.max ?? r) : r;
  const widthFit = node.type === "text" && node.sizing?.width === "fit";
  const heightFit = node.type === "text" && node.sizing?.height === "fit";

  return (
    <>
      {locked ? (
        <div className="flex items-start gap-2 border-b border-[#2C2C2C] bg-[#1A1A1A] px-3.5 py-2.5 text-[11px] text-[#8638E5]">
          <span className="mt-px shrink-0">
            <IconLink size={12} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 leading-snug text-[#9A9A9A]">
            Instância linkada — somente leitura. Faça detach para editar.
            {lockedInstanceVariantId && onGoToInstance ? (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => onGoToInstance(lockedInstanceVariantId)}
                  className="cursor-pointer border-0 bg-transparent p-0 font-medium text-[#8638E5] underline underline-offset-2 hover:text-[#A855E6]"
                >
                  Ou clique aqui
                </button>{" "}
                para abrir o componente.
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {node.type === "text" ? (
        <InsSection title="Content" disabled={locked}>
          <InsTextarea value={node.content ?? ""} onChange={onUpdateText} />
        </InsSection>
      ) : null}

      <InsSection title="Position" disabled={locked}>
        <Readout label="Abs X" value={String(Math.round(rect?.x ?? 0))} />
        <Readout label="Abs Y" value={String(Math.round(rect?.y ?? 0))} />
        <InsRow label="X">
          <InsInput value={String(node.x)} onChange={(value) => updateNumber(value, (x) => onUpdateGeometry({ x }))} suffix="px" />
        </InsRow>
        <InsRow label="Y">
          <InsInput value={String(node.y)} onChange={(value) => updateNumber(value, (y) => onUpdateGeometry({ y }))} suffix="px" />
        </InsRow>
        <InsRow label="Rotation">
          <InsInput value={String(Math.round(node.rotation))} onChange={(value) => updateNumber(value, onUpdateRotation)} suffix="°" />
        </InsRow>
      </InsSection>

      <InsSection title="Tamanho" disabled={locked}>
        {node.type === "text" ? (
          <>
            <InsRow label="W mode">
              <InsToggle
                value={widthFit ? "fit" : "fixed"}
                onChange={(width) => onUpdateSizing({ width: width as ElementSizing["width"] })}
                options={[
                  { value: "fixed", label: "Fixed" },
                  { value: "fit", label: "Fit" },
                ]}
              />
            </InsRow>
            <InsRow label="H mode">
              <InsToggle
                value={heightFit ? "fit" : "fixed"}
                onChange={(height) => onUpdateSizing({ height: height as ElementSizing["height"] })}
                options={[
                  { value: "fixed", label: "Fixed" },
                  { value: "fit", label: "Fit" },
                ]}
              />
            </InsRow>
          </>
        ) : null}
        {widthFit ? (
          <Readout label="W" value={`${node.width} px fit`} />
        ) : (
          <InsRow label="W">
            <InsInput value={String(node.width)} onChange={(value) => updateNumber(value, (w) => onUpdateGeometry({ width: clampW(w) }))} suffix="px" />
          </InsRow>
        )}
        {heightFit ? (
          <Readout label="H" value={`${node.height} px fit`} />
        ) : (
          <InsRow label="H">
            <InsInput value={String(node.height)} onChange={(value) => updateNumber(value, (h) => onUpdateGeometry({ height: clampH(h) }))} suffix="px" />
          </InsRow>
        )}
        <Readout label="Min W" value={String(c.width.min)} />
        {c.width.max !== undefined && <Readout label="Max W" value={String(c.width.max)} />}
        <Readout label="Min H" value={String(c.height.min)} />
        {c.height.max !== undefined && <Readout label="Max H" value={String(c.height.max)} />}
      </InsSection>

      <InsSection title="Layout" defaultOpen={false} disabled={locked}>
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

      <InsSection title="Appearance" disabled={locked}>
        <InsRow label="Fill">
          <InsColor
            value={node.styles.background ?? "#FFFFFF"}
            onChange={(background) => onUpdateStyle({ background, backgroundRef: undefined })}
            tokens={colorTokens}
            boundRef={node.styles.backgroundRef}
            onBind={(backgroundRef) => onUpdateStyle({ backgroundRef })}
          />
        </InsRow>
        <InsRow label="Opacity">
          <InsInput value={String(opacity)} onChange={(value) => updateNumber(value, (next) => onUpdateStyle({ opacity: clamp(next, 0, 100) / 100 }))} suffix="%" />
        </InsRow>
        {def.radius && (
          <InsRow label="Radius">
            <InsInput
              value={String(node.styles.borderRadius ?? 0)}
              onChange={(value) => updateNumber(value, (r) => onUpdateStyle({ borderRadius: clampR(r) }))}
              suffix={def.radiusRole === "ratio" ? "%" : "px"}
            />
          </InsRow>
        )}
        <InsRow label="Border">
          <InsInput value={String(node.styles.borderWidth ?? 0)} onChange={(value) => updateNumber(value, (borderWidth) => onUpdateStyle({ borderWidth }))} suffix="px" />
        </InsRow>
        <InsRow label="Borda">
          <InsColor
            value={node.styles.borderColor ?? "#CBD5E1"}
            onChange={(borderColor) => onUpdateStyle({ borderColor, borderColorRef: undefined })}
            tokens={colorTokens}
            boundRef={node.styles.borderColorRef}
            onBind={(borderColorRef) => onUpdateStyle({ borderColorRef })}
          />
        </InsRow>
      </InsSection>

      {isVector ? (
        <InsSection title="Vector" disabled={locked}>
          <InsRow label="Fill">
            <InsColor
              value={node.styles.fill ?? "#000000"}
              onChange={(fill) => onUpdateStyle({ fill })}
              tokens={colorTokens}
            />
          </InsRow>
          <InsRow label="Fill opacity">
            <InsInput value={String(fillOpacity)} onChange={(value) => updateNumber(value, (n) => onUpdateStyle({ fillOpacity: clamp(n, 0, 100) / 100 }))} suffix="%" />
          </InsRow>
          <InsRow label="Fill rule">
            <InsSelect
              value={node.styles.fillRule ?? node.path?.fillRule ?? "nonzero"}
              onChange={(value) => onUpdateStyle({ fillRule: value as ElementStyles["fillRule"] })}
              options={["nonzero", "evenodd"]}
            />
          </InsRow>
          <InsRow label="Stroke">
            <InsColor
              value={node.styles.stroke ?? "#000000"}
              onChange={(stroke) => onUpdateStyle({ stroke })}
              tokens={colorTokens}
            />
          </InsRow>
          <InsRow label="Stroke W">
            <InsInput value={String(node.styles.strokeWidth ?? 0)} onChange={(value) => updateNumber(value, (strokeWidth) => onUpdateStyle({ strokeWidth }))} suffix="px" />
          </InsRow>
          <InsRow label="Stroke opacity">
            <InsInput value={String(strokeOpacity)} onChange={(value) => updateNumber(value, (n) => onUpdateStyle({ strokeOpacity: clamp(n, 0, 100) / 100 }))} suffix="%" />
          </InsRow>
          <InsRow label="Cap">
            <InsSelect
              value={node.styles.strokeLinecap ?? "butt"}
              onChange={(value) => onUpdateStyle({ strokeLinecap: value as ElementStyles["strokeLinecap"] })}
              options={["butt", "round", "square"]}
            />
          </InsRow>
          <InsRow label="Join">
            <InsSelect
              value={node.styles.strokeLinejoin ?? "miter"}
              onChange={(value) => onUpdateStyle({ strokeLinejoin: value as ElementStyles["strokeLinejoin"] })}
              options={["miter", "round", "bevel"]}
            />
          </InsRow>
          <InsRow label="Dash">
            <InsInput value={node.styles.strokeDasharray ?? ""} onChange={(value) => onUpdateStyle({ strokeDasharray: value || undefined })} placeholder="4 2" />
          </InsRow>
          {node.type === "path" && onEditPath ? (
            <button
              type="button"
              onClick={onEditPath}
              disabled={locked}
              className="mt-1 w-full cursor-pointer rounded-md border border-[#2C2C2C] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[#F2F2F2] hover:bg-[#2A2A2A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit path
            </button>
          ) : null}
        </InsSection>
      ) : null}

      {canFlattenToPath(node.type) && onFlattenToPath ? (
        <InsSection title="Convert" defaultOpen={false} disabled={locked}>
          <button
            type="button"
            onClick={onFlattenToPath}
            disabled={locked}
            className="w-full cursor-pointer rounded-md border border-[#2C2C2C] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[#F2F2F2] hover:bg-[#2A2A2A] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Flatten to path
          </button>
        </InsSection>
      ) : null}

      {node.type === "text" ? (
        <InsSection title="Tipografia" defaultOpen={false} disabled={locked}>
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
            <InsColor
              value={node.styles.color ?? "#111827"}
              onChange={(color) => onUpdateStyle({ color, colorRef: undefined })}
              tokens={colorTokens}
              boundRef={node.styles.colorRef}
              onBind={(colorRef) => onUpdateStyle({ colorRef })}
            />
          </InsRow>
        </InsSection>
      ) : null}

      {node.type === "image" ? (
        <InsSection title="Image" defaultOpen={false} disabled={locked}>
          <InsRow label="URL">
            <InsInput value={node.src ?? ""} onChange={onUpdateImageSource} placeholder="https://..." />
          </InsRow>
        </InsSection>
      ) : null}
    </>
  );
}

// Re-exported for Inspector.tsx header label
export { elementTypeLabel } from "@/canvas/engine/mutations/elementCreate";
