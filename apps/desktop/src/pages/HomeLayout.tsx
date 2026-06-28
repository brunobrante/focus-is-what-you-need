import { useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useMatch, useNavigate } from "react-router-dom";
import { Home } from "lucide-react";

import { PageFooter } from "@/components/layout/PageFooter";
import { AppSettingsModal } from "@/components/modals/AppSettingsModal";
import {
  IconChevronDown,
  IconDocument,
  IconFrame,
  IconGrid,
  IconImage,
  IconPencil,
  IconPlus,
  IconSettings,
  IconSparkles,
  IconWand,
} from "@/components/icons";
import { useDismissable } from "@/lib/hooks/useDismissable";

/**
 * HomeLayout — the central Home shell. It owns the one header, the one sidebar,
 * and the footer; every Home-area page (Dashboard, Drafts, Local References,
 * Settings) renders inside the `<Outlet />` so the chrome is declared once and
 * never copied. Routes nest under this layout in `App.tsx`.
 */
export function HomeLayout() {
  // Settings carries its own Cancel / Save changes action bar, so the global
  // "design preview" footer is redundant there and is suppressed.
  const onSettings = useMatch("/settings");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]">
      <HomeHeader />

      <div className="flex min-h-0 flex-1">
        <HomeSidebar />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
          {onSettings ? null : <PageFooter />}
        </main>
      </div>

      <AppSettingsModal />
    </div>
  );
}

export default HomeLayout;

/* ── Header ───────────────────────────────────────────────────────────────── */

/**
 * The home's own header — deliberately separate from the workspace TopBar. It
 * carries only the product mark and a primary create action; workspace switching
 * happens through the cards below, not a switcher here.
 */
function HomeHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] px-6">
      <Link
        to="/"
        aria-label="Home"
        className="flex items-center gap-3 no-underline"
      >
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-[8px] bg-[var(--text)] text-[12px] font-bold text-[var(--bg)]"
        >
          F
        </span>
        <span className="text-[14px] font-semibold tracking-[-0.2px] text-[var(--text)]">
          Focus
        </span>
      </Link>
      <span className="flex-1" />
      <NewMenu />
    </header>
  );
}

/**
 * The header's "New" dropdown — one entry point for creating a workspace, a
 * project, or a draft. New project routes to the wizard; new workspace creates
 * one and makes it active in place; draft is a placeholder until that flow
 * exists.
 */
function NewMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useDismissable(open, () => setOpen(false), [triggerRef, menuRef]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn btn-primary"
      >
        <IconPlus size={14} strokeWidth={2} />
        Create
        <IconChevronDown
          size={11}
          strokeWidth={2.2}
          className={["transition-transform duration-150", open ? "rotate-180" : ""].join(" ")}
        />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[230px] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1.5 shadow-[var(--shadow-pop)] backdrop-blur-md"
        >
          <MenuItem
            icon={<IconGrid size={15} strokeWidth={1.7} />}
            onClick={() => {
              setOpen(false);
              navigate("/new-workspace");
            }}
          >
            New workspace
          </MenuItem>
          <MenuItem
            icon={<IconFrame size={15} strokeWidth={1.7} />}
            onClick={() => {
              setOpen(false);
              navigate("/new");
            }}
          >
            New project
          </MenuItem>
          <MenuItem
            icon={<IconPencil size={15} strokeWidth={1.7} />}
            onClick={() => {
              setOpen(false);
              navigate("/new-draft");
            }}
          >
            New draft
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  placeholder,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** A not-yet-built action: visible but inert ("Coming soon"). */
  placeholder?: boolean;
}) {
  if (placeholder) {
    return (
      <span
        role="menuitem"
        aria-disabled
        title="Coming soon"
        className="flex h-9 w-full cursor-default items-center gap-2.5 rounded-lg px-3 text-[12.5px] text-[var(--text-faint)]"
      >
        <span className="opacity-70">{icon}</span>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 text-left text-[12.5px] text-[var(--text-muted)] transition-colors duration-[120ms] hover:bg-[var(--surface)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
    >
      <span className="opacity-85">{icon}</span>
      {children}
    </button>
  );
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */

function HomeSidebar() {
  return (
    <aside className="hidden w-[224px] shrink-0 border-r border-[var(--border)] px-3 py-6 md:block">
      <nav className="flex flex-col gap-0.5">
        {/* All rows but Learn reach real routes inside this layout; Learn is a
            placeholder until its feature lands. */}
        <SidebarLink to="/" end icon={<Home size={15} strokeWidth={1.7} />}>
          Home
        </SidebarLink>
        <SidebarLink to="/workspaces" icon={<IconGrid size={15} strokeWidth={1.7} />}>
          Workspaces
        </SidebarLink>
        <SidebarLink to="/my-projects" icon={<IconFrame size={15} strokeWidth={1.7} />}>
          Projects
        </SidebarLink>
        <SidebarLink to="/drafts" icon={<IconDocument size={15} strokeWidth={1.7} />}>
          Drafts
        </SidebarLink>
        <SidebarLink to="/references" icon={<IconImage size={15} strokeWidth={1.7} />}>
          References
        </SidebarLink>
        <SidebarPlaceholder icon={<IconSparkles size={15} strokeWidth={1.7} />}>
          Learn
        </SidebarPlaceholder>
      </nav>

      <div className="my-3 h-px bg-[var(--border)]" />

      <SidebarLink to="/generate" icon={<IconWand size={15} strokeWidth={1.7} />}>
        Builder
      </SidebarLink>
      <SidebarLink to="/settings" icon={<IconSettings size={15} strokeWidth={1.7} />}>
        Settings
      </SidebarLink>
    </aside>
  );
}

const SIDEBAR_ROW =
  "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors duration-[120ms]";

function SidebarLink({
  to,
  icon,
  children,
  end,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `${SIDEBAR_ROW} no-underline ${
          isActive
            ? "bg-[var(--surface)] text-[var(--text)]"
            : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
        }`
      }
    >
      <span className="opacity-85">{icon}</span>
      {children}
    </NavLink>
  );
}

/** A nav row whose destination is not built yet — visible but inert. */
function SidebarPlaceholder({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      aria-disabled
      title="Coming soon"
      className={`${SIDEBAR_ROW} cursor-default text-[var(--text-faint)]`}
    >
      <span className="opacity-70">{icon}</span>
      {children}
    </span>
  );
}
