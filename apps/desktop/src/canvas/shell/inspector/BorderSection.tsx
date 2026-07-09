import type { ElementStyles } from "@/canvas/engine/types";
import type { BorderTarget } from "@/domain/canvas/border";
import {
  clamp,
  hexAlphaPercent,
  hexWithAlphaPercent,
  InsColor,
  type InsColorToken,
  InsInput,
  InsRow,
  InsSection,
  InsSelect,
  InsSwitch,
  InsToggle,
  updateNumber,
} from "./InsComponents";

// Color + opacity % → one #RRGGBBAA string (docs/inspector-border-stroke.md,
// D3). Shown only while the stored color is a plain hex literal — a bound
// token or an exotic CSS literal has no place to carry the alpha.
function ColorOpacityRow({
  color,
  onCommit,
}: {
  color: string;
  onCommit: (nextColor: string) => void;
}) {
  const alpha = hexAlphaPercent(color);
  if (alpha === null) return null;
  return (
    <InsRow label="Opacity">
      <InsInput
        value={String(alpha)}
        onChange={(v) =>
          updateNumber(v, (n) => {
            const next = hexWithAlphaPercent(color, clamp(n, 0, 100));
            if (next) onCommit(next);
          })
        }
        suffix="%"
      />
    </InsRow>
  );
}

/**
 * The type-aware Border / Stroke panel. The header and controls follow the
 * element's render target — paper.design's CSS-honest, per-type naming:
 *   • box    → "Border"  (CSS `border` Inside / `outline` Outside)
 *   • text   → "Underline" + "Text stroke" (text-decoration / -webkit-text-stroke)
 *   • vector → "Stroke"   (SVG `stroke-*` on the <path>)
 * See docs/inspector-border-stroke.md.
 */
export function BorderSection({
  styles,
  target,
  tokens,
  locked,
  onChange,
}: {
  styles: ElementStyles;
  target: BorderTarget;
  tokens: InsColorToken[];
  locked: boolean;
  onChange: (patch: Partial<ElementStyles>) => void;
}) {
  if (target === "box") {
    const width = styles.borderWidth ?? 0;
    return (
      <InsSection title="Border" defaultOpen={width > 0} disabled={locked}>
        <InsRow label="Width">
          <InsInput
            value={String(width)}
            onChange={(v) => updateNumber(v, (borderWidth) => onChange({ borderWidth: Math.max(0, borderWidth) }))}
            suffix="px"
          />
        </InsRow>
        <InsRow label="Color">
          <InsColor
            value={styles.borderColor ?? "#CBD5E1"}
            onChange={(borderColor) => onChange({ borderColor, borderColorRef: undefined })}
            tokens={tokens}
            boundRef={styles.borderColorRef}
            onBind={(borderColorRef) => onChange({ borderColorRef })}
          />
        </InsRow>
        {!styles.borderColorRef ? (
          <ColorOpacityRow
            color={styles.borderColor ?? "#CBD5E1"}
            onCommit={(borderColor) => onChange({ borderColor, borderColorRef: undefined })}
          />
        ) : null}
        <InsRow label="Style">
          <InsSelect
            value={styles.borderStyle ?? "solid"}
            onChange={(value) => onChange({ borderStyle: value as ElementStyles["borderStyle"] })}
            options={["solid", "dashed", "dotted", "double"]}
          />
        </InsRow>
        <InsRow label="Align">
          <InsToggle
            value={styles.borderAlign ?? "inside"}
            onChange={(value) => onChange({ borderAlign: value as ElementStyles["borderAlign"] })}
            options={[
              { value: "inside", label: "Inside" },
              { value: "outside", label: "Outside" },
            ]}
          />
        </InsRow>
      </InsSection>
    );
  }

  if (target === "text") {
    const underlineOn = styles.underline === true;
    const strokeWidth = styles.textStrokeWidth ?? 0;
    return (
      <>
        <InsSection title="Underline" defaultOpen={underlineOn} disabled={locked}>
          <InsRow label="Underline">
            <InsSwitch checked={underlineOn} onChange={(underline) => onChange({ underline })} />
          </InsRow>
          {underlineOn ? (
            <>
              <InsRow label="Style">
                <InsSelect
                  value={styles.underlineStyle ?? "solid"}
                  onChange={(value) => onChange({ underlineStyle: value as ElementStyles["underlineStyle"] })}
                  options={["solid", "double", "dotted", "dashed", "wavy"]}
                />
              </InsRow>
              <InsRow label="Color">
                <InsColor
                  value={styles.underlineColor ?? styles.color ?? "#111827"}
                  onChange={(underlineColor) => onChange({ underlineColor, underlineColorRef: undefined })}
                  tokens={tokens}
                  boundRef={styles.underlineColorRef}
                  onBind={(underlineColorRef) => onChange({ underlineColorRef })}
                />
              </InsRow>
              <InsRow label="Thickness">
                <InsInput
                  value={String(styles.underlineThickness ?? 1)}
                  onChange={(v) => updateNumber(v, (n) => onChange({ underlineThickness: Math.max(0, n) }))}
                  suffix="px"
                />
              </InsRow>
              <InsRow label="Offset">
                <InsInput
                  value={String(styles.underlineOffset ?? 0)}
                  onChange={(v) => updateNumber(v, (underlineOffset) => onChange({ underlineOffset }))}
                  suffix="px"
                />
              </InsRow>
            </>
          ) : null}
        </InsSection>

        <InsSection title="Text stroke" defaultOpen={strokeWidth > 0} disabled={locked}>
          <InsRow label="Width">
            <InsInput
              value={String(strokeWidth)}
              onChange={(v) => updateNumber(v, (textStrokeWidth) => onChange({ textStrokeWidth: Math.max(0, textStrokeWidth) }))}
              suffix="px"
            />
          </InsRow>
          <InsRow label="Color">
            <InsColor
              value={styles.textStrokeColor ?? "#000000"}
              onChange={(textStrokeColor) => onChange({ textStrokeColor, textStrokeColorRef: undefined })}
              tokens={tokens}
              boundRef={styles.textStrokeColorRef}
              onBind={(textStrokeColorRef) => onChange({ textStrokeColorRef })}
            />
          </InsRow>
          {!styles.textStrokeColorRef ? (
            <ColorOpacityRow
              color={styles.textStrokeColor ?? "#000000"}
              onCommit={(textStrokeColor) => onChange({ textStrokeColor, textStrokeColorRef: undefined })}
            />
          ) : null}
          <InsRow label="Fill">
            <InsToggle
              value={styles.textStrokePaintOrder ?? "under"}
              onChange={(value) => onChange({ textStrokePaintOrder: value as ElementStyles["textStrokePaintOrder"] })}
              options={[
                { value: "under", label: "Above" },
                { value: "over", label: "Below" },
              ]}
            />
          </InsRow>
        </InsSection>
      </>
    );
  }

  // target === "vector" — SVG stroke family (painted on the <path>).
  const strokeOpacity = Math.round((styles.strokeOpacity ?? 1) * 100);
  return (
    <InsSection title="Stroke" defaultOpen={(styles.strokeWidth ?? 0) > 0} disabled={locked}>
      <InsRow label="Color">
        <InsColor
          value={styles.stroke ?? "#000000"}
          onChange={(stroke) => onChange({ stroke, strokeRef: undefined })}
          tokens={tokens}
          boundRef={styles.strokeRef}
          onBind={(strokeRef) => onChange({ strokeRef })}
        />
      </InsRow>
      <InsRow label="Width">
        <InsInput
          value={String(styles.strokeWidth ?? 0)}
          onChange={(v) => updateNumber(v, (strokeWidth) => onChange({ strokeWidth: Math.max(0, strokeWidth) }))}
          suffix="px"
        />
      </InsRow>
      <InsRow label="Opacity">
        <InsInput
          value={String(strokeOpacity)}
          onChange={(v) => updateNumber(v, (n) => onChange({ strokeOpacity: clamp(n, 0, 100) / 100 }))}
          suffix="%"
        />
      </InsRow>
      <InsRow label="Cap">
        <InsSelect
          value={styles.strokeLinecap ?? "butt"}
          onChange={(value) => onChange({ strokeLinecap: value as ElementStyles["strokeLinecap"] })}
          options={["butt", "round", "square"]}
        />
      </InsRow>
      <InsRow label="Join">
        <InsSelect
          value={styles.strokeLinejoin ?? "miter"}
          onChange={(value) => onChange({ strokeLinejoin: value as ElementStyles["strokeLinejoin"] })}
          options={["miter", "round", "bevel"]}
        />
      </InsRow>
      <InsRow label="Dash">
        <InsInput
          value={styles.strokeDasharray ?? ""}
          onChange={(value) => onChange({ strokeDasharray: value || undefined })}
          placeholder="4 2"
        />
      </InsRow>
    </InsSection>
  );
}
