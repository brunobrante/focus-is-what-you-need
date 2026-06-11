import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import { CANVAS_COMMAND_GROUPS } from "@/domain/settings/commands";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import {
  captureKeyBinding,
  captureModifierBinding,
  formatKeyBinding,
  formatModifierBinding,
} from "@/domain/settings/resolve";
import type {
  CanvasCommandId,
  CanvasKeyCommandId,
  CanvasModifierCommandId,
  GlobalSettings,
  ProcessingFeatureKey,
} from "@/domain/settings/types";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { putGlobalSettings } from "@/lib/storage/repos/settings.repo";
import {
  getWorkspaceConfig,
  setWorkspaceFolder,
  pickFolderDialog,
} from "@/lib/tauri/workspace";
import { IconClock, IconDatabase, IconFolder, IconShield } from "@/components/icons";
import { Check, ChevronRight, Eraser, Maximize2, ScanText, Sparkles, Wand2 } from "lucide-react";
import {
  useProcessingFeatures,
  type ModelControls,
} from "@/lib/models/useProcessingFeatures";
import { FEATURES, MODEL_CATALOG, modelsForFeature } from "@/lib/models/modelCatalog";

type AppSettingsTab = "canvas" | "processing" | "shortcuts" | "storage";

type RecordingCommand = {
  id: CanvasCommandId;
  type: "key" | "modifier";
} | null;

export interface AppSettingsModalHandle {
  open: () => void;
  close: () => void;
}

export const AppSettingsModal = forwardRef<AppSettingsModalHandle>(
  function AppSettingsModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const [tab, setTab] = useState<AppSettingsTab>("shortcuts");
    const [recordingCommand, setRecordingCommand] = useState<RecordingCommand>(null);
    const [folderPath, setFolderPath] = useState("");
    const [workspaceName, setWorkspaceName] = useState("workspace");
    const [saving, setSaving] = useState(false);
    const { settings: persistedSettings } = useGlobalSettings();
    const [settingsDraft, setSettingsDraft] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);

    useImperativeHandle(ref, () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }));

    useEffect(() => {
      if (!isOpen) return;
      setSettingsDraft(persistedSettings);
      setRecordingCommand(null);
      getWorkspaceConfig()
        .then((cfg) => {
          setFolderPath(cfg.base_folder);
          setWorkspaceName(cfg.workspace_name);
        })
        .catch(() => {});
    }, [isOpen, persistedSettings]);

    async function handlePickFolder() {
      const picked = await pickFolderDialog().catch(() => null);
      if (picked) setFolderPath(picked);
    }

    async function handleSave() {
      setSaving(true);
      try {
        await setWorkspaceFolder(folderPath);
        // Processing install/enable/active state persists immediately and lives
        // outside the draft, so take its latest value rather than the stale draft.
        putGlobalSettings({
          ...settingsDraft,
          processing: persistedSettings.processing,
        });
        setIsOpen(false);
      } finally {
        setSaving(false);
      }
    }

    const referencesPath = folderPath ? `${folderPath}/references` : "";

    return (
      <Modal open={isOpen} onClose={() => setIsOpen(false)} size="wide" ariaLabel="Settings">
        <ModalHeader
          title="Settings"
          subtitle="Manage canvas behavior, keyboard shortcuts, and project save location."
          onClose={() => setIsOpen(false)}
        />
        <ModalBody className="!p-0 flex flex-col">
          <div className="border-b border-[var(--border)] px-[22px] shrink-0">
            <div className="flex gap-1 pt-3">
              {(
                [
                  { id: "canvas", label: "Canvas" },
                  { id: "processing", label: "Processing Features" },
                  { id: "shortcuts", label: "Keyboard shortcuts" },
                  { id: "storage", label: "Save location" },
                ] as { id: AppSettingsTab; label: string }[]
              ).map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={[
                      "relative cursor-pointer border-0 bg-transparent px-3 py-2.5 text-[13px] font-medium",
                      active
                        ? "text-[var(--text)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text)]",
                    ].join(" ")}
                  >
                    {item.label}
                    {active ? (
                      <span className="absolute -bottom-px left-2.5 right-2.5 h-0.5 rounded-[2px] bg-[var(--text)]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === "canvas" ? (
              <CanvasTab settings={settingsDraft} onSettingsChange={setSettingsDraft} />
            ) : tab === "processing" ? (
              <ProcessingFeaturesTab />
            ) : tab === "shortcuts" ? (
              <ShortcutsTab
                settings={settingsDraft}
                recordingCommand={recordingCommand}
                onStartRecording={setRecordingCommand}
                onStopRecording={() => setRecordingCommand(null)}
                onSettingsChange={setSettingsDraft}
              />
            ) : (
              <StorageTab
                folderPath={folderPath}
                referencesPath={referencesPath}
                workspaceName={workspaceName}
                onPickFolder={() => void handlePickFolder()}
              />
            )}
          </div>

          <div className="shrink-0 border-t border-[var(--border)] px-[22px] py-4 flex justify-end gap-2">
            <button type="button" onClick={() => setIsOpen(false)} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !folderPath}
              className="btn btn-primary"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </ModalBody>
      </Modal>
    );
  },
);

function CanvasTab({
  settings,
  onSettingsChange,
}: {
  settings: GlobalSettings;
  onSettingsChange: (settings: GlobalSettings) => void;
}) {
  const autoRevealSelection = settings.canvas.shell.tree.autoRevealSelection;
  const inheritParentBackground = settings.canvas.shell.inheritParentBackground;

  return (
    <div className="px-[22px] py-5 grid gap-6">
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
          Shell
        </div>
        <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
          <div className="flex items-center justify-between gap-5 px-4 py-3">
            <div>
              <div className="text-[13px] text-[var(--text)]">Inherit parent background</div>
              <p className="m-0 mt-1 max-w-[520px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
                When opening a component, the shell color inherits the background of its parent frame.
              </p>
            </div>
            <Switch
              checked={inheritParentBackground}
              ariaLabel="Inherit parent background"
              onChange={(checked) =>
                onSettingsChange(updateInheritParentBackground(settings, checked))
              }
            />
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
          Layers tree
        </div>
        <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
          <div className="flex items-center justify-between gap-5 px-4 py-3">
            <div>
              <div className="text-[13px] text-[var(--text)]">Reveal selected layers</div>
              <p className="m-0 mt-1 max-w-[520px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
                Expand parent rows and scroll the tree to the selected canvas element.
              </p>
            </div>
            <Switch
              checked={autoRevealSelection}
              ariaLabel="Reveal selected layers"
              onChange={(checked) =>
                onSettingsChange(updateTreeAutoRevealSelection(settings, checked))
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const FEATURE_ICON: Record<ProcessingFeatureKey, React.ReactNode> = {
  removeBackground: <Eraser size={16} strokeWidth={1.7} />,
  upscale: <Maximize2 size={16} strokeWidth={1.7} />,
  autoDetect: <Sparkles size={16} strokeWidth={1.7} />,
  textDetection: <ScanText size={16} strokeWidth={1.7} />,
  removeElement: <Wand2 size={16} strokeWidth={1.7} />,
};

function ProcessingFeaturesTab() {
  const { features, models } = useProcessingFeatures();
  const [showCatalog, setShowCatalog] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(MODEL_CATALOG[0].modelId);
  const selected = models[selectedModelId];

  return (
    <div className="px-[22px] py-5 grid gap-6">
      {/* Section A — installed models grouped by feature */}
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
          Installed models
        </div>
        <p className="m-0 mb-3 max-w-[560px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
          Optional on-device AI models, grouped by the feature they power. They run
          locally and stay off until you install one below.
        </p>
        <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
          {FEATURES.map((feature, index) => {
            const control = features[feature.key];
            return (
              <div
                key={feature.key}
                className={[
                  "px-4 py-3.5",
                  index < FEATURES.length - 1 ? "border-b border-[var(--border)]" : "",
                ].join(" ")}
              >
                <div className="flex items-center gap-2.5">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
                    {FEATURE_ICON[feature.key]}
                  </div>
                  <span className="text-[13px] text-[var(--text)]">{feature.name}</span>
                </div>
                {control.installedModels.length === 0 ? (
                  <p className="m-0 mt-2 pl-[38px] text-[12px] text-[var(--text-faint)]">
                    No models installed.
                  </p>
                ) : (
                  <div className="mt-2 grid gap-1.5 pl-[38px]">
                    {control.installedModels.map((m) => (
                      <InstalledModelRow key={m.modelId} model={models[m.modelId]} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section B — enable/disable switch per feature */}
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
          Features
        </div>
        <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
          {FEATURES.map((feature, index) => {
            const control = features[feature.key];
            return (
              <div
                key={feature.key}
                className={[
                  "flex items-center justify-between gap-5 px-4 py-3",
                  index < FEATURES.length - 1 ? "border-b border-[var(--border)]" : "",
                ].join(" ")}
              >
                <div>
                  <div className="text-[13px] text-[var(--text)]">{feature.name}</div>
                  <p className="m-0 mt-1 max-w-[460px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
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
            );
          })}
        </div>
      </div>

      {/* Section C — download catalog */}
      <div>
        <button
          type="button"
          onClick={() => setShowCatalog((v) => !v)}
          className="flex items-center gap-1.5 cursor-pointer border-0 bg-transparent p-0 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium hover:text-[var(--text-muted)]"
        >
          <ChevronRight
            size={13}
            strokeWidth={2}
            className={showCatalog ? "rotate-90 transition-transform" : "transition-transform"}
          />
          Available models for download
        </button>
        {showCatalog ? (
          <div className="mt-2 rounded-[12px] border border-[var(--border)] p-4">
            <div className="flex items-center gap-3">
              <select
                value={selectedModelId}
                onChange={(event) => setSelectedModelId(event.target.value)}
                className="h-9 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[13px] text-[var(--text)]"
              >
                {FEATURES.map((feature) => (
                  <optgroup key={feature.key} label={feature.name}>
                    {modelsForFeature(feature.key).map((m) => (
                      <option key={m.modelId} value={m.modelId}>
                        {m.label} · {m.size}
                        {models[m.modelId].installed ? " (installed)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {selected ? (
              <>
                <p className="m-0 mt-2.5 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
                  {selected.description}
                </p>
                <div className="mt-3">
                  <CatalogModelActions model={selected} />
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A single installed model under its feature, with active state + uninstall. */
function InstalledModelRow({ model }: { model: ModelControls }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[12.5px] text-[var(--text)] truncate">{model.label}</span>
        <span className="text-[11px] text-[var(--text-faint)]">{model.size}</span>
        {model.active ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(91,108,255,0.45)] bg-[rgba(91,108,255,0.14)] px-2 py-0.5 text-[10px] font-semibold text-[#8899ff]">
            Active
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={model.uninstall}
        className="cursor-pointer text-[11px] text-[var(--text-faint)] transition-colors hover:text-[var(--text-muted)]"
      >
        Uninstall
      </button>
    </div>
  );
}

/** Download / activate / uninstall controls for the selected catalog model. */
function CatalogModelActions({ model }: { model: ModelControls }) {
  const pct = Math.round(model.progress * 100);
  const fileIndex =
    model.files && model.currentFile
      ? (model.files as readonly string[]).indexOf(model.currentFile)
      : -1;
  const fileStatus =
    model.files && model.currentFile && fileIndex >= 0
      ? `Downloading ${model.currentFile} (${fileIndex + 1} of ${model.files.length})…`
      : null;

  if (model.installing) {
    return (
      <div className="flex flex-col gap-1">
        {fileStatus ? (
          <span className="text-[10.5px] text-[var(--text-faint)]">{fileStatus}</span>
        ) : null}
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface)]">
            <div
              className="h-full rounded-full bg-[#5b6cff] transition-[width] duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-9 text-right text-[11px] tabular-nums text-[var(--text-muted)]">
            {pct}%
          </span>
          <button
            type="button"
            onClick={model.uninstall}
            className="cursor-pointer text-[11px] text-[var(--text-faint)] transition-colors hover:text-[var(--text-muted)]"
          >
            cancel
          </button>
        </div>
      </div>
    );
  }

  if (!model.installed) {
    return (
      <button type="button" onClick={model.install} className="btn btn-primary">
        Download
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {model.active ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(74,222,128,0.4)] bg-[rgba(74,222,128,0.12)] px-2.5 py-1 text-[11px] font-medium text-[#4ade80]">
          <Check size={12} strokeWidth={2.2} />
          Active
        </span>
      ) : (
        <button type="button" onClick={model.setActive} className="btn btn-primary">
          Use this model
        </button>
      )}
      <button type="button" onClick={model.uninstall} className="btn btn-ghost">
        Uninstall
      </button>
    </div>
  );
}

function ShortcutsTab({
  settings,
  recordingCommand,
  onStartRecording,
  onStopRecording,
  onSettingsChange,
}: {
  settings: GlobalSettings;
  recordingCommand: RecordingCommand;
  onStartRecording: (command: Exclude<RecordingCommand, null>) => void;
  onStopRecording: () => void;
  onSettingsChange: (settings: GlobalSettings) => void;
}) {
  useEffect(() => {
    if (!recordingCommand) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (recordingCommand.type === "key") {
        const binding = captureKeyBinding(event);
        if (!binding) return;
        onSettingsChange(updateKeyCommand(settings, recordingCommand.id as CanvasKeyCommandId, binding));
        onStopRecording();
        return;
      }

      const binding = captureModifierBinding(event);
      if (!binding) return;
      onSettingsChange(updateModifierCommand(settings, recordingCommand.id as CanvasModifierCommandId, binding));
      onStopRecording();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onSettingsChange, onStopRecording, recordingCommand, settings]);

  return (
    <div className="px-[22px] py-5 grid gap-6">
      <p className="text-[12.5px] leading-[1.6] text-[var(--text-muted)] m-0">
        Click a shortcut to reassign it. Press the new key combination and confirm.
      </p>

      {CANVAS_COMMAND_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
            {group.label}
          </div>
          <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
            {group.commands.map((entry, index) => {
              const isRecording = recordingCommand?.id === entry.id;
              const isLast = index === group.commands.length - 1;
              const labels =
                entry.type === "key"
                  ? settings.canvas.inputBindings.keyCommands[entry.id].map(formatKeyBinding)
                  : [formatModifierBinding(settings.canvas.inputBindings.modifierCommands[entry.id])];
              return (
                <div
                  key={entry.id}
                  className={[
                    "flex items-center justify-between px-4 py-3",
                    !isLast ? "border-b border-[var(--border)]" : "",
                    isRecording ? "bg-[rgba(91,108,255,0.08)]" : "hover:bg-[var(--surface)]",
                    "transition-colors",
                  ].join(" ")}
                >
                  <span className="text-[13px] text-[var(--text)]">{entry.label}</span>
                  <div className="flex items-center gap-2">
                    {isRecording ? (
                      <RecordingPill onCancel={onStopRecording} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStartRecording({ id: entry.id, type: entry.type })}
                        className="flex items-center gap-1 cursor-pointer group"
                        aria-label={`Reassign shortcut: ${entry.label}`}
                      >
                        {labels.map((key, i) => (
                          <KeyBadge key={i}>{key}</KeyBadge>
                        ))}
                        <span className="ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-[var(--text-faint)]">
                          editar
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4 text-[12.5px] leading-[1.6] text-[var(--text-muted)]">
        Shortcuts are saved locally and apply to the entire workspace.
        Shortcuts that conflict with the operating system may not work.
      </div>
    </div>
  );
}

function updateInheritParentBackground(
  settings: GlobalSettings,
  inheritParentBackground: boolean,
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      shell: { ...settings.canvas.shell, inheritParentBackground },
    },
  };
}

function updateTreeAutoRevealSelection(
  settings: GlobalSettings,
  autoRevealSelection: boolean,
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      shell: {
        ...settings.canvas.shell,
        tree: {
          ...settings.canvas.shell.tree,
          autoRevealSelection,
        },
      },
    },
  };
}

function updateKeyCommand(
  settings: GlobalSettings,
  commandId: CanvasKeyCommandId,
  binding: GlobalSettings["canvas"]["inputBindings"]["keyCommands"][CanvasKeyCommandId][number],
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      inputBindings: {
        ...settings.canvas.inputBindings,
        keyCommands: {
          ...settings.canvas.inputBindings.keyCommands,
          [commandId]: [binding],
        },
      },
    },
  };
}

function updateModifierCommand(
  settings: GlobalSettings,
  commandId: CanvasModifierCommandId,
  binding: GlobalSettings["canvas"]["inputBindings"]["modifierCommands"][CanvasModifierCommandId],
): GlobalSettings {
  return {
    ...settings,
    canvas: {
      ...settings.canvas,
      inputBindings: {
        ...settings.canvas.inputBindings,
        modifierCommands: {
          ...settings.canvas.inputBindings.modifierCommands,
          [commandId]: binding,
        },
      },
    },
  };
}

function RecordingPill({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-[8px] border border-[rgba(91,108,255,0.5)] bg-[rgba(91,108,255,0.12)] px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#5b6cff] animate-pulse" />
        <span className="text-[12px] text-[#8899ff]">Aguardando teclas…</span>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text-muted)] cursor-pointer transition-colors"
      >
        cancelar
      </button>
    </div>
  );
}

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-[26px] items-center justify-center rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--text-muted)] shadow-[0_1px_0_rgba(0,0,0,0.4)]">
      {children}
    </span>
  );
}

function Switch({
  checked,
  ariaLabel,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        "inline-flex shrink-0 items-center",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      ].join(" ")}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        className={[
          "relative h-6 w-11 rounded-full border transition-colors",
          checked
            ? "border-[#5b6cff] bg-[#5b6cff]"
            : "border-[var(--border-strong)] bg-[var(--surface)]",
        ].join(" ")}
      >
        <span
          className="absolute top-1/2 h-[18px] w-[18px] rounded-full bg-white transition-transform"
          style={{ transform: `translate(${checked ? 21 : 3}px, -50%)` }}
        />
      </span>
    </label>
  );
}

function StorageTab({
  folderPath,
  referencesPath,
  workspaceName,
  onPickFolder,
}: {
  folderPath: string;
  referencesPath: string;
  workspaceName: string;
  onPickFolder: () => void;
}) {
  return (
    <div className="px-[22px] py-5 grid gap-6">
      <div className="grid gap-5">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
            Projects base folder
          </div>
          <p className="mt-0 mb-3 text-[12.5px] leading-[1.6] text-[var(--text-muted)]">
            Root folder where global references, workspaces, and standalone projects will be stored.
            The created structure is <code className="rounded-[4px] bg-[var(--surface)] px-1 font-mono text-[11px] text-[var(--text)]">&lt;folder&gt;/references, &lt;folder&gt;/workspaces/{workspaceName}, &lt;folder&gt;/projects</code>.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5">
              <IconFolder size={14} strokeWidth={1.7} className="shrink-0 text-[var(--text-faint)]" />
              <span className="flex-1 text-[13.5px] font-medium text-[var(--text)] truncate">
                {folderPath || "Loading…"}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost shrink-0"
              onClick={onPickFolder}
            >
              Escolher pasta
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="mb-0 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
            Storage details
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InfoCard
              icon={<IconFolder size={15} strokeWidth={1.7} />}
              label="References folder"
              value={referencesPath || "—"}
              mono
            />
            <InfoCard
              icon={<IconDatabase size={15} strokeWidth={1.7} />}
              label="Formato"
              value="SQLite"
            />
            <InfoCard
              icon={<IconClock size={15} strokeWidth={1.7} />}
              label="Auto-save"
              value="Automatic"
            />
            <InfoCard
              icon={<IconShield size={15} strokeWidth={1.7} />}
              label="Backup"
              value="Desativado"
            />
          </div>
        </div>

        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4 text-[12.5px] leading-[1.6] text-[var(--text-muted)]">
          Projects are stored in a local SQLite database.{" "}
          <code className="rounded-[4px] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[11.5px] text-[var(--text)]">
            .figx
          </code>{" "}
          is an export format — use “Export .figx” on a project to write one to the workspace folder.
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="mb-2.5 flex items-center gap-2 text-[var(--text-faint)]">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.4px]">{label}</span>
      </div>
      <div
        className={[
          "text-[13px] font-medium text-[var(--text)] truncate",
          mono ? "font-mono text-[12px]" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
