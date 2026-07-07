import { createId } from "@/canvas/engine/actions";
import type { Effect, EffectType } from "@/canvas/engine/types";
import {
  defaultFilterAmount,
  type EffectTarget,
  effectSpreadHonored,
  effectTypeAvailable,
} from "@/domain/canvas/effects";
import { IconChevronDown, IconChevronUp, IconEye, IconEyeOff, IconPlus, IconTrash } from "@/components/icons";
import {
  clamp,
  InsColor,
  type InsColorToken,
  InsInput,
  InsRow,
  InsSection,
  InsSelect,
  updateNumber,
} from "./InsComponents";

// Label ⇄ slug mapping for the per-entry type dropdown. InsSelect speaks plain
// strings, so we offer labels and translate back to the stored EffectType.
const EFFECT_LABELS: Record<EffectType, string> = {
  "drop-shadow": "Drop shadow",
  "inner-shadow": "Inner shadow",
  "layer-blur": "Layer blur",
  "background-blur": "Background blur",
  brightness: "Brightness",
  contrast: "Contrast",
  saturate: "Saturation",
  grayscale: "Grayscale",
  invert: "Invert",
  sepia: "Sepia",
  "hue-rotate": "Hue rotate",
};

const ALL_EFFECT_TYPES = Object.keys(EFFECT_LABELS) as EffectType[];
const LABEL_TO_TYPE = new Map(ALL_EFFECT_TYPES.map((t) => [EFFECT_LABELS[t], t] as const));

const SHADOW_TYPES: ReadonlySet<EffectType> = new Set(["drop-shadow", "inner-shadow"]);
const BLUR_TYPES: ReadonlySet<EffectType> = new Set(["layer-blur", "background-blur"]);
const MULTIPLIER_FILTERS: ReadonlySet<EffectType> = new Set(["brightness", "contrast", "saturate"]);

// 25% black — matches the compile-side DEFAULT_SHADOW_COLOR (rgba(0,0,0,0.25)),
// so a freshly added shadow is soft, not harsh opaque black (L1).
const DEFAULT_SHADOW_COLOR = "#00000040";

/** A fresh drop-shadow with sensible defaults. */
function newEffect(): Effect {
  return { id: createId("fx"), type: "drop-shadow", x: 0, y: 2, blur: 4, spread: 0, color: DEFAULT_SHADOW_COLOR };
}

// When the user switches an entry's type, fill in any params the new type needs
// but the old one didn't carry — so the inspector value matches what renders
// (the compiler treats a missing param as 0/identity). Color filters need none
// (compileEffects + FilterParams both fall back to the identity amount).
function seedForType(type: EffectType, e: Effect): Partial<Effect> {
  if (SHADOW_TYPES.has(type)) return { y: e.y ?? 2, blur: e.blur ?? 4, color: e.color ?? DEFAULT_SHADOW_COLOR };
  if (BLUR_TYPES.has(type)) return { radius: e.radius ?? 4 };
  return {};
}

const iconButtonClass =
  "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] border border-[#2C2C2C] text-[#A6A6A6] transition-colors hover:border-[#3A3A3A] hover:text-[#E2E2E2] disabled:cursor-not-allowed disabled:opacity-30";

function EffectEntry({
  effect,
  index,
  count,
  target,
  tokens,
  onUpdate,
  onMove,
  onRemove,
}: {
  effect: Effect;
  index: number;
  count: number;
  target: EffectTarget;
  tokens: InsColorToken[];
  onUpdate: (patch: Partial<Effect>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const enabled = effect.enabled !== false;
  // Offer every type valid for this element, plus the current one even if it
  // wouldn't normally be offered (keeps a legacy entry selectable).
  const typeOptions = ALL_EFFECT_TYPES.filter(
    (t) => effectTypeAvailable(t, target) || t === effect.type,
  ).map((t) => EFFECT_LABELS[t]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[#2C2C2C] bg-[#181818] p-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title={enabled ? "Disable effect" : "Enable effect"}
          onClick={() => onUpdate({ enabled: !enabled })}
          className={iconButtonClass}
        >
          {enabled ? <IconEye size={12} /> : <IconEyeOff size={12} />}
        </button>
        <div className="min-w-0 flex-1">
          <InsSelect
            value={EFFECT_LABELS[effect.type]}
            onChange={(label) => {
              const type = LABEL_TO_TYPE.get(label) ?? effect.type;
              onUpdate({ type, ...seedForType(type, effect) });
            }}
            options={typeOptions}
          />
        </div>
        <button
          type="button"
          title="Move up"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className={iconButtonClass}
        >
          <IconChevronUp size={12} />
        </button>
        <button
          type="button"
          title="Move down"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          className={iconButtonClass}
        >
          <IconChevronDown size={12} />
        </button>
        <button type="button" title="Remove effect" onClick={onRemove} className={iconButtonClass}>
          <IconTrash size={12} />
        </button>
      </div>

      <div className={enabled ? "flex flex-col gap-2" : "flex flex-col gap-2 opacity-40"}>
        {SHADOW_TYPES.has(effect.type) ? (
          <ShadowParams effect={effect} target={target} tokens={tokens} onUpdate={onUpdate} />
        ) : BLUR_TYPES.has(effect.type) ? (
          <InsRow label="Radius">
            <InsInput
              value={String(effect.radius ?? 4)}
              onChange={(v) => updateNumber(v, (r) => onUpdate({ radius: Math.max(0, r) }))}
              suffix="px"
            />
          </InsRow>
        ) : (
          <FilterParams effect={effect} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  );
}

function ShadowParams({
  effect,
  target,
  tokens,
  onUpdate,
}: {
  effect: Effect;
  target: EffectTarget;
  tokens: InsColorToken[];
  onUpdate: (patch: Partial<Effect>) => void;
}) {
  return (
    <>
      <InsRow label="X">
        <InsInput value={String(effect.x ?? 0)} onChange={(v) => updateNumber(v, (x) => onUpdate({ x }))} suffix="px" />
      </InsRow>
      <InsRow label="Y">
        <InsInput value={String(effect.y ?? 0)} onChange={(v) => updateNumber(v, (y) => onUpdate({ y }))} suffix="px" />
      </InsRow>
      <InsRow label="Blur">
        <InsInput
          value={String(effect.blur ?? 0)}
          onChange={(v) => updateNumber(v, (blur) => onUpdate({ blur: Math.max(0, blur) }))}
          suffix="px"
        />
      </InsRow>
      {effectSpreadHonored(target) ? (
        <InsRow label="Spread">
          <InsInput
            value={String(effect.spread ?? 0)}
            onChange={(v) => updateNumber(v, (spread) => onUpdate({ spread }))}
            suffix="px"
          />
        </InsRow>
      ) : null}
      <InsRow label="Color">
        <InsColor
          value={effect.color ?? "#000000"}
          onChange={(color) => onUpdate({ color, colorRef: undefined })}
          tokens={tokens}
          boundRef={effect.colorRef}
          onBind={(colorRef) => onUpdate({ colorRef })}
        />
      </InsRow>
    </>
  );
}

function FilterParams({ effect, onUpdate }: { effect: Effect; onUpdate: (patch: Partial<Effect>) => void }) {
  if (effect.type === "hue-rotate") {
    return (
      <InsRow label="Angle">
        <InsInput
          value={String(Math.round(effect.amount ?? 0))}
          onChange={(v) => updateNumber(v, (amount) => onUpdate({ amount }))}
          suffix="°"
        />
      </InsRow>
    );
  }
  const isMultiplier = MULTIPLIER_FILTERS.has(effect.type);
  const percent = Math.round((effect.amount ?? defaultFilterAmount(effect.type)) * 100);
  return (
    <InsRow label="Amount">
      <InsInput
        value={String(percent)}
        onChange={(v) =>
          updateNumber(v, (n) =>
            onUpdate({ amount: (isMultiplier ? Math.max(0, n) : clamp(n, 0, 100)) / 100 }),
          )
        }
        suffix="%"
      />
    </InsRow>
  );
}

export function EffectsSection({
  effects,
  target,
  tokens,
  locked,
  onChange,
}: {
  effects: Effect[];
  target: EffectTarget;
  tokens: InsColorToken[];
  locked: boolean;
  onChange: (effects: Effect[]) => void;
}) {
  const updateAt = (index: number, patch: Partial<Effect>) =>
    onChange(effects.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const move = (index: number, direction: -1 | 1) => {
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= effects.length) return;
    const next = effects.slice();
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    onChange(next);
  };

  const remove = (index: number) => onChange(effects.filter((_, i) => i !== index));
  // Prepend so a new effect lands on top (first = on top), matching the Fill
  // panel's add convention and Figma (L2).
  const add = () => onChange([newEffect(), ...effects]);

  return (
    <InsSection title="Effects" defaultOpen={effects.length > 0} disabled={locked}>
      {effects.length === 0 ? (
        <p className="text-[11px] leading-5 text-[#6B6B6B]">
          Sombras, blur e filtros. A ordem importa — filtros encadeiam e sombras empilham.
        </p>
      ) : (
        effects.map((effect, index) => (
          <EffectEntry
            key={effect.id}
            effect={effect}
            index={index}
            count={effects.length}
            target={target}
            tokens={tokens}
            onUpdate={(patch) => updateAt(index, patch)}
            onMove={(direction) => move(index, direction)}
            onRemove={() => remove(index)}
          />
        ))
      )}
      <button
        type="button"
        onClick={add}
        className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[#2C2C2C] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[#F2F2F2] hover:bg-[#2A2A2A]"
      >
        <IconPlus size={12} />
        Add effect
      </button>
    </InsSection>
  );
}
