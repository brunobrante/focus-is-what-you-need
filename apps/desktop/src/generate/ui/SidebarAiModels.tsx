import { useState } from "react";
import { Check, ChevronRight, Download, Trash2, X } from "lucide-react";

import type { ProcessingFeatureKey } from "@/domain/settings/types";
import {
  useProcessingFeatures,
  type ModelControls,
} from "@/lib/models/useProcessingFeatures";
import { FEATURES, modelsForFeature } from "@/lib/models/modelCatalog";
import { Switch } from "@/components/modals/appSettings/Switch";

/**
 * The Processing Features (on-device AI models) controls, compacted for the
 * Builder's Config sidebar. Same logic as the Settings modal tab — feature
 * enable toggle, per-model active selection, and install/uninstall — so changes
 * apply through the shared settings repo and take effect in the Builder live.
 */
export function SidebarAiModels() {
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
    <div className="flex flex-col gap-2">
      <div>
        <h4 className="m-0 text-[12.5px] font-semibold text-[var(--text)]">AI models</h4>
        <p className="m-0 mt-1 text-[10.5px] leading-[1.4] text-[var(--text-faint)]">
          On-device models the Builder can use. Toggle a feature on, expand it to
          download models, and pick which one it runs.
        </p>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[var(--border)]">
        {FEATURES.map((feature, index) => {
          const control = features[feature.key];
          const open = expanded.has(feature.key);
          const hasModels = !feature.modelFree;
          return (
            <div
              key={feature.key}
              className={index < FEATURES.length - 1 ? "border-b border-[var(--border)]" : ""}
            >
              <div className="flex items-center gap-2 px-2.5 py-2">
                {hasModels ? (
                  <button
                    type="button"
                    aria-label={open ? `Collapse ${feature.name}` : `Expand ${feature.name}`}
                    aria-expanded={open}
                    onClick={() => toggle(feature.key)}
                    className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-[5px] text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  >
                    <ChevronRight
                      size={13}
                      strokeWidth={2}
                      className={open ? "rotate-90 transition-transform" : "transition-transform"}
                    />
                  </button>
                ) : (
                  <span className="h-5 w-5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-[var(--text)]">{feature.name}</div>
                  {!control.canEnable ? (
                    <div className="text-[10px] text-[var(--text-faint)]">Install a model to enable.</div>
                  ) : null}
                </div>
                <Switch
                  checked={control.enabled}
                  disabled={!control.canEnable}
                  ariaLabel={`Enable ${feature.name}`}
                  onChange={(checked) => control.setEnabled(checked)}
                />
              </div>

              {open && hasModels ? (
                <div className="border-t border-[var(--border)] bg-[var(--bg)] py-1 pl-2.5 pr-2">
                  {modelsForFeature(feature.key).map((m) => (
                    <SidebarModelRow key={m.modelId} model={models[m.modelId]} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One model under an expanded feature, compacted for the sidebar. */
function SidebarModelRow({ model }: { model: ModelControls }) {
  const pct = Math.round(model.progress * 100);
  return (
    <div className="flex items-center gap-2 py-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={model.active}
        aria-label={`Use ${model.label}`}
        disabled={!model.installed}
        onClick={model.setActive}
        className={[
          "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border transition-colors",
          !model.installed
            ? "cursor-not-allowed border-[var(--border)] bg-[var(--surface)] opacity-40"
            : model.active
              ? "cursor-pointer border-[#5b6cff] bg-[#5b6cff] text-white"
              : "cursor-pointer border-[var(--border-strong)] bg-[var(--surface)] text-transparent hover:border-[var(--text-faint)]",
        ].join(" ")}
      >
        {model.active ? <Check size={10} strokeWidth={2.6} /> : null}
      </button>

      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate text-[11.5px] text-[var(--text)]">{model.label}</span>
        <span className="shrink-0 text-[10px] text-[var(--text-faint)]">{model.size}</span>
      </div>

      {model.builtin ? (
        <span className="shrink-0 px-0.5 text-[10px] text-[var(--text-faint)]">Built-in</span>
      ) : model.installing ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] tabular-nums text-[var(--text-muted)]">{pct}%</span>
          <button
            type="button"
            aria-label={`Cancel ${model.label} download`}
            onClick={model.uninstall}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X size={12} strokeWidth={1.9} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={`Download ${model.label}`}
            disabled={model.installed}
            onClick={model.install}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"
          >
            <Download size={12} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            aria-label={`Delete ${model.label}`}
            disabled={!model.installed}
            onClick={model.uninstall}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[#ff8a8a] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"
          >
            <Trash2 size={12} strokeWidth={1.9} />
          </button>
        </div>
      )}
    </div>
  );
}
