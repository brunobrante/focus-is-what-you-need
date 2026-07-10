import { useMemo } from "react";
import type { ElementStyles } from "@/canvas/engine/types";
import { tokenRef } from "@/domain/system-design/resolveTokenRef";
import type { TypeStyleToken } from "@/domain/system-design/types";
import { useResolvedSystemDesign } from "@/canvas/stage/resolvedSystemDesignContext";
import {
  DEFAULT_FONT_STACK,
  fontFamilyGroups,
  nearestWeight,
  weightLabel,
  weightsForStack,
} from "@/domain/canvas/fonts";
import { loadFontFace } from "@/lib/fonts/fontFaces";
import { useFontFamilies } from "@/lib/fonts/fontRegistry";
import {
  clamp,
  InsGroupedSelect,
  type InsColorToken,
  InsInput,
  InsLabeledSelect,
  InsRow,
  InsSection,
  InsSelect,
  InsSwitch,
  InsTokenBind,
  InsToggle,
  updateNumber,
} from "./InsComponents";
import { InsColor } from "./ColorPicker";

// Friendly labels for `text-transform`, kept off the stored slug.
const CASE_LABELS: Record<NonNullable<ElementStyles["textTransform"]>, string> = {
  none: "As typed",
  uppercase: "UPPERCASE",
  lowercase: "lowercase",
  capitalize: "Capitalize",
};
const CASE_OPTIONS = Object.values(CASE_LABELS);
const LABEL_TO_CASE = new Map(
  (Object.keys(CASE_LABELS) as Array<NonNullable<ElementStyles["textTransform"]>>).map(
    (k) => [CASE_LABELS[k], k] as const,
  ),
);

// `fontWeight` is a string that may hold a CSS keyword ("bold", "normal") rather
// than a number; resolve keywords before numeric display so the field doesn't
// show "NaN" (L3).
const WEIGHT_KEYWORDS: Record<string, number> = {
  normal: 400,
  bold: 700,
  bolder: 700,
  lighter: 300,
};
function resolveFontWeight(weight: string | undefined): number {
  if (weight == null) return 400;
  const keyword = WEIGHT_KEYWORDS[weight.trim().toLowerCase()];
  if (keyword !== undefined) return keyword;
  const numeric = Number(weight);
  return Number.isFinite(numeric) ? numeric : 400;
}

/**
 * The Typography panel — shown only for text elements. Maps cleanly to CSS text
 * properties; the value is in the non-obvious conversions (letter-spacing %,
 * variable-font weight, vertical align, tight bounds), which `compileTypography`
 * handles. See docs/inspector-typography.md.
 *
 * `heightFit` reflects that vertical align is inert when the box hugs its content
 * (H = Fit) — the control stays, but we say so.
 */
export function TypographySection({
  styles,
  tokens,
  heightFit,
  locked,
  onChange,
}: {
  styles: ElementStyles;
  tokens: InsColorToken[];
  heightFit: boolean;
  locked: boolean;
  onChange: (patch: Partial<ElementStyles>) => void;
}) {
  const lineHeightAuto = styles.lineHeight === undefined;
  const caseValue = styles.textTransform ?? "none";

  // Font picker (G3): bundled + generic stacks, plus whatever is installed.
  const fontFamilies = useFontFamilies();
  const fontStack = styles.fontFamily || DEFAULT_FONT_STACK;
  const fontWeight = resolveFontWeight(styles.fontWeight);
  const familyGroups = useMemo(
    () => fontFamilyGroups(fontFamilies, fontStack),
    [fontFamilies, fontStack],
  );
  // Only the weights the chosen family ships; a stored weight the family does
  // not have (a stale value, an unknown stack) stays listed so it can be read.
  const weightOptions = useMemo(() => {
    const available = weightsForStack(fontFamilies, fontStack);
    const weights = available.includes(fontWeight) ? available : [...available, fontWeight].sort((a, b) => a - b);
    return weights.map((weight) => ({ label: weightLabel(weight), value: String(weight) }));
  }, [fontFamilies, fontStack, fontWeight]);

  // Picking a family that lacks the current weight snaps to its closest one,
  // and the face is fetched so the next text-fit measures against real metrics.
  const applyFontFamily = (stack: string) => {
    const weight = nearestWeight(weightsForStack(fontFamilies, stack), fontWeight);
    void loadFontFace(stack, weight);
    onChange({ fontFamily: stack, fontWeight: String(weight), typeStyleRef: undefined });
  };
  // Type-style token binding (G14): bind writes typeStyleRef + the token's
  // family/weight/size as concrete fallbacks; any manual font edit clears it.
  const resolvedDesign = useResolvedSystemDesign();
  const typeStyleTokens = useMemo(
    () =>
      (resolvedDesign?.typography.tokens ?? []).map((sourced) => {
        const token = sourced.token as TypeStyleToken;
        return { ref: tokenRef("typography", token.id), name: token.name, token };
      }),
    [resolvedDesign],
  );

  return (
    <InsSection title="Typography" disabled={locked}>
      {typeStyleTokens.length > 0 ? (
        <InsRow label="Style token">
          <InsTokenBind
            boundRef={styles.typeStyleRef}
            options={typeStyleTokens}
            onBind={(option) => {
              const token = typeStyleTokens.find((t) => t.ref === option.ref)?.token;
              if (!token) return;
              const size = Number.parseFloat(token.size);
              onChange({
                typeStyleRef: option.ref,
                fontFamily: token.family,
                fontWeight: token.weight,
                ...(Number.isFinite(size) ? { fontSize: size } : {}),
              });
            }}
            onUnbind={() => onChange({ typeStyleRef: undefined })}
          />
        </InsRow>
      ) : null}

      <InsRow label="Font">
        <InsGroupedSelect value={fontStack} onChange={applyFontFamily} groups={familyGroups} />
      </InsRow>

      <InsRow label="Size">
        <InsInput
          value={String(styles.fontSize ?? 14)}
          onChange={(v) => updateNumber(v, (fontSize) => onChange({ fontSize: clamp(fontSize, 1, 300), typeStyleRef: undefined }))}
          suffix="px"
        />
      </InsRow>

      {/* Only the weights the family ships (variable faces expose all nine). */}
      <InsRow label="Weight">
        <InsLabeledSelect
          value={String(fontWeight)}
          onChange={(weight) => {
            void loadFontFace(fontStack, Number(weight));
            onChange({ fontWeight: weight, typeStyleRef: undefined });
          }}
          options={weightOptions}
        />
      </InsRow>

      <InsRow label="Style">
        <InsToggle
          value={styles.fontStyle === "italic" ? "italic" : "normal"}
          onChange={(value) => onChange({ fontStyle: value as ElementStyles["fontStyle"] })}
          options={[
            { value: "normal", label: "Normal" },
            { value: "italic", label: "Italic" },
          ]}
        />
      </InsRow>

      <InsRow label="Color">
        <InsColor
          value={styles.color ?? "#111827"}
          onChange={(color) => onChange({ color, colorRef: undefined })}
          tokens={tokens}
          boundRef={styles.colorRef}
          onBind={(colorRef) => onChange({ colorRef })}
        />
      </InsRow>

      {/* Auto = `line-height: normal` (font-metric ratio); Custom = unitless number. */}
      <InsRow label="Line">
        <InsToggle
          value={lineHeightAuto ? "auto" : "custom"}
          onChange={(value) => onChange({ lineHeight: value === "auto" ? undefined : styles.lineHeight ?? 1.2 })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "custom", label: "Custom" },
          ]}
        />
      </InsRow>
      {lineHeightAuto ? null : (
        <InsRow label="Height">
          <InsInput
            value={String(styles.lineHeight ?? 1.2)}
            onChange={(v) => updateNumber(v, (lineHeight) => onChange({ lineHeight: Math.max(0, lineHeight) }))}
            suffix="×"
          />
        </InsRow>
      )}

      <InsRow label="Spacing">
        <InsInput
          value={String(styles.letterSpacing ?? 0)}
          onChange={(v) => updateNumber(v, (letterSpacing) => onChange({ letterSpacing }))}
          suffix="%"
        />
      </InsRow>

      <InsRow label="Align">
        <InsSelect
          value={styles.textAlign ?? "left"}
          onChange={(value) => onChange({ textAlign: value as ElementStyles["textAlign"] })}
          options={["left", "center", "right", "justify"]}
        />
      </InsRow>

      <InsRow label="V-align">
        <InsToggle
          value={styles.verticalAlign ?? "top"}
          onChange={(value) => onChange({ verticalAlign: value as ElementStyles["verticalAlign"] })}
          options={[
            { value: "top", label: "Top" },
            { value: "middle", label: "Middle" },
            { value: "bottom", label: "Bottom" },
          ]}
        />
      </InsRow>
      {heightFit && (styles.verticalAlign ?? "top") !== "top" ? (
        <p className="text-[11px] leading-4 text-[#6B6B6B]">
          Vertical alignment only appears with a fixed height (H = Fit ignores it).
        </p>
      ) : null}

      <InsRow label="Case">
        <InsSelect
          value={CASE_LABELS[caseValue]}
          onChange={(label) =>
            onChange({ textTransform: LABEL_TO_CASE.get(label) ?? "none" })
          }
          options={CASE_OPTIONS}
        />
      </InsRow>

      <InsRow label="Strike">
        <InsSwitch
          checked={styles.lineThrough === true}
          onChange={(lineThrough) => onChange({ lineThrough })}
        />
      </InsRow>

      {/* Tight cap/baseline bounds — matches what the design tool draws (Safari 18.2+). */}
      <InsRow label="Tight box">
        <InsSwitch
          checked={styles.textBoxTrim === true}
          onChange={(textBoxTrim) => onChange({ textBoxTrim })}
        />
      </InsRow>
    </InsSection>
  );
}
