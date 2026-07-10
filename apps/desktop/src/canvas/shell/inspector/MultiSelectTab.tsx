import { useMemo } from "react";
import type { CanvasDocument, ElementNode, ElementStyles } from "@/canvas/engine/types";
import { alignElements, distributeElements, updateElementGeometry, updateElementStyles } from "@/canvas/engine/actions";
import { AlignRow } from "./AlignRow";
import { getInstanceRootId } from "@/canvas/engine/geometry";
import { elementTakesFill, fillsFallbackColor, fillsToWritePatch, normalizeFills, synthSolidFill } from "@/domain/canvas/fill";
import { useResolvedSystemDesign } from "@/canvas/stage/resolvedSystemDesignContext";
import type { ColorToken } from "@/domain/system-design/types";
import {
  clamp,
  FieldGroup,
  InsColor,
  type InsColorToken,
  InsInput,
  InsRow,
  InsSection,
  updateNumber,
} from "./InsComponents";

/**
 * Multi-selection editing (G8): shared X/Y/W/H, opacity, and a solid-fill
 * batch apply. Reads show the common value or a "Mixed" placeholder; writes
 * fold the same engine mutation over every editable selected element (linked
 * instances and their descendants are read-only by product law and are
 * skipped, as are user-locked nodes).
 */
export function MultiSelectTab({
  nodes,
  getDocument,
  commitDocument,
}: {
  nodes: ElementNode[];
  /** Reads the live document at event time — the panel never subscribes to it (P4). */
  getDocument: () => CanvasDocument | null;
  commitDocument: (next: CanvasDocument) => void;
}) {
  const resolvedDesign = useResolvedSystemDesign();
  const colorTokens = useMemo<InsColorToken[]>(
    () =>
      (resolvedDesign?.colors.tokens ?? []).map((sourced) => {
        const token = sourced.token as ColorToken;
        return { id: token.id, name: token.name, value: token.value };
      }),
    [resolvedDesign],
  );

  const shared = (read: (node: ElementNode) => number | undefined): number | null => {
    if (nodes.length === 0) return null;
    const first = read(nodes[0]);
    return nodes.every((node) => read(node) === first) ? first ?? null : null;
  };

  const sharedX = shared((n) => n.x);
  const sharedY = shared((n) => n.y);
  const sharedW = shared((n) => n.width);
  const sharedH = shared((n) => n.height);
  const sharedOpacity = shared((n) => Math.round((n.styles.opacity ?? 1) * 100));

  const fillables = nodes.filter((node) => elementTakesFill(node.type));
  const fillColors = fillables.map(
    (node) =>
      fillsFallbackColor(
        normalizeFills({
          type: node.type,
          fills: node.styles.fills,
          background: node.styles.background,
          backgroundRef: node.styles.backgroundRef,
          color: node.styles.color,
          colorRef: node.styles.colorRef,
          src: node.src,
          objectFit: node.styles.objectFit,
        }),
      ) ?? "#FFFFFF",
  );
  const sharedFill =
    fillColors.length > 0 && fillColors.every((color) => color === fillColors[0])
      ? fillColors[0]
      : null;

  /** Linked instances (and their descendants) and locked nodes are never written. */
  const editableIn = (document: CanvasDocument) =>
    nodes.filter((node) => !node.locked && !getInstanceRootId(document, node.id));

  const batchGeometry = (patch: Partial<{ x: number; y: number; width: number; height: number }>) => {
    const document = getDocument();
    if (!document) return;
    let next = document;
    for (const node of editableIn(document)) next = updateElementGeometry(next, node.id, patch);
    if (next !== document) commitDocument(next);
  };

  const batchStyles = (patchFor: (node: ElementNode) => Partial<ElementStyles>) => {
    const document = getDocument();
    if (!document) return;
    let next = document;
    for (const node of editableIn(document)) next = updateElementStyles(next, node.id, patchFor(node));
    if (next !== document) commitDocument(next);
  };

  const numberField = (
    label: string,
    value: number | null,
    commit: (n: number) => void,
  ) => (
    <InsInput
      value={value === null ? "" : String(value)}
      placeholder="Mixed"
      onChange={(v) => updateNumber(v, commit)}
      icon={label}
    />
  );

  const ids = nodes.map((node) => node.id);

  return (
    <>
      <InsSection title="Transform">
        {/* Align to the selection's shared bounds; distribute needs 3+ (G1). */}
        <InsRow>
          <AlignRow
            onAlign={(edge) => {
              const document = getDocument();
              if (document) commitDocument(alignElements(document, ids, edge));
            }}
            onDistribute={
              ids.length >= 3
                ? (axis) => {
                    const document = getDocument();
                    if (document) commitDocument(distributeElements(document, ids, axis));
                  }
                : undefined
            }
          />
        </InsRow>
        <InsRow>
          <FieldGroup>
            {numberField("X", sharedX, (x) => batchGeometry({ x }))}
            {numberField("Y", sharedY, (y) => batchGeometry({ y }))}
          </FieldGroup>
        </InsRow>
        <InsRow>
          <FieldGroup>
            {numberField("W", sharedW, (width) => batchGeometry({ width: Math.max(1, width) }))}
            {numberField("H", sharedH, (height) => batchGeometry({ height: Math.max(1, height) }))}
          </FieldGroup>
        </InsRow>
      </InsSection>

      <InsSection title="Appearance">
        <InsRow label="Opacity">
          <InsInput
            value={sharedOpacity === null ? "" : String(sharedOpacity)}
            placeholder="Mixed"
            onChange={(v) =>
              updateNumber(v, (n) =>
                batchStyles(() => ({ opacity: clamp(n, 0, 100) / 100 })),
              )
            }
            suffix="%"
          />
        </InsRow>
        {fillables.length > 0 ? (
          <InsRow label={sharedFill === null ? "Fill · Mixed" : "Fill"}>
            <InsColor
              value={sharedFill ?? fillColors[0]}
              onChange={(color) =>
                batchStyles((node) => {
                  if (!elementTakesFill(node.type)) return {};
                  // Same write-patch translation as ElementTab.handleFillsChange:
                  // text solids land on the glyph color (M12), never `src` into styles.
                  const patch = fillsToWritePatch([synthSolidFill(color)], node.type);
                  const stylePatch: Partial<ElementStyles> = {
                    fills: patch.fills,
                    background: patch.background,
                    backgroundRef: patch.backgroundRef,
                  };
                  if (patch.color !== undefined) {
                    stylePatch.color = patch.color;
                    stylePatch.colorRef = patch.colorRef;
                  }
                  return stylePatch;
                })
              }
              tokens={colorTokens}
            />
          </InsRow>
        ) : null}
      </InsSection>
    </>
  );
}
