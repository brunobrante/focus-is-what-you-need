import { useEffect } from "react";
import { CANVAS_COMMAND_GROUPS } from "@/domain/settings/commands";
import {
  captureKeyBinding,
  captureModifierBinding,
  formatKeyBinding,
  formatModifierBinding,
} from "@/domain/settings/resolve";
import type {
  CanvasKeyCommandId,
  CanvasModifierCommandId,
  GlobalSettings,
} from "@/domain/settings/types";
import { updateKeyCommand, updateModifierCommand } from "@/domain/settings/updates";
import type { RecordingCommand } from "./types";

export function ShortcutsTab({
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
                          edit
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

function RecordingPill({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-[8px] border border-[rgba(91,108,255,0.5)] bg-[rgba(91,108,255,0.12)] px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#5b6cff] animate-pulse" />
        <span className="text-[12px] text-[#8899ff]">Waiting for keys…</span>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text-muted)] cursor-pointer transition-colors"
      >
        cancel
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
