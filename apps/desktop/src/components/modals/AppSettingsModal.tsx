import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { putGlobalSettings } from "@/lib/storage/repos/settings.repo";
import {
  getWorkspaceConfig,
  setWorkspaceFolder,
  pickFolderDialog,
} from "@/lib/tauri/workspace";
import type { AppSettingsTab, RecordingCommand } from "./appSettings/types";
import { CanvasTab } from "./appSettings/CanvasTab";
import { ProjectThumbnailsTab } from "./appSettings/ProjectThumbnailsTab";
import { ProcessingFeaturesTab } from "./appSettings/ProcessingFeaturesTab";
import { ShortcutsTab } from "./appSettings/ShortcutsTab";
import { StorageTab } from "./appSettings/StorageTab";

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
        // Processing and project-thumbnail toggles persist immediately and live
        // outside the draft, so take their latest value rather than the stale draft.
        putGlobalSettings({
          ...settingsDraft,
          processing: persistedSettings.processing,
          projectThumbnails: persistedSettings.projectThumbnails,
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
                  { id: "projects", label: "Project thumbnails" },
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
            ) : tab === "projects" ? (
              <ProjectThumbnailsTab />
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
