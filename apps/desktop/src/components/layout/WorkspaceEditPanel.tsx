import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { useWorkspaces } from "@/lib/storage/hooks";
import { updateWorkspace } from "@/lib/storage/repos/workspace.repo";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { putGlobalSettings } from "@/lib/storage/repos/settings.repo";
import { useWorkspaceElementDefaults } from "@/application/settings/useScopedElementDefaults";
import { ElementDefaultsEditor } from "@/canvas/settings/ElementDefaultsEditor";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";

export interface WorkspaceEditPanelHandle {
  open: () => void;
  close: () => void;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[15px] font-semibold tracking-[-0.2px] text-[var(--text)]">{title}</h2>
      <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">{subtitle}</p>
    </div>
  );
}

/**
 * Full-page workspace editor, opened from the avatar menu. It mirrors the
 * project Edit page (sticky action bar + scrollable sectioned body) but is a
 * portaled overlay covering everything below the global TopBar — no routing.
 * It edits the active workspace's name and hosts the canvas element-defaults
 * config (Global base + this workspace's override).
 */
export const WorkspaceEditPanel = forwardRef<WorkspaceEditPanelHandle>(
  function WorkspaceEditPanel(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    useImperativeHandle(ref, () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }));
    if (!isOpen) return null;
    return createPortal(
      <WorkspaceEditOverlay onClose={() => setIsOpen(false)} />,
      document.body,
    );
  },
);

function WorkspaceEditOverlay({ onClose }: { onClose: () => void }) {
  const [activeId] = useActiveWorkspaceId();
  const { data: workspaces } = useWorkspaces();
  const workspaceId = activeId ?? workspaces[0]?.id ?? null;
  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;

  const [name, setName] = useState(workspace?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 10);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Sync the field once the workspace row resolves (and if the active one changes).
  // The id is stable across an edit, so this never clobbers in-progress typing.
  useEffect(() => {
    if (workspace) setName(workspace.name);
  }, [workspace?.id]);

  async function save() {
    if (!workspaceId || !name.trim() || saving) return;
    setSaving(true);
    try {
      await updateWorkspace(workspaceId, { name: name.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const projectCount = workspace?.projectIds.length ?? 0;
  const createdDate = workspace?.createdAt
    ? new Date(workspace.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div
      role="dialog"
      aria-label="Edit workspace"
      className="fixed inset-x-0 bottom-0 top-14 z-[70] flex flex-col bg-[var(--bg)]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 160ms ease" }}
    >
      {/* Action header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-7 py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <IconClose size={11} strokeWidth={2} />
          </button>
          <span className="text-[13px] font-medium text-[var(--text)]">Edit workspace</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!workspaceId || !name.trim() || saving}
            className="btn btn-primary"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[880px] flex-col gap-9 px-7 py-9">
          {workspaceId ? (
            <>
              {/* Details */}
              <section className="flex flex-col gap-6">
                <SectionHeading title="Details" subtitle="Name and overview of this workspace." />
                <div className="flex flex-col gap-4">
                  <label className="flex w-full max-w-[360px] flex-col gap-1.5">
                    <span className="text-[11px] text-[var(--text-faint)]">Workspace name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void save()}
                      placeholder="Workspace name"
                      autoFocus
                      className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
                    />
                  </label>
                  <div className="flex items-center gap-3 text-[12px] text-[var(--text-faint)]">
                    <span>
                      <span className="font-medium text-[var(--text-muted)]">{projectCount}</span>{" "}
                      {projectCount === 1 ? "Project" : "Projects"}
                    </span>
                    {createdDate ? (
                      <>
                        <span className="opacity-40">·</span>
                        <span>Created {createdDate}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </section>

              <div className="border-t border-[var(--border)]" />

              {/* Toolbar config (element defaults) */}
              <ToolbarConfigSection
                workspaceId={workspaceId}
                workspaceName={workspace?.name ?? "Workspace"}
              />
            </>
          ) : (
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-6 text-center text-[13px] text-[var(--text-muted)]">
              Create or select a workspace from the top-left switcher to edit it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Canvas element defaults, with a Global / Workspace scope toggle. Global edits
 * the base; Workspace overrides it for this workspace. Both persist immediately
 * (the project scope is edited in the project's Edit page).
 */
function ToolbarConfigSection({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [scope, setScope] = useState<"global" | "workspace">("workspace");
  const { settings: globalSettings } = useGlobalSettings();
  const ws = useWorkspaceElementDefaults(workspaceId);

  return (
    <section className="flex flex-col gap-6">
      <SectionHeading
        title="Toolbar config"
        subtitle="Default styles new canvas elements get when created from the toolbar. Edit the Global base, or override them for this workspace — each project can override these again in its own Edit page."
      />

      <div className="inline-flex w-fit rounded-[9px] border border-[var(--border)] bg-[var(--surface)] p-0.5">
        {(["global", "workspace"] as const).map((s) => {
          const active = scope === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={[
                "rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                active
                  ? "bg-[var(--bg)] text-[var(--text)] shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              {s === "global" ? "Global" : workspaceName}
            </button>
          );
        })}
      </div>

      {scope === "global" ? (
        <ElementDefaultsEditor
          scope="global"
          inherited={DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults}
          override={globalSettings.canvas.elementDefaults}
          parentLabel="default"
          onChange={(next) =>
            putGlobalSettings({
              ...globalSettings,
              canvas: {
                ...globalSettings.canvas,
                // At global scope the editor emits the full element-defaults tree.
                elementDefaults: {
                  ...globalSettings.canvas.elementDefaults,
                  ...next,
                } as GlobalSettings["canvas"]["elementDefaults"],
              },
            })
          }
        />
      ) : (
        <ElementDefaultsEditor
          scope="workspace"
          inherited={ws.inherited}
          override={ws.override}
          parentLabel="Global"
          onChange={ws.save}
        />
      )}
    </section>
  );
}
