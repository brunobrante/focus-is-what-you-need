import { useMemo, useState, type ReactNode } from "react";
import { getElementDefinition } from "@/canvas/engine/elementDefinitions";
import { elementTypeLabel } from "@/canvas/engine/mutations/elementCreate";
import { canFlattenToPath } from "@/canvas/engine/vector/shapeToPath";
import { pathIsClosed } from "@/domain/canvas/vector";
import { shapeOutline } from "@/domain/canvas/shapeGeometry";
import type { CanvasDocument, Effect, ElementNode, ElementSizing, ElementStyles, ElementType, Fill, Rect } from "@/canvas/engine/types";
import { effectTargetForType } from "@/domain/canvas/effects";
import { borderTargetForType } from "@/domain/canvas/border";
import { fillTargetForType } from "@/domain/canvas/fillCompile";
import { normalizeFills, fillsToWritePatch } from "@/domain/canvas/fill";
import type { AlignEdge } from "@/canvas/engine/actions";
import { AlignRow } from "./AlignRow";
import { AppearanceSection } from "./AppearanceSection";
import { LayoutSection } from "./LayoutSection";
import { BorderSection } from "./BorderSection";
import { EffectsSection } from "./EffectsSection";
import { TypographySection } from "./TypographySection";
import { FillSection, type GradientTokenOption } from "./FillSection";
import { ExportSection } from "./ExportSection";
import { IconLink } from "@/components/icons";
import { useResolvedSystemDesign } from "@/canvas/stage/resolvedSystemDesignContext";
import type { ColorToken, GradientToken } from "@/domain/system-design/types";
import {
  clamp,
  FieldGroup,
  type InsColorToken,
  InsInput,
  InsRow,
  InsSection,
  InsSelect,
  InsTextarea,
  InsToggle,
  insButtonClass,
  Readout,
  updateNumber,
} from "./InsComponents";
import { InsColor } from "./ColorPicker";

/** A small rotation glyph for the field icon slot. */
const RotateGlyph = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path
      d="M8 3.5A4.5 4.5 0 1 0 12.5 8M8 3.5V1.5M8 3.5H6"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** An inline reveal for secondary metadata (absolute position, size limits). */
function MoreDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-0.5 flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-[11px] text-[#7C7C7C] transition-colors hover:text-[#B0B0B0]"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        {open ? "Less" : "More"}
      </button>
      {open ? <div className="flex flex-col gap-[7px]">{children}</div> : null}
    </>
  );
}

type ElementTabProps = {
  node: ElementNode;
  /** The node's canvas-absolute rect, selected upstream (null when unresolvable). */
  rect: Rect | null;
  /** The parent's styles, for the Layout section's flow-child controls. */
  parentStyles: ElementStyles | null;
  /** Reads the live document at event time; only Export needs it (P4). */
  getDocument: () => CanvasDocument | null;
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
  /** Align this element within its parent's content box (G1). */
  onAlign?: (edge: AlignEdge) => void;
  /** On-canvas gradient editing (G11): which fill the overlay edits, or null. */
  canvasEditFillIndex?: number | null;
  onToggleCanvasEdit?: (fillIndex: number | null) => void;
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
  rect,
  parentStyles,
  getDocument,
  onUpdateName,
  onUpdateText,
  onUpdateGeometry,
  onUpdateRotation,
  onUpdateStyle,
  onUpdateFill,
  onScrubStart,
  onScrubEnd,
  onUpdateSizing,
  onAlign,
  canvasEditFillIndex = null,
  onToggleCanvasEdit,
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
  // Keep the normalized fills array reference-stable across renders whose fill
  // inputs didn't change (P4): transient drag frames share the node's styles
  // object, so this bails for the whole drag instead of fabricating a fresh
  // array (and re-rendering the Fill subtree) per frame.
  const normalizedFills = useMemo(
    () =>
      normalizeFills({
        type: node.type,
        fills: node.styles.fills,
        background: node.styles.background,
        backgroundRef: node.styles.backgroundRef,
        // Text solids live on the glyph color, not background (M12).
        color: node.styles.color,
        colorRef: node.styles.colorRef,
        src: node.src,
        objectFit: node.styles.objectFit,
      }),
    [
      node.type,
      node.styles.fills,
      node.styles.background,
      node.styles.backgroundRef,
      node.styles.color,
      node.styles.colorRef,
      node.src,
      node.styles.objectFit,
    ],
  );
  // The Fill panel edits a normalized Fill[]; we translate it back to the stored
  // shape (collapsing the trivial solid/image cases to `background` / `src`).
  const handleFillsChange = (next: Fill[]) => {
    const patch = fillsToWritePatch(next, node.type);
    const stylePatch: Partial<ElementStyles> = {
      fills: patch.fills,
      background: patch.background,
      backgroundRef: patch.backgroundRef,
    };
    // A text solid maps to the glyph `color`, not the box `background` (M12).
    if (patch.color !== undefined) {
      stylePatch.color = patch.color;
      stylePatch.colorRef = patch.colorRef;
    } else if (node.type === "text" && patch.fills !== undefined) {
      // An explicit fills list drives the glyphs (multi-fill clips to text; an empty
      // list paints nothing) — clear the stale single-solid glyph color so it can't
      // linger behind an empty panel (M11).
      stylePatch.color = undefined;
      stylePatch.colorRef = undefined;
    }
    if (patch.objectFit !== undefined) stylePatch.objectFit = patch.objectFit as ElementStyles["objectFit"];
    // Style + image src commit together in one document (see Inspector.commitFill).
    onUpdateFill(stylePatch, patch.src);
  };
  const def = getElementDefinition(node.type).capabilities;
  const c = def.constraints;
  // Fall back to Infinity (not the typed value) for a missing max, so an entry
  // below min still clamps up to min instead of inverting lo/hi (L6).
  const clampW = (w: number) => clamp(w, c.width.min, c.width.max ?? Infinity);
  const clampH = (h: number) => clamp(h, c.height.min, c.height.max ?? Infinity);
  const widthFit = node.type === "text" && node.sizing?.width === "fit";
  const heightFit = node.type === "text" && node.sizing?.height === "fit";

  // Aspect-ratio lock (session-local UI state, not persisted). When on, editing
  // one dimension scales the other by the node's current W:H so the shape keeps
  // its proportions. The ratio is read at commit time from the live node.
  const [aspectLocked, setAspectLocked] = useState(false);
  const commitWidth = (w: number) => {
    const width = clampW(w);
    if (aspectLocked && node.width > 0 && node.height > 0) {
      onUpdateGeometry({ width, height: clampH(Math.round((width * node.height) / node.width)) });
    } else {
      onUpdateGeometry({ width });
    }
  };
  const commitHeight = (h: number) => {
    const height = clampH(h);
    if (aspectLocked && node.width > 0 && node.height > 0) {
      onUpdateGeometry({ width: clampW(Math.round((height * node.width) / node.height)), height });
    } else {
      onUpdateGeometry({ height });
    }
  };

  return (
    <>
      {locked ? (
        <div className="flex items-start gap-2 border-b border-[#2C2C2C] bg-[#1A1A1A] px-3 py-2.5 text-[11px] text-[#8638E5]">
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

      <InsSection title="Transform" disabled={locked}>
        {/* Align within the parent's content box (frame for a root) — G1. */}
        {onAlign ? (
          <InsRow>
            <AlignRow onAlign={onAlign} />
          </InsRow>
        ) : null}
        {/* Position: X │ Y */}
        <InsRow>
          <FieldGroup>
            <InsInput value={String(node.x)} onChange={(value) => updateNumber(value, (x) => onUpdateGeometry({ x }))} icon="X" />
            <InsInput value={String(node.y)} onChange={(value) => updateNumber(value, (y) => onUpdateGeometry({ y }))} icon="Y" />
          </FieldGroup>
        </InsRow>

        {/* Text sizing modes (Fixed / Fit per axis). */}
        {node.type === "text" ? (
          <InsRow>
            <FieldGroup>
              <InsToggle
                value={widthFit ? "fit" : "fixed"}
                onChange={(width) => onUpdateSizing({ width: width as ElementSizing["width"] })}
                options={[
                  { value: "fixed", label: "Fixed W" },
                  { value: "fit", label: "Fit W" },
                ]}
              />
              <InsToggle
                value={heightFit ? "fit" : "fixed"}
                onChange={(height) => onUpdateSizing({ height: height as ElementSizing["height"] })}
                options={[
                  { value: "fixed", label: "Fixed H" },
                  { value: "fit", label: "Fit H" },
                ]}
              />
            </FieldGroup>
          </InsRow>
        ) : null}

        {/* Size: W │ H (+ aspect-ratio lock). Fit axes show a readout instead. */}
        <InsRow>
          <FieldGroup>
            {widthFit ? (
              <div className="flex h-[30px] min-w-0 flex-1 items-center gap-1.5 rounded-[8px] bg-[#242424] px-2.5 text-[12px] text-[#9A9A9A]">
                <span className="w-3.5 text-[10.5px] font-medium text-[#7C7C7C]">W</span>
                <span className="truncate">{node.width} fit</span>
              </div>
            ) : (
              <InsInput value={String(node.width)} onChange={(value) => updateNumber(value, commitWidth)} icon="W" />
            )}
            {heightFit ? (
              <div className="flex h-[30px] min-w-0 flex-1 items-center gap-1.5 rounded-[8px] bg-[#242424] px-2.5 text-[12px] text-[#9A9A9A]">
                <span className="w-3.5 text-[10.5px] font-medium text-[#7C7C7C]">H</span>
                <span className="truncate">{node.height} fit</span>
              </div>
            ) : (
              <InsInput value={String(node.height)} onChange={(value) => updateNumber(value, commitHeight)} icon="H" />
            )}
            <button
              type="button"
              title={aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
              aria-pressed={aspectLocked}
              onClick={() => setAspectLocked((v) => !v)}
              className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] border border-transparent transition-colors hover:bg-[#2C2C2C]"
              style={{ color: aspectLocked ? "#0D99FF" : "#8A8A8A" }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                {aspectLocked ? (
                  <path d="M5 7.5V5.5a3 3 0 0 1 6 0v2M4.5 7.5h7a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-3.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M5 7.5V5.5a3 3 0 0 1 5.9-.7M4.5 7.5h7a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-3.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          </FieldGroup>
        </InsRow>

        {/* Rotation. */}
        <InsRow>
          <FieldGroup>
            <InsInput value={String(Math.round(node.rotation))} onChange={(value) => updateNumber(value, onUpdateRotation)} icon={RotateGlyph} suffix="°" />
            <span className="min-w-0 flex-1" />
          </FieldGroup>
        </InsRow>

        {/* Secondary metadata: absolute position + size limits, hidden by default. */}
        <MoreDisclosure>
          <Readout label="Abs X" value={String(Math.round(rect?.x ?? 0))} />
          <Readout label="Abs Y" value={String(Math.round(rect?.y ?? 0))} />
          <Readout label="Min W" value={String(c.width.min)} />
          {c.width.max !== undefined && <Readout label="Max W" value={String(c.width.max)} />}
          <Readout label="Min H" value={String(c.height.min)} />
          {c.height.max !== undefined && <Readout label="Max H" value={String(c.height.max)} />}
        </MoreDisclosure>
      </InsSection>

      <LayoutSection
        styles={node.styles}
        hasChildren={node.children.length > 0}
        parentStyles={parentStyles}
        isRoot={!node.parentId}
        locked={locked}
        onChange={onUpdateStyle}
      />

      {fillTarget ? (
        <FillSection
          fills={normalizedFills}
          target={fillTarget}
          tokens={colorTokens}
          gradientTokens={gradientTokens}
          locked={locked}
          canvasEditFillIndex={canvasEditFillIndex}
          onToggleCanvasEdit={onToggleCanvasEdit}
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

      {/* Key by element id so each section's defaultOpen (which depends on the
          element — has-border, has-effects) is re-evaluated on selection change
          instead of freezing at the first-mounted element's state (L18). */}
      <BorderSection
        key={`border-${node.id}`}
        styles={node.styles}
        target={borderTargetForType(node.type)}
        tokens={colorTokens}
        locked={locked}
        strokeAlignAvailable={node.type === "path" && pathIsClosed(node.path)}
        perSideAvailable={shapeOutline(node.type) === null}
        onChange={onUpdateStyle}
      />

      <EffectsSection
        key={`effects-${node.id}`}
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
              className={`mt-1 ${insButtonClass}`}
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
            className={insButtonClass}
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

      {/* Key by element id so the local export entries/notice state resets on
          selection change instead of leaking to the next element (L19). */}
      <ExportSection key={node.id} node={node} getDocument={getDocument} locked={locked} />
    </>
  );
}

// Re-exported for Inspector.tsx header label
export { elementTypeLabel } from "@/canvas/engine/mutations/elementCreate";
