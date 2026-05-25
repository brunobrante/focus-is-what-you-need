import { useEffect, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import {
  getWorkspaceConfig,
  setWorkspaceFolder,
  pickFolderDialog,
} from "@/lib/tauri/workspace";

type AppSettingsTab = "shortcuts" | "storage";

type ShortcutEntry = {
  action: string;
  keys: string[];
};

type ShortcutGroup = {
  label: string;
  entries: ShortcutEntry[];
};

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Canvas",
    entries: [
      { action: "Desfazer", keys: ["⌘", "Z"] },
      { action: "Refazer", keys: ["⌘", "⇧", "Z"] },
      { action: "Salvar", keys: ["⌘", "S"] },
      { action: "Selecionar tudo", keys: ["⌘", "A"] },
      { action: "Copiar", keys: ["⌘", "C"] },
      { action: "Colar", keys: ["⌘", "V"] },
      { action: "Duplicar", keys: ["⌘", "D"] },
      { action: "Apagar seleção", keys: ["⌫"] },
    ],
  },
  {
    label: "Zoom",
    entries: [
      { action: "Aumentar zoom", keys: ["⌘", "+"] },
      { action: "Reduzir zoom", keys: ["⌘", "-"] },
      { action: "Zoom 100%", keys: ["⌘", "0"] },
      { action: "Ajustar à tela", keys: ["⌘", "⇧", "H"] },
    ],
  },
  {
    label: "Navegação",
    entries: [
      { action: "Abrir busca", keys: ["⌘", "K"] },
      { action: "Nova tela", keys: ["⌘", "N"] },
      { action: "Abrir canvas", keys: ["⌘", "E"] },
      { action: "Voltar", keys: ["⌘", "["] },
      { action: "Avançar", keys: ["⌘", "]"] },
    ],
  },
  {
    label: "Ferramentas",
    entries: [
      { action: "Ferramenta Seleção", keys: ["V"] },
      { action: "Ferramenta Mão", keys: ["H"] },
      { action: "Ferramenta Retângulo", keys: ["R"] },
      { action: "Ferramenta Texto", keys: ["T"] },
    ],
  },
];

type AppSettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

export function AppSettingsModal({ open, onClose }: AppSettingsModalProps) {
  const [tab, setTab] = useState<AppSettingsTab>("shortcuts");
  const [recordingAction, setRecordingAction] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [workspaceName, setWorkspaceName] = useState("workspace");
  const [saving, setSaving] = useState(false);

  // Load real config whenever the modal opens
  useEffect(() => {
    if (!open) return;
    getWorkspaceConfig()
      .then((cfg) => {
        setFolderPath(cfg.base_folder);
        setWorkspaceName(cfg.workspace_name);
      })
      .catch(() => {});
  }, [open]);

  async function handlePickFolder() {
    const picked = await pickFolderDialog().catch(() => null);
    if (picked) setFolderPath(picked);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setWorkspaceFolder(folderPath);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const referencesPath = folderPath
    ? `${folderPath}/references`
    : "";

  return (
    <Modal open={open} onClose={onClose} size="wide" ariaLabel="Configurações">
      <ModalHeader
        title="Configurações"
        subtitle="Gerencie atalhos de teclado e o local de salvamento dos projetos."
        onClose={onClose}
      />
      <ModalBody className="!p-0 flex flex-col">
        <div className="border-b border-[var(--border)] px-[22px] shrink-0">
          <div className="flex gap-1 pt-3">
            {(
              [
                { id: "shortcuts", label: "Atalhos de teclado" },
                { id: "storage", label: "Local de salvamento" },
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
          {tab === "shortcuts" ? (
            <ShortcutsTab
              recordingAction={recordingAction}
              onStartRecording={setRecordingAction}
              onStopRecording={() => setRecordingAction(null)}
            />
          ) : (
            <StorageTab
              folderPath={folderPath}
              referencesPath={referencesPath}
              onPickFolder={() => void handlePickFolder()}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--border)] px-[22px] py-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !folderPath}
            className="btn btn-primary"
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </ModalBody>
    </Modal>
  );
}

function ShortcutsTab({
  recordingAction,
  onStartRecording,
  onStopRecording,
}: {
  recordingAction: string | null;
  onStartRecording: (action: string) => void;
  onStopRecording: () => void;
}) {
  return (
    <div className="px-[22px] py-5 grid gap-6">
      <p className="text-[12.5px] leading-[1.6] text-[var(--text-muted)] m-0">
        Clique em um atalho para reatribuí-lo. Pressione a nova combinação de teclas e confirme.
      </p>

      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
            {group.label}
          </div>
          <div className="rounded-[12px] border border-[var(--border)] overflow-hidden">
            {group.entries.map((entry, index) => {
              const isRecording = recordingAction === entry.action;
              const isLast = index === group.entries.length - 1;
              return (
                <div
                  key={entry.action}
                  className={[
                    "flex items-center justify-between px-4 py-3",
                    !isLast ? "border-b border-[var(--border)]" : "",
                    isRecording ? "bg-[rgba(91,108,255,0.08)]" : "hover:bg-[var(--surface)]",
                    "transition-colors",
                  ].join(" ")}
                >
                  <span className="text-[13px] text-[var(--text)]">{entry.action}</span>
                  <div className="flex items-center gap-2">
                    {isRecording ? (
                      <RecordingPill onCancel={onStopRecording} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStartRecording(entry.action)}
                        className="flex items-center gap-1 cursor-pointer group"
                        aria-label={`Reatribuir atalho: ${entry.action}`}
                      >
                        {entry.keys.map((key, i) => (
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
        Os atalhos são salvos localmente e valem para toda a workspace.
        Atalhos conflitantes com o sistema operacional podem não funcionar.
      </div>
    </div>
  );
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

function StorageTab({
  folderPath,
  referencesPath,
  onPickFolder,
}: {
  folderPath: string;
  referencesPath: string;
  onPickFolder: () => void;
}) {
  return (
    <div className="px-[22px] py-5 grid gap-6">
      <div className="grid gap-5">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
            Pasta base dos projetos
          </div>
          <p className="mt-0 mb-3 text-[12.5px] leading-[1.6] text-[var(--text-muted)]">
            Pasta raiz onde referências globais, workspaces e projetos avulsos serão armazenados.
            A estrutura criada é <code className="rounded-[4px] bg-[var(--surface)] px-1 font-mono text-[11px] text-[var(--text)]">&lt;pasta&gt;/references, &lt;pasta&gt;/workspaces/{workspaceName}, &lt;pasta&gt;/projects</code>.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-[var(--text-faint)]"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="flex-1 text-[13.5px] font-medium text-[var(--text)] truncate">
                {folderPath || "Carregando…"}
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
            Detalhes do armazenamento
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InfoCard
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              }
              label="Pasta de referências"
              value={referencesPath || "—"}
              mono
            />
            <InfoCard
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
                  <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
                </svg>
              }
              label="Formato"
              value=".figx"
            />
            <InfoCard
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              label="Auto-save"
              value="Automático"
            />
            <InfoCard
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              }
              label="Backup"
              value="Desativado"
            />
          </div>
        </div>

        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4 text-[12.5px] leading-[1.6] text-[var(--text-muted)]">
          Os projetos são salvos como arquivos{" "}
          <code className="rounded-[4px] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[11.5px] text-[var(--text)]">
            .figx
          </code>{" "}
          dentro do workspace local. Projetos mockados continuam internos e não são gravados nessa pasta.
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
