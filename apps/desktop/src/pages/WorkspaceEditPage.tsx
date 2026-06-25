import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWorkspaces } from "@/lib/storage/hooks";
import { updateWorkspace } from "@/lib/storage/repos/workspace.repo";
import { useWorkspaceElementDefaults } from "@/application/settings/useScopedElementDefaults";
import { ElementDefaultsEditor } from "@/canvas/settings/ElementDefaultsEditor";

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[15px] font-semibold tracking-[-0.2px] text-[var(--text)]">{title}</h2>
      <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">{subtitle}</p>
    </div>
  );
}

function ToolbarConfigSection({ workspaceId }: { workspaceId: string }) {
  const ws = useWorkspaceElementDefaults(workspaceId);
  return (
    <section className="flex flex-col gap-6">
      <SectionHeading
        title="Toolbar config"
        subtitle="Default styles new canvas elements get when created from the toolbar in this workspace. They override the Global defaults; each project can override them again in its own Edit page."
      />
      <ElementDefaultsEditor
        scope="workspace"
        inherited={ws.inherited}
        override={ws.override}
        parentLabel="Global"
        onChange={ws.save}
      />
    </section>
  );
}

export function WorkspaceEditPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { data: workspaces } = useWorkspaces();
  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;

  const [name, setName] = useState(workspace?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 10);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (workspace) setName(workspace.name);
  }, [workspace?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  async function save() {
    if (!workspaceId || !name.trim() || saving) return;
    setSaving(true);
    try {
      await updateWorkspace(workspaceId, { name: name.trim() });
      navigate(-1);
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
      className="flex min-h-screen flex-col bg-[var(--bg)]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 160ms ease" }}
    >
      {/* Action header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-7 py-3">
        <span className="text-[13px] font-medium text-[var(--text)]">Edit workspace</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost">
            Cancel
          </button>
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

              <ToolbarConfigSection workspaceId={workspaceId} />
            </>
          ) : (
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-6 text-center text-[13px] text-[var(--text-muted)]">
              Workspace not found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WorkspaceEditPage;
