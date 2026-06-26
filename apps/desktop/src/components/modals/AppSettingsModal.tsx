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

const SETTINGS_TABS: { id: AppSettingsTab; label: string }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "projects", label: "Project thumbnails" },
  { id: "processing", label: "Processing Features" },
  { id: "shortcuts", label: "Keyboard shortcuts" },
  { id: "storage", label: "Save location" },
];

/**
 * The Settings body — the tab bar, the active tab, and the Cancel/Save footer.
 * It is layout-agnostic so the same controls serve both the global Settings
 * modal (TopBar avatar menu) and the standalone Settings page (`/settings`).
 * `active` gates the async config fetch so a never-shown instance stays idle;
 * `onDone` fires on Cancel and after a successful save (close the modal, or
 * navigate away from the page).
 */
export function AppSettingsContent({
  active = true,
  onDone,
}: {
  active?: boolean;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<AppSettingsTab>("shortcuts");
  const [recordingCommand, setRecordingCommand] = useState<RecordingCommand>(null);
  const [folderPath, setFolderPath] = useState("");
  const [workspaceName, setWorkspaceName] = useState("workspace");
  const [saving, setSaving] = useState(false);
  const { settings: persistedSettings } = useGlobalSettings();
  const [settingsDraft, setSettingsDraft] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);

  useEffect(() => {
    if (!active) return;
    setSettingsDraft(persistedSettings);
    setRecordingCommand(null);
    getWorkspaceConfig()
      .then((cfg) => {
        setFolderPath(cfg.base_folder);
        setWorkspaceName(cfg.workspace_name);
      })
      .catch(() => {});
  }, [active, persistedSettings]);

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
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const referencesPath = folderPath ? `${folderPath}/references` : "";

  return (
    <>
      <div className="border-b border-[var(--border)] px-[22px] shrink-0">
        <div className="flex gap-1 pt-3">
          {SETTINGS_TABS.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={[
                  "relative cursor-pointer border-0 bg-transparent px-3 py-2.5 text-[13px] font-medium",
                  isActive
                    ? "text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                ].join(" ")}
              >
                {item.label}
                {isActive ? (
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
        <button type="button" onClick={onDone} className="btn btn-ghost">
          Cancel
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
    </>
  );
}

/**
 * The global Settings modal — opened from the workspace TopBar's avatar menu. The
 * Home sidebar instead routes to the standalone `/settings` page; both share the
 * same `AppSettingsContent` body.
 */
export const AppSettingsModal = forwardRef<AppSettingsModalHandle>(
  function AppSettingsModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);

    useImperativeHandle(ref, () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }));

    return (
      <Modal open={isOpen} onClose={() => setIsOpen(false)} size="wide" ariaLabel="Settings">
        <ModalHeader
          title="Settings"
          subtitle="Manage canvas behavior, keyboard shortcuts, and project save location."
          onClose={() => setIsOpen(false)}
        />
        <ModalBody className="!p-0 flex flex-col">
          <AppSettingsContent active={isOpen} onDone={() => setIsOpen(false)} />
        </ModalBody>
      </Modal>
    );
  },
);
