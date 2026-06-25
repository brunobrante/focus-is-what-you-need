// Inspector → Fill panel. Mirrors EffectsSection's shape: a stack of fill cards,
// each with a type (Solid / Gradient / Image / Video), per-fill opacity + blend
// mode, and add/remove/reorder. The type-aware CSS/SVG is compiled elsewhere
// (domain/canvas/fillCompile.ts); this file is pure UI + the fill records.
//
// `fills[0]` is the TOP layer (matches CSS: first background-image paints on top).

import { createId } from "@/canvas/engine/actions";
import type {
  Fill,
  FillBlendMode,
  FillType,
  GradientFill,
  GradientInterpolation,
  GradientKind,
  ImageFill,
  SolidFill,
  VideoFill,
} from "@/canvas/engine/types";
import type { FillTarget } from "@/domain/canvas/fillCompile";
import { fillOpacity } from "@/domain/canvas/fill";
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconTrash,
} from "@/components/icons";
import { FillColorField } from "./FillColorField";
import {
  clamp,
  type InsColorToken,
  InsInput,
  InsRow,
  InsSection,
  InsSelect,
  InsSlider,
  updateNumber,
} from "./InsComponents";

/** A gradient token offered for binding a gradient fill. */
export type GradientTokenOption = { id: string; name: string; css: string };

const BLEND_MODES: FillBlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
];

const FILL_TYPE_LABELS: Record<FillType, string> = {
  solid: "Solid",
  gradient: "Gradient",
  image: "Image",
  video: "Video",
};

const INTERPOLATION_LABELS: Record<GradientInterpolation, string> = {
  srgb: "sRGB (Average)",
  oklab: "OKLAB",
  oklch: "OKLCH",
  "oklch-shorter": "Nearest hue",
};
const INTERP_LABEL_TO_VALUE = new Map(
  (Object.keys(INTERPOLATION_LABELS) as GradientInterpolation[]).map(
    (k) => [INTERPOLATION_LABELS[k], k] as const,
  ),
);

const IMAGE_FIT_LABELS: Record<ImageFill["fit"], string> = {
  fill: "Fill",
  fit: "Fit",
  crop: "Crop",
  tile: "Tile",
};
const FIT_LABEL_TO_VALUE = new Map(
  (Object.keys(IMAGE_FIT_LABELS) as ImageFill["fit"][]).map(
    (k) => [IMAGE_FIT_LABELS[k], k] as const,
  ),
);

const iconButtonClass =
  "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] border border-[#2C2C2C] text-[#A6A6A6] transition-colors hover:border-[#3A3A3A] hover:text-[#E2E2E2] disabled:cursor-not-allowed disabled:opacity-30";

function fillTypesForTarget(target: FillTarget): FillType[] {
  if (target === "image") return ["solid", "gradient", "image", "video"];
  return ["solid", "gradient", "image"];
}

function newSolidFill(): SolidFill {
  return { id: createId("fill"), type: "solid", color: "#4F46E5" };
}

function newGradientFill(): GradientFill {
  return {
    id: createId("fill"),
    type: "gradient",
    kind: "linear",
    angle: 180,
    interpolation: "srgb", // paper's "Average color" default
    stops: [
      { color: "#4F46E5", position: 0 },
      { color: "#EC4899", position: 1 },
    ],
  };
}

function newImageFill(): ImageFill {
  return { id: createId("fill"), type: "image", src: "", fit: "fill" };
}

function newVideoFill(): VideoFill {
  return { id: createId("fill"), type: "video", src: "", fit: "fill" };
}

/** Switch a fill's type, keeping the shared header fields (enabled/opacity/blend). */
function changeFillType(fill: Fill, type: FillType): Fill {
  const common = { id: fill.id, enabled: fill.enabled, opacity: fill.opacity, blendMode: fill.blendMode };
  switch (type) {
    case "solid":
      return { ...newSolidFill(), ...common };
    case "gradient":
      return { ...newGradientFill(), ...common };
    case "image":
      return { ...newImageFill(), ...common };
    case "video":
      return { ...newVideoFill(), ...common };
  }
}

function FillHeader({
  fill,
  index,
  count,
  typeOptions,
  onUpdate,
  onChangeType,
  onMove,
  onRemove,
}: {
  fill: Fill;
  index: number;
  count: number;
  typeOptions: FillType[];
  onUpdate: (patch: Partial<Fill>) => void;
  onChangeType: (type: FillType) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const enabled = fill.enabled !== false;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        title={enabled ? "Disable fill" : "Enable fill"}
        onClick={() => onUpdate({ enabled: !enabled })}
        className={iconButtonClass}
      >
        {enabled ? <IconEye size={12} /> : <IconEyeOff size={12} />}
      </button>
      <div className="min-w-0 flex-1">
        <InsSelect
          value={FILL_TYPE_LABELS[fill.type]}
          onChange={(label) => {
            const type = (Object.keys(FILL_TYPE_LABELS) as FillType[]).find(
              (t) => FILL_TYPE_LABELS[t] === label,
            );
            if (type && type !== fill.type) onChangeType(type);
          }}
          options={typeOptions.map((t) => FILL_TYPE_LABELS[t])}
        />
      </div>
      <button type="button" title="Move up" disabled={index === 0} onClick={() => onMove(-1)} className={iconButtonClass}>
        <IconChevronUp size={12} />
      </button>
      <button type="button" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)} className={iconButtonClass}>
        <IconChevronDown size={12} />
      </button>
      <button type="button" title="Remove fill" onClick={onRemove} className={iconButtonClass}>
        <IconTrash size={12} />
      </button>
    </div>
  );
}

function CommonControls({ fill, onUpdate }: { fill: Fill; onUpdate: (patch: Partial<Fill>) => void }) {
  return (
    <>
      <InsRow label="Opacity">
        <InsSlider
          value={Math.round(fillOpacity(fill) * 100)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => onUpdate({ opacity: clamp(v, 0, 100) / 100 })}
          format={(v) => `${v}%`}
        />
      </InsRow>
      <InsRow label="Blend">
        <InsSelect
          value={fill.blendMode ?? "normal"}
          onChange={(v) => onUpdate({ blendMode: v as FillBlendMode })}
          options={BLEND_MODES}
        />
      </InsRow>
    </>
  );
}

function SolidBody({
  fill,
  tokens,
  onUpdate,
}: {
  fill: SolidFill;
  tokens: InsColorToken[];
  onUpdate: (patch: Partial<SolidFill>) => void;
}) {
  return (
    <InsRow label="Color">
      <FillColorField
        value={fill.color}
        onChange={(color) => onUpdate({ color, colorRef: undefined })}
        tokens={tokens}
        boundRef={fill.colorRef}
        onBind={(colorRef) => onUpdate({ colorRef })}
      />
    </InsRow>
  );
}

function GradientBody({
  fill,
  gradientTokens,
  onUpdate,
}: {
  fill: GradientFill;
  gradientTokens: GradientTokenOption[];
  onUpdate: (patch: Partial<GradientFill>) => void;
}) {
  const boundId = fill.gradientRef?.split(":")[1];
  if (fill.gradientRef && boundId) {
    const token = gradientTokens.find((t) => t.id === boundId);
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-[22px] w-[22px] shrink-0 rounded-[5px] border border-[#2C2C2C]" style={{ background: token?.css }} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-[#8638E5]">{token?.name ?? "Gradient token"}</span>
        <button type="button" title="Unbind" onClick={() => onUpdate({ gradientRef: undefined })} className={iconButtonClass}>
          <IconTrash size={11} />
        </button>
      </div>
    );
  }
  const setStop = (index: number, patch: Partial<GradientFill["stops"][number]>) =>
    onUpdate({ stops: fill.stops.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const addStop = () => onUpdate({ stops: [...fill.stops, { color: "#FFFFFF", position: 1 }] });
  const removeStop = (index: number) =>
    fill.stops.length > 2 && onUpdate({ stops: fill.stops.filter((_, i) => i !== index) });

  return (
    <>
      <InsRow label="Type">
        <InsSelect
          value={fill.kind}
          onChange={(v) => onUpdate({ kind: v as GradientKind })}
          options={["linear", "radial", "conic"]}
        />
      </InsRow>
      {fill.kind !== "radial" ? (
        <InsRow label="Angle">
          <InsInput value={String(Math.round(fill.angle))} onChange={(v) => updateNumber(v, (angle) => onUpdate({ angle }))} suffix="°" />
        </InsRow>
      ) : null}
      <InsRow label="Interp">
        <InsSelect
          value={INTERPOLATION_LABELS[fill.interpolation]}
          onChange={(label) => onUpdate({ interpolation: INTERP_LABEL_TO_VALUE.get(label) ?? "srgb" })}
          options={Object.values(INTERPOLATION_LABELS)}
        />
      </InsRow>
      <div className="flex flex-col gap-1.5">
        {fill.stops.map((stop, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <FillColorField value={stop.color} onChange={(color) => setStop(index, { color })} />
            </div>
            <div className="w-14 shrink-0">
              <InsInput
                value={String(Math.round(stop.position * 100))}
                onChange={(v) => updateNumber(v, (p) => setStop(index, { position: clamp(p, 0, 100) / 100 }))}
                suffix="%"
              />
            </div>
            <button
              type="button"
              title="Remove stop"
              disabled={fill.stops.length <= 2}
              onClick={() => removeStop(index)}
              className={iconButtonClass}
            >
              <IconTrash size={11} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addStop}
          className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border border-[#2C2C2C] bg-transparent px-2 py-1 text-[11px] text-[#C8C8C8] hover:bg-[#2A2A2A]"
        >
          <IconPlus size={11} /> Add stop
        </button>
      </div>
      {gradientTokens.length > 0 ? (
        <InsRow label="Token">
          <InsSelect
            value="—"
            onChange={(name) => {
              const t = gradientTokens.find((g) => g.name === name);
              if (t) onUpdate({ gradientRef: `gradients:${t.id}` });
            }}
            options={["—", ...gradientTokens.map((t) => t.name)]}
          />
        </InsRow>
      ) : null}
    </>
  );
}

function ImageBody({ fill, onUpdate }: { fill: ImageFill; onUpdate: (patch: Partial<ImageFill>) => void }) {
  const adj = fill.adjustments ?? {};
  const setAdj = (patch: Partial<NonNullable<ImageFill["adjustments"]>>) =>
    onUpdate({ adjustments: { ...adj, ...patch } });
  const isTile = fill.fit === "tile";
  return (
    <>
      <InsRow label="URL">
        <InsInput value={fill.src} onChange={(src) => onUpdate({ src })} placeholder="https://..." />
      </InsRow>
      <InsRow label="Fit">
        <InsSelect
          value={IMAGE_FIT_LABELS[fill.fit]}
          onChange={(label) => onUpdate({ fit: FIT_LABEL_TO_VALUE.get(label) ?? "fill" })}
          options={Object.values(IMAGE_FIT_LABELS)}
        />
      </InsRow>
      <InsRow label="Position">
        <InsInput value={fill.position ?? "center"} onChange={(position) => onUpdate({ position })} placeholder="center" />
      </InsRow>
      {fill.fit === "crop" || isTile ? (
        <InsRow label="Scale">
          <InsInput value={String(fill.scale ?? 100)} onChange={(v) => updateNumber(v, (scale) => onUpdate({ scale }))} suffix="%" />
        </InsRow>
      ) : null}
      {isTile ? (
        <InsRow label="Tile gap">
          <InsInput value={String(fill.tileGap ?? 0)} onChange={(v) => updateNumber(v, (tileGap) => onUpdate({ tileGap: Math.max(0, tileGap) }))} suffix="px" />
        </InsRow>
      ) : null}
      <ImageAdjustmentRow label="Exposure" value={adj.exposure ?? 1} multiplier onChange={(exposure) => setAdj({ exposure })} />
      <ImageAdjustmentRow label="Contrast" value={adj.contrast ?? 1} multiplier onChange={(contrast) => setAdj({ contrast })} />
      <ImageAdjustmentRow label="Saturation" value={adj.saturation ?? 1} multiplier onChange={(saturation) => setAdj({ saturation })} />
      <ImageAdjustmentRow label="Temperature" value={adj.temperature ?? 0} onChange={(temperature) => setAdj({ temperature })} />
      <ImageAdjustmentRow label="Tint" value={adj.tint ?? 0} onChange={(tint) => setAdj({ tint })} />
      <ImageAdjustmentRow label="Highlights" value={adj.highlights ?? 0} onChange={(highlights) => setAdj({ highlights })} />
      <ImageAdjustmentRow label="Shadows" value={adj.shadows ?? 0} onChange={(shadows) => setAdj({ shadows })} />
    </>
  );
}

/** Multiplier adjustments run 0..200% (1 = neutral); signed ones run -100..100. */
function ImageAdjustmentRow({
  label,
  value,
  multiplier = false,
  onChange,
}: {
  label: string;
  value: number;
  multiplier?: boolean;
  onChange: (value: number) => void;
}) {
  if (multiplier) {
    return (
      <InsRow label={label}>
        <InsSlider value={Math.round(value * 100)} min={0} max={200} step={1} onChange={(v) => onChange(v / 100)} format={(v) => `${v}%`} />
      </InsRow>
    );
  }
  return (
    <InsRow label={label}>
      <InsSlider value={Math.round(value)} min={-100} max={100} step={1} onChange={onChange} format={(v) => `${v}`} />
    </InsRow>
  );
}

function VideoBody({ fill, onUpdate }: { fill: VideoFill; onUpdate: (patch: Partial<VideoFill>) => void }) {
  return (
    <>
      <InsRow label="URL">
        <InsInput value={fill.src} onChange={(src) => onUpdate({ src })} placeholder="https://....mp4" />
      </InsRow>
      <InsRow label="Fit">
        <InsSelect
          value={IMAGE_FIT_LABELS[fill.fit]}
          onChange={(label) => onUpdate({ fit: (FIT_LABEL_TO_VALUE.get(label) ?? "fill") as VideoFill["fit"] })}
          options={[IMAGE_FIT_LABELS.fill, IMAGE_FIT_LABELS.fit, IMAGE_FIT_LABELS.crop]}
        />
      </InsRow>
      <InsRow label="Position">
        <InsInput value={fill.position ?? "center"} onChange={(position) => onUpdate({ position })} placeholder="center" />
      </InsRow>
    </>
  );
}

function FillEntry({
  fill,
  index,
  count,
  target,
  tokens,
  gradientTokens,
  onUpdate,
  onChangeType,
  onMove,
  onRemove,
}: {
  fill: Fill;
  index: number;
  count: number;
  target: FillTarget;
  tokens: InsColorToken[];
  gradientTokens: GradientTokenOption[];
  onUpdate: (patch: Partial<Fill>) => void;
  onChangeType: (type: FillType) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const enabled = fill.enabled !== false;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-[#2C2C2C] bg-[#181818] p-2">
      <FillHeader
        fill={fill}
        index={index}
        count={count}
        typeOptions={fillTypesForTarget(target)}
        onUpdate={onUpdate}
        onChangeType={onChangeType}
        onMove={onMove}
        onRemove={onRemove}
      />
      <div className={enabled ? "flex flex-col gap-2" : "flex flex-col gap-2 opacity-40"}>
        {fill.type === "solid" ? (
          <SolidBody fill={fill} tokens={tokens} onUpdate={onUpdate as (p: Partial<SolidFill>) => void} />
        ) : fill.type === "gradient" ? (
          <GradientBody fill={fill} gradientTokens={gradientTokens} onUpdate={onUpdate as (p: Partial<GradientFill>) => void} />
        ) : fill.type === "image" ? (
          <ImageBody fill={fill} onUpdate={onUpdate as (p: Partial<ImageFill>) => void} />
        ) : (
          <VideoBody fill={fill} onUpdate={onUpdate as (p: Partial<VideoFill>) => void} />
        )}
        <CommonControls fill={fill} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

export function FillSection({
  fills,
  target,
  tokens,
  gradientTokens,
  locked,
  onChange,
}: {
  fills: Fill[];
  target: FillTarget;
  tokens: InsColorToken[];
  gradientTokens: GradientTokenOption[];
  locked: boolean;
  onChange: (fills: Fill[]) => void;
}) {
  const updateAt = (index: number, patch: Partial<Fill>) =>
    onChange(fills.map((f, i) => (i === index ? ({ ...f, ...patch } as Fill) : f)));

  const changeTypeAt = (index: number, type: FillType) =>
    onChange(fills.map((f, i) => (i === index ? changeFillType(f, type) : f)));

  const move = (index: number, direction: -1 | 1) => {
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= fills.length) return;
    const next = fills.slice();
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    onChange(next);
  };

  const remove = (index: number) => onChange(fills.filter((_, i) => i !== index));
  const add = () => onChange([newSolidFill(), ...fills]); // new fill goes on top

  return (
    <InsSection title="Fill" defaultOpen disabled={locked}>
      {fills.map((fill, index) => (
        <FillEntry
          key={fill.id}
          fill={fill}
          index={index}
          count={fills.length}
          target={target}
          tokens={tokens}
          gradientTokens={gradientTokens}
          onUpdate={(patch) => updateAt(index, patch)}
          onChangeType={(type) => changeTypeAt(index, type)}
          onMove={(direction) => move(index, direction)}
          onRemove={() => remove(index)}
        />
      ))}
      <button
        type="button"
        onClick={add}
        className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[#2C2C2C] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[#F2F2F2] hover:bg-[#2A2A2A]"
      >
        <IconPlus size={12} />
        Add fill
      </button>
    </InsSection>
  );
}
