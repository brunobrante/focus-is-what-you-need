import { useMemo } from "react";
import { getElementDefinition } from "@/canvas/engine/elementDefinitions";
import { elementTypeLabel } from "@/canvas/engine/mutations/elementCreate";
import { canFlattenToPath } from "@/canvas/engine/vector/shapeToPath";
import type { CanvasDocument, Effect, ElementNode, ElementSizing, ElementStyles, ElementType, Fill } from "@/canvas/engine/types";
import { effectTargetForType } from "@/domain/canvas/effects";
import { borderTargetForType } from "@/domain/canvas/border";
import { fillTargetForType } from "@/domain/canvas/fillCompile";
import { normalizeFills, fillsToWritePatch } from "@/domain/canvas/fill";
import { AppearanceSection } from "./AppearanceSection";
import { LayoutSection } from "./LayoutSection";
import { BorderSection } from "./BorderSection";
import { EffectsSection } from "./EffectsSection";
import { TypographySection } from "./TypographySection";
import { FillSection, type GradientTokenOption } from "./FillSection";
import { ExportSection } from "./ExportSection";
import { getAbsoluteRect, getParentSize } from "@/canvas/engine/geometry";
import { IconLink } from "@/components/icons";
import { useResolvedSystemDesign } from "@/canvas/stage/resolvedSystemDesignContext";
import type { ColorToken, GradientToken } from "@/domain/system-design/types";
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
  onUpdateGeometry: (patch: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  onUpdateRotation: (rotation: number) => void;
  onUpdateStyle: (style: Partial<ElementStyles>) => void;
  /** Commit a Fill-panel change: a style patch plus an optional image `src`, in
   *  one document (so the two don't overwrite each other). */
  onUpdateFill: (style: Partial<ElementStyles>, src?: string) => void;
  /** Begin a slider / native-color scrub — subsequent style/fill updates are
   *  transient until onScrubEnd, coalescing into one undo entry (H3). */
  onScrubStart?: () => void;
  /** End a scrub — commit the last transient frame as a single history entry. */
  onScrubEnd?: () => void;
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

export function ElementTab({
  node,
  document,
  onUpdateName,
  onUpdateText,
  onUpdateGeometry,
  onUpdateRotation,
  onUpdateStyle,
  onUpdateFill,
  onScrubStart,
  onScrubEnd,
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
  const rect = getAbsoluteRect(document, node.id);
  const parentSize = getParentSize(document, node.id);
  const resolvedDesign = useResolvedSystemDesign();
  const colorTokens = useMemo<InsColorToken[]>(
    () =>
      (resolvedDesign?.colors.tokens ?? []).map((sourced) => {
        const token = sourced.token as ColorToken;
        return { id: token.id, name: token.name, value: token.value };
      }),
    [resolvedDesign],
  );
  const gradientTokens = useMemo<GradientTokenOption[]>(
    () =>
      (resolvedDesign?.gradients.tokens ?? []).map((sourced) => {
        const token = sourced.token as GradientToken;
        return {
          id: token.id,
          name: token.name,
          css: `linear-gradient(${token.angle}deg, ${token.from}, ${token.to})`,
        };
      }),
    [resolvedDesign],
  );
  const fillTarget = fillTargetForType(node.type);
  // The Fill panel edits a normalized Fill[]; we translate it back to the stored
  // shape (collapsing the trivial solid/image cases to `background` / `src`).
  const handleFillsChange = (next: Fill[]) => {
    const patch = fillsToWritePatch(next, node.type);
    const stylePatch: Partial<ElementStyles> = {
      fills: patch.fills,
      background: patch.background,
      backgroundRef: patch.backgroundRef,
    };
    if (patch.objectFit !== undefined) stylePatch.objectFit = patch.objectFit as ElementStyles["objectFit"];
    // Style + image src commit together in one document (see Inspector.commitFill).
    onUpdateFill(stylePatch, patch.src);
  };
  const def = getElementDefinition(node.type).capabilities;
  const c = def.constraints;
  const clampW = (w: number) => clamp(w, c.width.min, c.width.max ?? w);
  const clampH = (h: number) => clamp(h, c.height.min, c.height.max ?? h);
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
            Linked instance — read-only. Detach to edit.
            {lockedInstanceVariantId && onGoToInstance ? (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => onGoToInstance(lockedInstanceVariantId)}
                  className="cursor-pointer border-0 bg-transparent p-0 font-medium text-[#8638E5] underline underline-offset-2 hover:text-[#A855E6]"
                >
                  Or click here
                </button>{" "}
                to open the component.
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

      <InsSection title="Size" disabled={locked}>
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

      <LayoutSection
        styles={node.styles}
        type={node.type}
        hasChildren={node.children.length > 0}
        parentStyles={node.parentId ? document.elements[node.parentId]?.styles ?? null : null}
        isRoot={!node.parentId}
        locked={locked}
        onChange={onUpdateStyle}
      />

      {fillTarget ? (
        <FillSection
          fills={normalizeFills({
            type: node.type,
            fills: node.styles.fills,
            background: node.styles.background,
            backgroundRef: node.styles.backgroundRef,
            src: node.src,
            objectFit: node.styles.objectFit,
          })}
          target={fillTarget}
          tokens={colorTokens}
          gradientTokens={gradientTokens}
          locked={locked}
          onChange={handleFillsChange}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
      ) : null}

      <AppearanceSection
        styles={node.styles}
        radius={def.radius}
        radiusRole={def.radiusRole}
        radiusConstraint={c.radius}
        width={node.width}
        height={node.height}
        hasChildren={node.children.length > 0}
        locked={locked}
        onChange={onUpdateStyle}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
      />

      <BorderSection
        styles={node.styles}
        target={borderTargetForType(node.type)}
        tokens={colorTokens}
        locked={locked}
        onChange={onUpdateStyle}
      />

      <EffectsSection
        effects={node.styles.effects ?? []}
        target={effectTargetForType(node.type)}
        tokens={colorTokens}
        locked={locked}
        onChange={(effects: Effect[]) => onUpdateStyle({ effects })}
      />

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
        <TypographySection
          styles={node.styles}
          tokens={colorTokens}
          heightFit={heightFit}
          locked={locked}
          onChange={onUpdateStyle}
        />
      ) : null}

      <ExportSection node={node} document={document} locked={locked} />
    </>
  );
}

// Re-exported for Inspector.tsx header label
export { elementTypeLabel } from "@/canvas/engine/mutations/elementCreate";
