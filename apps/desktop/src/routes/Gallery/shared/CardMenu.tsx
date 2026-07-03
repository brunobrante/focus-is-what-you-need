import { useRef, useState, type ReactNode } from "react";
import { useDismissable } from "@/lib/hooks/useDismissable";
import {
  CardMenuDropdown,
  cardMenuPosition,
  type CardMenuItem,
} from "@/components/ui/CardMenuDropdown";

export function CardMenu({
  actions,
}: {
  actions: Array<{
    id: string;
    label: string;
    icon: ReactNode;
    onClick?: () => void;
    menuItems?: CardMenuItem[];
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
                setMenuPosition(cardMenuPosition(e.currentTarget.getBoundingClientRect()));
                setOpenId((current) => (current === a.id ? null : a.id));
                return;
              }
              a.onClick?.();
            }}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            {a.icon}
          </button>
          {a.menuItems && openId === a.id && menuPosition ? (
            <CardMenuDropdown
              menuRef={menuRef}
              position={menuPosition}
              items={a.menuItems}
              onSelect={(item, e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpenId(null);
                setMenuPosition(null);
                item.onClick();
              }}
            />
          ) : null}
        </span>
      ))}
    </div>
  );
}
