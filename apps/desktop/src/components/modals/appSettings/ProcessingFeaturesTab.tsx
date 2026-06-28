import { useState } from "react";
import type { ProcessingFeatureKey } from "@/domain/settings/types";
import {
  useProcessingFeatures,
  type ModelControls,
} from "@/lib/models/useProcessingFeatures";
import { FEATURES, modelsForFeature } from "@/lib/models/modelCatalog";
import {
  Check,
  ChevronRight,
  Download,
  Eraser,
  Maximize2,
  Palette,
  ScanText,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Wand2,
  X,
} from "lucide-react";
import { Switch } from "./Switch";
import { DevWrapper } from "@/components/ui/DevWrapper";

const FEATURE_ICON: Record<ProcessingFeatureKey, React.ReactNode> = {
  removeBackground: <Eraser size={16} strokeWidth={1.7} />,
  upscale: <Maximize2 size={16} strokeWidth={1.7} />,
  autoDetect: <Sparkles size={16} strokeWidth={1.7} />,
  textDetection: <ScanText size={16} strokeWidth={1.7} />,
  removeElement: <Wand2 size={16} strokeWidth={1.7} />,
  colorDetector: <Palette size={16} strokeWidth={1.7} />,
  fontDetection: <Type size={16} strokeWidth={1.7} />,
  iconDetection: <Shapes size={16} strokeWidth={1.7} />,
};

export function ProcessingFeaturesTab() {
  const { features, models } = useProcessingFeatures();
  const [expanded, setExpanded] = useState<Set<ProcessingFeatureKey>>(() => new Set());

  const toggle = (key: ProcessingFeatureKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <DevWrapper platform="desktop" block>
    <div className="px-[22px] py-5">
      <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
        Processing Features
      </div>
      <p className="m-0 mb-3 max-w-[560px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
        Optional on-device AI models that run locally. Toggle a feature on to use it in
        the Builder, and expand it to download models and pick which one it runs.
      </p>
      <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
        {FEATURES.map((feature, index) => {
          const control = features[feature.key];
          const open = expanded.has(feature.key);
          return (
            <div
              key={feature.key}
              className={index < FEATURES.length - 1 ? "border-b border-[var(--border)]" : ""}
            >
              <div className="flex items-center gap-2.5 px-4 py-3">
                {feature.modelFree ? (
                  <span className="h-6 w-6 shrink-0" />
                ) : (
                  <button
                    type="button"
                    aria-label={open ? `Collapse ${feature.name}` : `Expand ${feature.name}`}
                    aria-expanded={open}
                    onClick={() => toggle(feature.key)}
                    className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[6px] text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  >
                    <ChevronRight
                      size={14}
                      strokeWidth={2}
                      className={open ? "rotate-90 transition-transform" : "transition-transform"}
                    />
                  </button>
                )}
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
                  {FEATURE_ICON[feature.key]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-[var(--text)]">{feature.name}</div>
                  <p className="m-0 mt-0.5 max-w-[420px] text-[12px] leading-[1.45] text-[var(--text-muted)]">
                    {feature.description}
                    {!control.canEnable ? (
                      <span className="text-[var(--text-faint)]"> · Install a model to enable.</span>
                    ) : null}
                  </p>
                </div>
                <Switch
                  checked={control.enabled}
                  disabled={!control.canEnable}
                  ariaLabel={`Enable ${feature.name}`}
                  onChange={(checked) => control.setEnabled(checked)}
                />
              </div>
              {open && !feature.modelFree ? (
                <div className="border-t border-[var(--border)] bg-[var(--bg)] py-1 pl-[58px] pr-3">
                  {modelsForFeature(feature.key).length === 0 ? (
                    <p className="my-2 text-[12px] text-[var(--text-faint)]">
                      No models currently available.
                    </p>
                  ) : (
                    modelsForFeature(feature.key).map((m) => (
                      <ModelListRow key={m.modelId} model={models[m.modelId]} />
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
    </DevWrapper>
  );
}

/**
 * One model under an expanded feature: a select checkbox (the active model) on
 * the left, then download / delete actions on the right. While downloading, the
 * actions are replaced by a progress percentage and a cancel button.
 */
function ModelListRow({ model }: { model: ModelControls }) {
  const pct = Math.round(model.progress * 100);
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={model.active}
        aria-label={`Use ${model.label}`}
        disabled={!model.installed}
        onClick={model.setActive}
        className={[
          "grid h-[16px] w-[16px] shrink-0 place-items-center rounded-[4px] border transition-colors",
          !model.installed
            ? "cursor-not-allowed border-[var(--border)] bg-[var(--surface)] opacity-40"
            : model.active
              ? "cursor-pointer border-[#5b6cff] bg-[#5b6cff] text-white"
              : "cursor-pointer border-[var(--border-strong)] bg-[var(--surface)] text-transparent hover:border-[var(--text-faint)]",
        ].join(" ")}
      >
        {model.active ? <Check size={11} strokeWidth={2.6} /> : null}
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[12.5px] text-[var(--text)]">{model.label}</span>
        <span className="shrink-0 text-[11px] text-[var(--text-faint)]">{model.size}</span>
      </div>

      {model.installing ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{pct}%</span>
          <button
            type="button"
            aria-label={`Cancel ${model.label} download`}
            onClick={model.uninstall}
            className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[6px] text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X size={13} strokeWidth={1.9} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={`Download ${model.label}`}
            disabled={model.installed}
            onClick={model.install}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)] cursor-pointer"
          >
            <Download size={13} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            aria-label={`Delete ${model.label}`}
            disabled={!model.installed}
            onClick={model.uninstall}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[#ff8a8a] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)] cursor-pointer"
          >
            <Trash2 size={13} strokeWidth={1.9} />
          </button>
        </div>
      )}
    </div>
  );
}
