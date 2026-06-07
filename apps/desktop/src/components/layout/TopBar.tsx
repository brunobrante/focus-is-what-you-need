import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { Wand2 } from "lucide-react";
import { AppSettingsModal } from "@/components/modals/AppSettingsModal";
import { IconGrid, IconImage, IconSettings, IconTrash } from "@/components/icons";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
        setMenuPosition(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMenuPosition(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
    <header className="flex h-12 shrink-0 items-center gap-3.5 border-b border-[var(--border)] px-5 text-[12px] tracking-[0.3px] text-[var(--text-muted)]">
      <span aria-hidden className="h-3 w-3 rounded-[3px] bg-[var(--text)]" />
      <span className="tracking-[0.3px] text-[var(--text-muted)]">workspace</span>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--border)]" />
      <nav aria-label="Workspace" className="inline-flex items-center gap-0.5">
        <TopNavLink to="/" end>
          <IconGrid size={13} strokeWidth={1.7} className="opacity-85" />
          Projects
        </TopNavLink>
        <TopNavLink to="/references">
          <IconImage size={13} strokeWidth={1.7} className="opacity-85" />
          References
        </TopNavLink>
        <TopNavLink to="/generate">
          <Wand2 size={13} strokeWidth={1.7} className="opacity-85" />
          Generate
        </TopNavLink>
      </nav>
      {extra ? (
        <>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--border)]" />
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
          const width = 220;
          setMenuPosition({
            top: rect.bottom + 8,
            left: Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width)),
          });
          setMenuOpen((current) => !current);
        }}
        className="grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-[var(--border)] bg-[linear-gradient(135deg,#5b6cff,#2a2f4a)] text-[10.5px] font-semibold tracking-[0.2px] text-white transition-colors hover:border-[var(--border-strong)]"
      >
        JD
      </button>
      {menuOpen && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[80] min-w-[220px] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1.5 shadow-[var(--shadow-pop)] backdrop-blur-md"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              <div className="border-b border-[var(--border)] px-3 py-2.5">
                <div className="text-[12px] font-semibold text-[var(--text)]">Workspace owner</div>
                <div className="mt-1 text-[11px] text-[var(--text-faint)]">JD · Local desktop workspace</div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setMenuPosition(null);
                  setSettingsOpen(true);
                }}
                className="mt-1 flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                <IconSettings size={13} />
                <span>Settings</span>
              </button>
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
    <AppSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
          "relative inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium tracking-[0.1px] transition-colors duration-[120ms]",
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
