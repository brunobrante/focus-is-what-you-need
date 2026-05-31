import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { Wand2 } from "lucide-react";
import { AppSettingsModal } from "@/components/modals/AppSettingsModal";

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
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-85"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.2" />
            <rect x="14" y="3" width="7" height="7" rx="1.2" />
            <rect x="3" y="14" width="7" height="7" rx="1.2" />
            <rect x="14" y="14" width="7" height="7" rx="1.2" />
          </svg>
          Projects
        </TopNavLink>
        <TopNavLink to="/references">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-85"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-5-5L5 21" />
          </svg>
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
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
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
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
