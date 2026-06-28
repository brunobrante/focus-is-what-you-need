import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { IconClock, IconDatabase, IconFolder, IconShield, IconTrash } from "@/components/icons";
import { resetToFactoryData } from "@/lib/storage/seed";

export function StorageTab({
  folderPath,
  referencesPath,
  workspaceName,
  onPickFolder,
  onOpenFolder,
  onOpenReferencesFolder,
}: {
  folderPath: string;
  referencesPath: string;
  workspaceName: string;
  onPickFolder: () => void;
  onOpenFolder: () => void;
  onOpenReferencesFolder: () => void;
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
              {folderPath && (
                <button
                  type="button"
                  onClick={onOpenFolder}
                  title="Abrir no Finder"
                  className="shrink-0 flex items-center justify-center w-6 h-6 rounded-[6px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                >
                  <FolderOpen size={13} strokeWidth={1.7} />
                </button>
              )}
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
              onOpen={referencesPath ? onOpenReferencesFolder : undefined}
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

        <ResetSection />
      </div>
    </div>
  );
}

function ResetSection() {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Auto-cancel the armed confirm after a few seconds so it can't fire by accident.
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(id);
  }, [confirming]);

  async function handleReset() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setResetting(true);
    try {
      await resetToFactoryData();
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-[12px] border border-[rgba(255,80,80,0.3)] bg-[rgba(255,80,80,0.05)] p-4">
      <div className="text-[11px] uppercase tracking-[0.5px] text-[#ffb0b0] font-medium">
        Danger zone
      </div>
      <p className="m-0 text-[12.5px] leading-[1.6] text-[var(--text-muted)]">
        Reset all data back to the default mock workspace. This deletes every project,
        scene, and edit and reseeds the factory data. This cannot be undone.
      </p>
      <button
        type="button"
        onClick={() => void handleReset()}
        disabled={resetting}
        className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-[10px] border border-[rgba(255,80,80,0.4)] bg-transparent px-4 text-[13px] font-medium text-[#ffb0b0] transition-colors hover:bg-[rgba(255,80,80,0.12)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
      >
        <IconTrash size={14} strokeWidth={1.7} />
        <span>
          {resetting
            ? "Resetting data…"
            : confirming
              ? "Click again to reset everything"
              : "Reset to default data"}
        </span>
      </button>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  mono = false,
  onOpen,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  onOpen?: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="mb-2.5 flex items-center gap-2 text-[var(--text-faint)]">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.4px]">{label}</span>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            title="Abrir no Finder"
            className="ml-auto flex items-center justify-center w-5 h-5 rounded-[5px] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
          >
            <FolderOpen size={12} strokeWidth={1.7} />
          </button>
        )}
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
