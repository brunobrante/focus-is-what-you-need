import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "@/lib/hooks/useDismissable";

export function CardMenu({
  actions,
}: {
  actions: Array<{
    id: string;
    label: string;
    icon: ReactNode;
    onClick?: () => void;
    menuItems?: Array<{
      key: string;
      label: string;
      icon?: ReactNode;
      destructive?: boolean;
      accent?: boolean;
      onClick: () => void;
    }>;
  }>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useDismissable(
    openId !== null,
    () => {
      setOpenId(null);
      setMenuPosition(null);
    },
    [rootRef, menuRef],
  );

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label="Actions"
      className={[
        "pointer-events-none absolute bottom-2 left-1/2 z-[2] inline-flex -translate-x-1/2 translate-y-1.5 items-center gap-0.5 rounded-[10px] border border-[var(--border-strong)] bg-[#161616] p-1 opacity-0 shadow-[var(--shadow-pop)] transition-[opacity,transform] duration-[140ms] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100",
        openId ? "!pointer-events-auto !translate-y-0 !opacity-100" : "",
      ].join(" ")}
    >
      {actions.map((a, i) => (
        <span key={a.id} className="relative inline-flex items-center">
          {i > 0 && <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--border)]" />}
          <button
            type="button"
            aria-label={a.label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (a.menuItems) {
                const rect = e.currentTarget.getBoundingClientRect();
                const width = 176;
                setMenuPosition({
                  top: rect.bottom + 8,
                  left: Math.min(
                    window.innerWidth - width - 8,
                    Math.max(8, rect.right - width),
                  ),
                });
                setOpenId((current) => (current === a.id ? null : a.id));
                return;
              }
              a.onClick?.();
            }}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            {a.icon}
          </button>
          {a.menuItems && openId === a.id && menuPosition ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[80] min-w-44 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1 shadow-[var(--shadow-pop)] backdrop-blur-md"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {a.menuItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpenId(null);
                    setMenuPosition(null);
                    item.onClick();
                  }}
                  className={[
                    "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] transition-colors",
                    item.destructive
                      ? "text-[#ff7373] hover:bg-[rgba(255,80,80,0.12)]"
                      : item.accent
                        ? "hover:bg-[var(--surface-hover)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                  ].join(" ")}
                  style={item.accent ? { color: "#8638E5" } : undefined}
                >
                  {item.icon ? <span className="grid h-4 w-4 place-items-center">{item.icon}</span> : null}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          ) : null}
        </span>
      ))}
    </div>
  );
}
