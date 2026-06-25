import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { Home } from "lucide-react";
import { AppSettingsModal, type AppSettingsModalHandle } from "@/components/modals/AppSettingsModal";
import { IconChevronDown, IconColorStyles, IconGrid, IconImage, IconLayers, IconPencil, IconPlus, IconSettings, IconTrash } from "@/components/icons";
import { useWorkspaces } from "@/lib/storage/hooks";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { createWorkspace } from "@/lib/storage/repos/workspace.repo";

export function TopBar({
  onResetToFactory,
  isResettingFactory = false,
  extra,
}: {
  onResetToFactory?: () => Promise<void> | void;
  isResettingFactory?: boolean;
  extra?: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const settingsRef = useRef<AppSettingsModalHandle>(null);
  const navigate = useNavigate();
  const [wsOpen, setWsOpen] = useState(false);
  const [wsPosition, setWsPosition] = useState<{ top: number; left: number } | null>(null);
  const { data: workspaces } = useWorkspaces();
  const [activeWsId, setActiveWsId] = useActiveWorkspaceId();
  const [newWsName, setNewWsName] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wsTriggerRef = useRef<HTMLButtonElement>(null);
  const wsMenuRef = useRef<HTMLDivElement>(null);

  useDismissable(
    menuOpen,
    () => {
      setMenuOpen(false);
      setMenuPosition(null);
    },
    [triggerRef, menuRef],
  );

  useDismissable(
    wsOpen,
    () => {
      setWsOpen(false);
      setWsPosition(null);
    },
    [wsTriggerRef, wsMenuRef],
  );

  const currentWs =
    workspaces.find((w) => w.id === activeWsId) ?? workspaces[0] ?? null;

  const handleCreateWorkspace = async () => {
    const name = newWsName.trim();
    if (!name || creatingWs) return;
    setCreatingWs(true);
    try {
      const created = await createWorkspace({ name });
      setActiveWsId(created.id);
      setNewWsName("");
      setWsOpen(false);
      setWsPosition(null);
    } finally {
      setCreatingWs(false);
    }
  };

  return (
    <>
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--border)] px-6 text-[13px] tracking-[0.3px] text-[var(--text-muted)]">
      <Link
        to="/"
        aria-label="Home"
        title="Home"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
      >
        <Home size={15} strokeWidth={1.8} />
      </Link>
      <span aria-hidden className="h-5 w-px bg-[var(--border)]" />
      <button
        ref={wsTriggerRef}
        type="button"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setWsPosition({ top: rect.bottom + 6, left: rect.left });
          setWsOpen((v) => !v);
        }}
        className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] tracking-[0.3px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
      >
        <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-[3px] bg-[var(--text)]" />
        {currentWs?.name ?? "workspace"}
        <IconChevronDown
          size={10}
          strokeWidth={2.4}
          className={["transition-transform duration-150", wsOpen ? "rotate-180" : ""].join(" ")}
        />
      </button>

      {wsOpen && wsPosition ? createPortal(
        <div
          ref={wsMenuRef}
          style={{ position: "fixed", top: wsPosition.top, left: wsPosition.left }}
          className="z-[80] w-[220px] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] py-1.5 shadow-[var(--shadow-pop)] backdrop-blur-md"
        >
          <div className="px-3 pb-2 pt-1.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
              Workspaces
            </div>
          </div>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => { setActiveWsId(ws.id); setWsOpen(false); setWsPosition(null); }}
              className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left transition-colors hover:bg-[var(--surface)]"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[5px] bg-[var(--text)] text-[9px] font-bold text-[var(--bg)]">
                {ws.name[0]?.toUpperCase() ?? "W"}
              </span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-[var(--text)]">{ws.name}</div>
                <div className="truncate text-[11px] text-[var(--text-faint)]">
                  {ws.projectIds.length} {ws.projectIds.length === 1 ? "project" : "projects"}
                </div>
              </div>
              {currentWs?.id === ws.id && (
                <span className="ml-auto text-[10px] text-[var(--text-faint)]">✓</span>
              )}
            </button>
          ))}
          <div className="mt-1 border-t border-[var(--border)] px-2 pt-2">
            <input
              type="text"
              value={newWsName}
              placeholder="New workspace name…"
              onChange={(e) => setNewWsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateWorkspace();
              }}
              className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
            />
            <button
              type="button"
              onClick={() => void handleCreateWorkspace()}
              disabled={!newWsName.trim() || creatingWs}
              className="mt-1.5 flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1 py-1.5 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
            >
              <IconPlus size={13} strokeWidth={2} />
              {creatingWs ? "Creating…" : "Create workspace"}
            </button>
          </div>
        </div>,
        document.body,
      ) : null}

      <span aria-hidden className="mx-0.5 h-5 w-px bg-[var(--border)]" />
      <nav aria-label="Workspace" className="inline-flex items-center gap-1">
        <TopNavLink to={currentWs ? `/workspace/${currentWs.id}/projects` : "/projects"}>
          <IconGrid size={14} strokeWidth={1.7} className="opacity-85" />
          Projects
        </TopNavLink>
        <TopNavLink to={currentWs ? `/workspace/${currentWs.id}/components` : "/components"}>
          <IconLayers size={14} strokeWidth={1.7} className="opacity-85" />
          Components
        </TopNavLink>
        <TopNavLink to={currentWs ? `/workspace/${currentWs.id}/system-design` : "/system-design"}>
          <IconColorStyles size={14} strokeWidth={1.7} className="opacity-85" />
          System
        </TopNavLink>
        <TopNavLink to={currentWs ? `/workspace/${currentWs.id}/references` : "/references"}>
          <IconImage size={14} strokeWidth={1.7} className="opacity-85" />
          References
        </TopNavLink>
      </nav>
      {extra ? (
        <>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-[var(--border)]" />
          {extra}
        </>
      ) : null}
      <span className="flex-1" />
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const width = 200;
          setMenuPosition({
            top: rect.bottom + 8,
            left: Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width)),
          });
          setMenuOpen((current) => !current);
        }}
        className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
      >
        <IconSettings size={15} strokeWidth={1.7} />
      </button>
      {menuOpen && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[80] min-w-[200px] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1.5 shadow-[var(--shadow-pop)] backdrop-blur-md"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {currentWs && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setMenuPosition(null);
                    navigate(`/workspace/${currentWs.id}/edit`);
                  }}
                  className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
                >
                  <IconPencil size={13} />
                  <span>Edit workspace settings</span>
                </button>
              )}
              {onResetToFactory ? (
                <>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setMenuPosition(null);
                      void onResetToFactory();
                    }}
                    disabled={isResettingFactory}
                    className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-left text-[12px] text-[#ffb0b0] transition-colors hover:bg-[rgba(255,80,80,0.12)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
                  >
                    <IconTrash size={13} />
                    <span>{isResettingFactory ? "Resetting data…" : "Factory reset"}</span>
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </header>
    <AppSettingsModal ref={settingsRef} />
    </>
  );
}

function TopNavLink({
  to,
  end,
  children,
}: {
  to: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "relative inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium tracking-[0.1px] transition-colors duration-[120ms]",
          isActive
            ? "bg-[var(--surface)] text-[var(--text)]"
            : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}
